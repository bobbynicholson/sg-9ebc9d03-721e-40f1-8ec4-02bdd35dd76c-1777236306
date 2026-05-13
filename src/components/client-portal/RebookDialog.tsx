/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RebookDialog -- the upgraded "Plan another event" form.
 *
 * What changed from the old textarea-only modal:
 *   - Client confirms a NEW event date (defaults to ~4 weeks out, not
 *     the original past date)
 *   - Client picks items from the catering company's actual menu, by
 *     category, with quantities. NO pricing is shown -- the catering
 *     team sends a quote.
 *   - Client adds dietary requirements + notes
 *   - Submit writes a row to `leads` with structured `requested_items`
 *     JSONB the catering team converts into a quote on the admin side.
 *     `source_order_id` links back to the past order for context.
 *
 * Data flow:
 *   Client portal (this dialog)
 *      -> insert leads { ... requested_items, source_order_id ... }
 *         RLS: company_id must equal the caller's company. The
 *         authenticated client already satisfies that.
 *      -> shows up at /{slug}/admin/leads
 *      -> catering team converts the lead to a quote (using the
 *         requested_items as a checklist), prices each line, and the
 *         normal quote workflow takes over.
 *
 * Why no pricing shown to the client:
 *   Catering pricing depends on guest count, distance, equipment,
 *   season, and the catering company's own pricing strategy. Bobby's
 *   rule is the catering team always touches a quote before the
 *   client sees a number.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Loader2,
  RotateCcw,
  Search,
  Plus,
  Minus,
  Calendar as CalendarIcon,
  Users,
  MapPin,
  ChefHat,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddressAutocomplete } from "@/components/admin/AddressAutocomplete";
import { toLocalISO } from "@/lib/localDate";

// ── Types ─────────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  item_name: string;
  description: string | null;
  category: string | null;
  dietary_tags: string[] | null;
  allergen_info: string | null;
}

interface PickedItem {
  menu_item_id: string;
  item_name: string;
  category: string | null;
  dietary_tags: string[] | null;
  quantity: number;
}

export interface RebookSourceOrder {
  id: string;
  event_name: string | null;
  event_date: string;
  guest_count: number | null;
  venue_name: string | null;
  venue_address: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceOrder: RebookSourceOrder | null;
  companyId: string | undefined;
  companyName: string;
  brandPrimary: string;
  brandSecondary: string;
  user: { id: string; email?: string } | null;
  profileFullName?: string | null;
  profilePhone?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────

const ZA_DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

/**
 * Default new-event date: 4 weeks from today. Catering events generally
 * need a few weeks of lead time anyway -- starting from "today" would
 * just trip our advance-notice validation downstream.
 */
function defaultEventDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 28);
  return toLocalISO(d);
}

// ── Component ─────────────────────────────────────────────────────────

export function RebookDialog({
  open,
  onOpenChange,
  sourceOrder,
  companyId,
  companyName,
  brandPrimary,
  brandSecondary,
  user,
  profileFullName,
  profilePhone,
}: Props) {
  const { toast } = useToast();

  // ── Form state ──────────────────────────────────────────────────────
  const [eventDate, setEventDate] = useState<string>(defaultEventDate());
  const [eventTime, setEventTime] = useState<string>("");
  const [eventName, setEventName] = useState<string>("");
  const [guestCount, setGuestCount] = useState<string>("");
  const [venueAddress, setVenueAddress] = useState<string>("");
  // Captured from Google Places when the user picks a suggestion. We
  // pass these through to the lead so the catering company has a
  // routing-ready coordinate without re-geocoding. Optional -- if the
  // user types an address without picking a suggestion, both stay null
  // and the catering team can geocode later.
  const [venueLat, setVenueLat] = useState<number | null>(null);
  const [venueLng, setVenueLng] = useState<number | null>(null);
  const [dietary, setDietary] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // ── Menu loading ────────────────────────────────────────────────────
  const [menuLoading, setMenuLoading] = useState<boolean>(true);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState<string>("");

  // ── Picked items ────────────────────────────────────────────────────
  const [picked, setPicked] = useState<Map<string, PickedItem>>(new Map());

  // ── Submit state ────────────────────────────────────────────────────
  const [sending, setSending] = useState<boolean>(false);

  // Reset / pre-fill when the dialog opens with a new source order.
  useEffect(() => {
    if (!open) return;
    setEventDate(defaultEventDate());
    setEventTime("");
    setEventName(sourceOrder?.event_name || "Repeat event");
    setGuestCount(sourceOrder?.guest_count ? String(sourceOrder.guest_count) : "");
    setVenueAddress(sourceOrder?.venue_address || "");
    setVenueLat(null);
    setVenueLng(null);
    setDietary("");
    setNotes("");
    setSearch("");
    setPicked(new Map());
  }, [open, sourceOrder?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the catering company's menu when the dialog opens. We run
  // this every time it opens (cheap query, ensures fresh data if the
  // caterer just changed something).
  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    (async () => {
      setMenuLoading(true);
      try {
        const { data, error } = await supabase
          .from("menu_items")
          .select("id, item_name, description, category, dietary_tags, allergen_info")
          .eq("company_id", companyId)
          .eq("is_available", true)
          // Some rows have active=null; treat that as available too.
          .or("active.is.null,active.eq.true")
          .order("category", { ascending: true, nullsFirst: false })
          .order("item_name", { ascending: true });
        if (cancelled) return;
        if (error) {
          console.warn("RebookDialog menu fetch error", error.message);
          setMenu([]);
        } else {
          setMenu((data || []) as MenuItem[]);
        }
      } finally {
        if (!cancelled) setMenuLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companyId]);

  // Group + filter menu items.
  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? menu.filter((m) => m.item_name.toLowerCase().includes(q) || (m.category || "").toLowerCase().includes(q))
      : menu;
    const groups = new Map<string, MenuItem[]>();
    for (const item of filtered) {
      const cat = item.category || "Other";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    // Stable category order: Starters > Mains > Sides > Salads > Desserts > Other
    const preferred = ["Starters", "Mains", "Sides", "Salads", "Desserts"];
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      const ai = preferred.indexOf(a);
      const bi = preferred.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return sortedKeys.map((cat) => ({ category: cat, items: groups.get(cat)! }));
  }, [menu, search]);

  // ── Pick handlers ───────────────────────────────────────────────────
  const setQty = (item: MenuItem, qty: number) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (qty <= 0) {
        next.delete(item.id);
      } else {
        next.set(item.id, {
          menu_item_id: item.id,
          item_name: item.item_name,
          category: item.category,
          dietary_tags: item.dietary_tags,
          quantity: qty,
        });
      }
      return next;
    });
  };
  const incQty = (item: MenuItem) =>
    setQty(item, (picked.get(item.id)?.quantity ?? 0) + 1);
  const decQty = (item: MenuItem) =>
    setQty(item, (picked.get(item.id)?.quantity ?? 0) - 1);

  const pickedCount = picked.size;

  // ── Submit ──────────────────────────────────────────────────────────
  const canSubmit =
    !!eventDate &&
    !!user &&
    !!companyId &&
    !sending;

  const submit = async () => {
    if (!canSubmit || !user || !companyId) return;
    setSending(true);
    try {
      // Compose a human-readable notes summary so the catering team
      // sees the gist of the request even if they look at the quote
      // in a tool that doesn't render JSON.
      const noteParts: string[] = [];
      noteParts.push(`Quote request via client portal.`);
      if (sourceOrder) {
        noteParts.push(
          `Rebook from past event "${sourceOrder.event_name || "Past event"}" on ${new Date(
            sourceOrder.event_date,
          ).toLocaleDateString("en-ZA", ZA_DATE_OPTS)}.`,
        );
      }
      if (dietary.trim()) noteParts.push(`Dietary: ${dietary.trim()}.`);
      if (notes.trim()) noteParts.push(`Client note: ${notes.trim()}`);

      // Map picked items into the shape that quotes.menu_items jsonb
      // already uses (the admin /quotes/new page reads this same
      // shape via Array.isArray(q.menu_items)). unit_price + line_total
      // are zero -- the catering team prices each line in the quote
      // editor before sending.
      const menuItemsJson = Array.from(picked.values()).map((p) => ({
        menu_item_id: p.menu_item_id,
        item_name: p.item_name,
        category: p.category,
        dietary_tags: p.dietary_tags,
        quantity: p.quantity,
        unit_price: 0,
        line_total: 0,
      }));

      // Quote number format mirrors the existing convention
      // (QT-YYYYMMDD-NNN) but uses REQ- so the catering team can spot
      // client-driven requests at a glance in the quotes list.
      const today = toLocalISO(new Date()).replace(/-/g, "");
      const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
      const quoteNumber = `REQ-${today}-${rand}`;

      // Try to attach to an existing clients row for this user (so the
      // quote is properly linked to their record). Best-effort -- if
      // there's no clients row yet, the quote still goes through with
      // just the email.
      let clientId: string | null = null;
      try {
        const { data: clientRow } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .eq("company_id", companyId)
          .maybeSingle();
        clientId = (clientRow as any)?.id ?? null;
      } catch {
        // non-fatal -- proceed without a client_id link
      }

      // Direct insert into quotes. RLS allows it because the client's
      // profile.company_id matches NEW.company_id (policy: "Users can
      // insert quotes for their company"). Status stays 'draft', so
      // none of the dispatch/email triggers fire -- the catering team
      // reviews, prices, then changes status to 'sent'.
      const insertPayload: any = {
        company_id: companyId,
        quote_number: quoteNumber,
        quote_name: eventName.trim() || "Quote request",
        status: "draft",
        external_source: "client_portal_rebook",
        client_id: clientId,
        client_name: profileFullName || user.email || "Client portal",
        client_email: user.email,
        event_date: eventDate,
        guest_count: guestCount ? parseInt(guestCount, 10) || null : null,
        venue_address: venueAddress.trim() || null,
        venue_lat: venueLat,
        venue_lng: venueLng,
        // Pricing intentionally zero -- catering team prices each
        // line before sending. Marked NOT NULL on the table so we
        // can't omit them.
        subtotal: 0,
        total_amount: 0,
        tax_amount: 0,
        total: 0,
        menu_items: menuItemsJson.length > 0 ? menuItemsJson : null,
        notes: noteParts.join(" "),
      };

      const { data: insertedQuote, error } = await supabase
        .from("quotes")
        .insert(insertPayload)
        .select("id")
        .single();
      if (error) throw error;

      // Flow audit Leg B P0-8: rebook + portal-quote requests landed
      // straight into `quotes` but never inserted a `leads` row, so the
      // lead-source funnel + lead-source-conversion analytics had a
      // permanent blind spot for inbound client-portal demand. Repeat
      // customers showed up only as draft quotes with no rebook
      // attribution. Insert a matching lead now, marked already-quoted
      // so the funnel counts it as a closed-loop conversion and not as
      // an unanswered enquiry.
      try {
        const leadPayload: any = {
          company_id: companyId,
          email: user.email || "",
          client_email: user.email || "",
          contact_name: profileFullName || user.email || "Client portal",
          client_name: profileFullName || user.email || "Client portal",
          phone: profilePhone || null,
          client_phone: profilePhone || null,
          event_date: eventDate,
          guest_count: guestCount ? parseInt(guestCount, 10) || null : null,
          venue_address: venueAddress.trim() || null,
          venue_lat: venueLat,
          venue_lng: venueLng,
          requested_items: menuItemsJson.length > 0 ? menuItemsJson : null,
          source: sourceOrder ? "client_portal_rebook" : "client_portal_request",
          source_order_id: sourceOrder?.id ?? null,
          status: "quoted",
          converted_at: new Date().toISOString(),
          notes: noteParts.join(" "),
          special_requests: dietary.trim() || null,
          user_id: user.id,
        };
        await supabase.from("leads").insert(leadPayload);
      } catch (leadErr) {
        // Lead insert is for analytics only -- the operator already has
        // the draft quote, so don't fail the dialog if RLS or a missing
        // field rejects the lead row.
        console.warn("[RebookDialog] lead capture failed (non-blocking):", leadErr);
      }

      toast({
        title: "Request sent",
        description: `${companyName || "The team"} will price your request and send the quote shortly.`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Could not send request",
        description: e?.message || "Try again, or call the catering company directly.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

  const brandGradient = `linear-gradient(135deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Branded header */}
        <div className="px-6 pt-6 pb-5 text-white" style={{ background: brandGradient }}>
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="flex items-center gap-2 text-white">
              <RotateCcw className="w-5 h-5" />
              Plan another event
            </DialogTitle>
            <DialogDescription className="text-white/85">
              Pick the items you'd like and we'll send your details to{" "}
              <strong className="text-white">{companyName}</strong> for a fresh quote.
              No pricing yet, the team will price it for you.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* ── Event details ─────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-slate-500" />
              Event details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="rb-date" className="text-xs text-slate-600">Date</Label>
                <Input
                  id="rb-date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  min={toLocalISO(new Date())}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rb-time" className="text-xs text-slate-600">Start time (optional)</Label>
                <Input
                  id="rb-time"
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="rb-name" className="text-xs text-slate-600">Event type or name</Label>
                <Input
                  id="rb-name"
                  type="text"
                  placeholder="e.g. Birthday lunch, year-end function"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rb-guests" className="text-xs text-slate-600 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Guest count
                </Label>
                <Input
                  id="rb-guests"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="e.g. 60"
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rb-venue" className="text-xs text-slate-600 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Venue
                </Label>
                <AddressAutocomplete
                  id="rb-venue"
                  value={venueAddress}
                  placeholder="Start typing the address..."
                  countryCode="za"
                  onChange={(pick) => {
                    setVenueAddress(pick.address);
                    setVenueLat(pick.lat);
                    setVenueLng(pick.lng);
                  }}
                />
              </div>
            </div>
          </section>

          {/* ── Menu picker ───────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-slate-500" />
                Menu items
                {pickedCount > 0 && (
                  <Badge
                    className="text-[10px] px-2 h-5 ml-1 text-white border-0"
                    style={{ background: brandGradient }}
                  >
                    {pickedCount} chosen
                  </Badge>
                )}
              </h3>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
                <Input
                  className="pl-8 h-9 text-sm"
                  placeholder="Search menu..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {menuLoading ? (
              <div className="py-10 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                <p className="text-xs text-slate-500 mt-2">Loading menu...</p>
              </div>
            ) : menu.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
                The team hasn't published a menu in the portal yet, pop a note in the box below
                and they'll come back with options.
              </div>
            ) : filteredGrouped.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">No menu items match "{search}".</p>
            ) : (
              <div className="space-y-4">
                {filteredGrouped.map((group) => (
                  <div key={group.category} className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {group.category}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        const qty = picked.get(item.id)?.quantity ?? 0;
                        const isPicked = qty > 0;
                        return (
                          <div
                            key={item.id}
                            className={`rounded-xl border p-3 transition ${
                              isPicked
                                ? "border-transparent ring-2"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                            style={isPicked ? { borderColor: brandPrimary, ["--tw-ring-color" as any]: brandPrimary + "40" } : undefined}
                          >
                            <div className="flex items-start justify-between gap-2 min-w-0">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-900 truncate">
                                  {item.item_name}
                                </div>
                                {item.description && (
                                  <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                                    {item.description}
                                  </div>
                                )}
                                {item.dietary_tags && item.dietary_tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {item.dietary_tags.slice(0, 4).map((t) => (
                                      <Badge
                                        key={t}
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0 h-4 bg-slate-50 border-slate-200 text-slate-600 capitalize"
                                      >
                                        {t}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {/* Quantity control */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {isPicked && (
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7"
                                    onClick={() => decQty(item)}
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {isPicked && (
                                  <span className="text-sm font-semibold w-5 text-center" style={{ color: brandPrimary }}>
                                    {qty}
                                  </span>
                                )}
                                <Button
                                  type="button"
                                  size="icon"
                                  variant={isPicked ? "outline" : "default"}
                                  className="h-7 w-7"
                                  style={
                                    isPicked
                                      ? undefined
                                      : { background: brandGradient, color: "white", border: 0 }
                                  }
                                  onClick={() => incQty(item)}
                                  title={isPicked ? "Add one more" : "Add to request"}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Notes ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Anything else?</h3>
            <div className="space-y-2">
              <Label htmlFor="rb-dietary" className="text-xs text-slate-600">
                Dietary requirements (allergies, vegetarian/vegan, halaal, etc.)
              </Label>
              <Textarea
                id="rb-dietary"
                rows={2}
                placeholder="e.g. 5 vegetarian guests, 1 nut allergy"
                value={dietary}
                onChange={(e) => setDietary(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rb-notes" className="text-xs text-slate-600">
                Anything else the team should know
              </Label>
              <Textarea
                id="rb-notes"
                rows={3}
                placeholder="e.g. need set-up by 12:00, parking limited at the venue, kids menu for 10..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </section>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0 flex flex-row gap-2 justify-between sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-slate-600"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            <X className="w-4 h-4 mr-1.5" />
            Cancel
          </Button>
          <Button
            type="button"
            className="text-white border-0"
            style={{ background: brandGradient }}
            onClick={submit}
            disabled={!canSubmit}
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {pickedCount > 0 ? `Send request (${pickedCount} item${pickedCount === 1 ? "" : "s"})` : "Send request"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
