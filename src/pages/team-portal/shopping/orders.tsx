import { useState, useEffect, useMemo, useRef } from "react";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ShoppingCart, Loader2, Plus, Check, ListChecks, Calendar, Clock, Users as UsersIcon, Receipt, MapPin, Camera, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { PortalShell, PortalHeader, PortalCard, StatTile } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toLocalISO } from "@/lib/localDate";
import { getShoppingCostVariance, formatShoppingVariance, parseMoneyInput } from "@/lib/shopping/completionRules";
import { updateShoppingListWithReceiptStatus } from "@/lib/shopping/receiptStatus";
import { recordShoppingCostVariance } from "@/services/shoppingCompletionService";

interface ShoppingList {
  id: string;
  list_date: string | null;
  status: string | null;
  shopper_id: string | null;
  receipt_url: string | null;
  no_receipt_reason: string | null;
  notes: string | null;
  title: string | null;
  estimated_total: number | null;
  actual_total: number | null;
  created_at: string | null;
}

interface Order {
  id: string;
  order_number: string | null;
  event_name: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  status: string | null;
  /** Venue address gives the shopper a sense of how far the kitchen is
   *  from the event, useful when the same shopping list might be split
   *  between branches. Surfaced inline on each upcoming-event card. */
  venue_address?: string | null;
  client_name?: string | null;
}

// Semantic status tones. Keys stay load-bearing (don't drop a status),
// but the palette is restrained: amber carries active/in-progress work,
// emerald = done/ready, rose = cancelled. "confirmed" is not a true info
// state here, so it reads as a neutral slate tint rather than blue - one
// fewer colour competing for the shopper's eye. Subtle tints only.
const NEUTRAL_TONE =
  "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
const AMBER_TONE =
  "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60";
const EMERALD_TONE =
  "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60";
const ROSE_TONE =
  "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60";

const listStatusTone: Record<string, string> = {
  draft:        NEUTRAL_TONE,
  pending:      AMBER_TONE,
  in_progress:  AMBER_TONE,
  shopping:     AMBER_TONE,
  completed:    EMERALD_TONE,
  cancelled:    ROSE_TONE,
};

const orderStatusTone: Record<string, string> = {
  pending:    AMBER_TONE,
  confirmed:  NEUTRAL_TONE,
  preparing:  AMBER_TONE,
  ready:      EMERALD_TONE,
};

export default function ShoppingOrdersPage() {
  const { user } = useAuth();
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  // TIGHTEN I.119 (2026-06-02): refetch when an order edit lands in any tab.
  const refreshSignal = useOrderRefreshSignal(user?.company_id ?? null);

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [upcomingOrders, setUpcomingOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"lists" | "upcoming">("lists");

  const [creating, setCreating] = useState(false);
  const [listDate, setListDate] = useState(toLocalISO(new Date()));
  const [listNotes, setListNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Phase 7 #7: complete-with-receipt dialog. The shopper picks
  // a slip photo when they finish a list, mirroring the driver's
  // POD flow on delivered orders. The url lands on shopping_lists.
  // receipt_url and the existing badge surfaces it on the list.
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [actualTotal, setActualTotal] = useState<string>("");
  const [noReceiptReason, setNoReceiptReason] = useState("");
  const [completing, setCompleting] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id, refreshSignal]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const [listsRes, ordersRes] = await Promise.all([
        supabase
          .from("shopping_lists")
          .select("*")
          .eq("company_id", user.company_id)
          .order("list_date", { ascending: false })
          .limit(50)
          .returns<ShoppingList[]>(),
        supabase
          .from("orders")
          .select("id, order_number, event_name, event_date, event_time, guest_count, status, venue_address, client_name")
          .eq("company_id", user.company_id)
          .gte("event_date", toLocalISO(new Date()))
          .in("status", ["pending", "confirmed", "preparing"])
          .order("event_date", { ascending: true })
          .limit(50)
          .returns<Order[]>(),
      ]);
      setLists(listsRes.data || []);
      setUpcomingOrders(ordersRes.data || []);
    } catch (e) {
      toast({ title: "Could not load orders", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const totalLists = lists.length;
    const open = lists.filter((l) => l.status !== "completed" && l.status !== "cancelled").length;
    const upcoming = upcomingOrders.length;
    return { totalLists, open, upcoming };
  }, [lists, upcomingOrders]);

  const openCreate = () => {
    setCreating(true);
    setListDate(toLocalISO(new Date()));
    setListNotes("");
  };
  const closeCreate = () => setCreating(false);

  const saveCreate = async () => {
    if (!user?.id || !user?.company_id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("shopping_lists").insert([{
        company_id: user.company_id,
        user_id: user.id,
        shopper_id: user.id,
        list_date: listDate,
        status: "pending",
        notes: listNotes.trim() || null,
      }] as never);
      if (error) throw error;
      toast({ title: "Shopping list created" });
      closeCreate();
      load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const claimList = async (id: string) => {
    if (!user?.id) return;
    try {
      await supabase.from("shopping_lists").update({
        shopper_id: user.id,
        status: "in_progress",
      }).eq("id", id);
      toast({ title: "List claimed" });
      load();
    } catch {
      toast({ title: "Could not claim", variant: "destructive" });
    }
  };

  const openComplete = (id: string) => {
    setCompletingId(id);
    setReceiptFile(null);
    setReceiptPreview(null);
    setActualTotal("");
    setNoReceiptReason("");
  };
  const closeComplete = () => {
    setCompletingId(null);
    setReceiptFile(null);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(null);
    setActualTotal("");
    setNoReceiptReason("");
  };
  const onReceiptPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setReceiptFile(f);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(f ? URL.createObjectURL(f) : null);
  };
  const completingList = useMemo(
    () => lists.find((l) => l.id === completingId) || null,
    [lists, completingId],
  );
  const parsedActualTotal = parseMoneyInput(actualTotal);
  const completionVariance = getShoppingCostVariance(
    completingList?.estimated_total,
    parsedActualTotal,
  );
  const completeList = async () => {
    if (!completingId) return;
    const reason = noReceiptReason.trim();
    if (actualTotal.trim() && (parsedActualTotal == null || parsedActualTotal < 0)) {
      toast({ title: "Enter a valid total", variant: "destructive" });
      return;
    }
    if (!receiptFile && !completingList?.receipt_url && !reason) {
      toast({
        title: "Receipt status required",
        description: "Attach a receipt photo or enter a no-receipt reason.",
        variant: "destructive",
      });
      return;
    }
    setCompleting(true);
    try {
      let receipt_url: string | null = null;
      if (receiptFile) {
        // Reuse the imports bucket - it's the only one with a
        // receipt-style policy already in place. Path-prefix the
        // file so the shopping artefacts are easy to find later.
        const ext = (receiptFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `shopping-list-receipts/${completingId}/receipt-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("imports")
          .upload(path, receiptFile, {
            upsert: true,
            contentType: receiptFile.type || "image/jpeg",
          });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("imports").getPublicUrl(path);
        receipt_url = pub.publicUrl;
      }
      const updates: Record<string, any> = {
        status: "completed",
        no_receipt_reason: receipt_url || completingList?.receipt_url ? null : reason,
      };
      if (receipt_url) updates.receipt_url = receipt_url;
      if (parsedActualTotal != null) updates.actual_total = parsedActualTotal;
      const { error } = await updateShoppingListWithReceiptStatus(supabase as any, completingId, updates, {
        existingNotes: completingList?.notes,
        noReceiptReason: reason,
      });
      if (error) throw error;
      await recordShoppingCostVariance({
        sb: supabase as any,
        companyId: user?.company_id,
        userId: user?.id,
        listId: completingId,
        listTitle: completingList?.title || "Shopping list",
        estimatedTotal: completingList?.estimated_total,
        actualTotal: parsedActualTotal,
      });
      toast({
        title: "List completed",
        description: receipt_url ? "Receipt attached." : "Receipt status captured.",
      });
      closeComplete();
      load();
    } catch (e: any) {
      toast({
        title: "Could not complete",
        description: e?.message || "Upload or update failed.",
        variant: "destructive",
      });
    } finally {
      setCompleting(false);
    }
  };

  const fmtTime = (t?: string | null) => t ? t.slice(0, 5) : "TBC";

  return (
    <>
      <Head><title>Active shop - CateringMS</title></Head>
      <NoIndexMeta />
      <ShoppingNav />
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Active shop"
            subtitle="Open team shopping lists, what is still left to buy, and upcoming events that need procurement."
            icon={ShoppingCart}
            actions={
              <Button onClick={openCreate} className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
                <Plus className="h-4 w-4 mr-2" />Create list
              </Button>
            }
          />

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <StatTile
              label={<span className="flex items-center gap-1">Open lists <InfoTooltip content="Shopping lists that haven't been finished off or cancelled yet." /></span>}
              value={stats.open}
              icon={ListChecks}
            />
            <StatTile
              label={<span className="flex items-center gap-1">Total lists <InfoTooltip content="Every shopping list, no matter the status.\n\nWe show the most recent 50." /></span>}
              value={stats.totalLists}
              icon={Receipt}
            />
            <StatTile
              label={<span className="flex items-center gap-1">Upcoming events <InfoTooltip content="Confirmed or pending orders happening today or later." /></span>}
              value={stats.upcoming}
              icon={Calendar}
            />
          </div>

          <div
            role="tablist"
            aria-label="Shopping view"
            className="inline-flex gap-1 mb-5 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
          >
            <button
              role="tab"
              aria-selected={tab === "lists"}
              onClick={() => setTab("lists")}
              className={`inline-flex items-center gap-2 px-3.5 h-9 rounded-lg text-sm font-medium transition-[color,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 ${
                tab === "lists"
                  ? "bg-amber-600 text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <ListChecks className="h-4 w-4" />Shopping lists
            </button>
            <button
              role="tab"
              aria-selected={tab === "upcoming"}
              onClick={() => setTab("upcoming")}
              className={`inline-flex items-center gap-2 px-3.5 h-9 rounded-lg text-sm font-medium transition-[color,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 ${
                tab === "upcoming"
                  ? "bg-amber-600 text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Calendar className="h-4 w-4" />Upcoming events
            </button>
          </div>

          {loading ? (
            tab === "lists" ? (
              <PortalCard padded={false}>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[0, 1, 2, 3].map((i) => (
                    <li key={i} className="p-5 flex items-center gap-3 motion-safe:animate-pulse">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800" />
                          <div className="h-4 w-16 rounded-full bg-slate-200 dark:bg-slate-800" />
                        </div>
                        <div className="h-3 w-40 rounded bg-slate-100 dark:bg-slate-800/70" />
                      </div>
                      <div className="h-8 w-24 rounded-lg bg-slate-200 dark:bg-slate-800 flex-shrink-0" />
                    </li>
                  ))}
                </ul>
              </PortalCard>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <PortalCard key={i}>
                    <div className="space-y-2 motion-safe:animate-pulse">
                      <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
                      <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800/70" />
                      <div className="h-3 w-52 rounded bg-slate-100 dark:bg-slate-800/70" />
                    </div>
                  </PortalCard>
                ))}
              </div>
            )
          ) : tab === "lists" ? (
            lists.length === 0 ? (
              <PortalCard className="text-center py-16">
                <div className="w-12 h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <ListChecks className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="font-semibold text-slate-900 dark:text-white">No shopping lists yet</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto">Start a list before a procurement run to track what you buy and attach the till slip when you&apos;re done.</p>
                <Button onClick={openCreate} className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg mt-5">
                  <Plus className="h-4 w-4 mr-2" />New shopping list
                </Button>
              </PortalCard>
            ) : (
              <PortalCard padded={false}>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lists.map((l) => (
                    <li key={l.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/50 first:rounded-t-2xl last:rounded-b-2xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{l.list_date ?? "Undated list"}</span>
                          {l.status && (
                            <Badge variant="outline" className={`${listStatusTone[l.status] ?? NEUTRAL_TONE} text-xs capitalize`}>
                              {l.status.replace("_", " ")}
                            </Badge>
                          )}
                          {l.receipt_url && (
                            <Badge variant="outline" className={`${EMERALD_TONE} text-xs flex items-center gap-1`}>
                              <Receipt className="h-3 w-3" />Receipt attached
                            </Badge>
                          )}
                        </div>
                        {l.notes && <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">{l.notes}</p>}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                          {l.estimated_total != null && <span>Est. R {Number(l.estimated_total).toFixed(2)}</span>}
                          {l.actual_total != null && <span className="text-slate-700 dark:text-slate-200 font-medium">Actual R {Number(l.actual_total).toFixed(2)}</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {l.status !== "completed" && !l.shopper_id && (
                          <Button size="sm" variant="outline" onClick={() => claimList(l.id)} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">Claim</Button>
                        )}
                        {l.status !== "completed" && (
                          <Button size="sm" onClick={() => openComplete(l.id)} className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
                            <Check className="h-4 w-4 mr-1" />Complete
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </PortalCard>
            )
          ) : (
            upcomingOrders.length === 0 ? (
              <PortalCard className="text-center py-16">
                <div className="w-12 h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="font-semibold text-slate-900 dark:text-white">No upcoming events</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto">Once orders are confirmed or pending for today or later, they appear here so you can shop for them.</p>
              </PortalCard>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {upcomingOrders.map((o) => (
                  <PortalCard key={o.id} className="transition-colors duration-150 hover:border-amber-300 dark:hover:border-amber-700">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {/* ODOC G.5: tap event title to open the
                            full order doc with shopping section
                            auto-expanded - shortfalls + push-to-
                            shopping CTA all live there. */}
                        <Link
                          href={withSlug(staffOrderHref(o.id, "shopping_staff"))}
                          className="font-semibold text-slate-900 dark:text-white truncate hover:text-amber-700 dark:hover:text-amber-400 hover:underline inline-flex items-center gap-1 transition-colors duration-150"
                        >
                          {o.event_name ?? o.order_number ?? "Event"}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </Link>
                        {o.client_name && (
                          <div className="text-xs text-slate-600 dark:text-slate-400 truncate">{o.client_name}</div>
                        )}
                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3 text-slate-400 dark:text-slate-500" />{o.event_date}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-slate-400 dark:text-slate-500" />{fmtTime(o.event_time)}</span>
                          {o.guest_count != null && <span className="flex items-center gap-1"><UsersIcon className="h-3 w-3 text-slate-400 dark:text-slate-500" />{o.guest_count}</span>}
                        </div>
                        {/* Venue inline so the shopper knows where this
                            event lands - useful when the kitchen is
                            splitting purchases between branches. */}
                        {o.venue_address && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                            <span className="truncate">{o.venue_address}</span>
                          </p>
                        )}
                      </div>
                      {o.status && (
                        <Badge variant="outline" className={`${orderStatusTone[o.status] ?? NEUTRAL_TONE} text-xs capitalize flex-shrink-0`}>
                          {o.status}
                        </Badge>
                      )}
                    </div>
                  </PortalCard>
                ))}
              </div>
            )
          )}
        </PortalShell>
      </div>

      <Dialog open={creating} onOpenChange={(o) => !o && closeCreate()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New shopping list</DialogTitle>
            <DialogDescription>Start a list for a procurement run</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ld">Date</Label>
              <Input id="ld" type="date" value={listDate} onChange={(e) => setListDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ln">Notes</Label>
              <Textarea id="ln" rows={3} value={listNotes} onChange={(e) => setListNotes(e.target.value)} placeholder="What's this list for? e.g. 'Saturday wedding 200 pax'" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreate} disabled={saving} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">Cancel</Button>
            <Button onClick={saveCreate} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Create list"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 7 #7: complete-with-receipt dialog. Mirrors the
          driver POD flow - the shopper closes out the list with
          a photo of the supplier slip plus the actual cash total
          paid so reconciliation against the till stays honest. */}
      <Dialog open={completingId !== null} onOpenChange={(o) => !o && closeComplete()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete shopping list</DialogTitle>
            <DialogDescription>
              Snap the till slip and capture the actual amount paid. A receipt or no-receipt reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="actual_total">Actual total paid (R)</Label>
              <Input
                id="actual_total"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 1 248.50"
                value={actualTotal}
                onChange={(e) => setActualTotal(e.target.value)}
              />
            </div>
            {completionVariance?.shouldFlag && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <InfoTooltip content="Admins are notified because the actual spend is more than 15% away from the estimate." />
                  <p>
                    Actual spend is {formatShoppingVariance(completionVariance)} estimate; admins will be notified when this list closes.
                  </p>
                </div>
              </div>
            )}
            <div>
              <Label>Receipt photo</Label>
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onReceiptPicked}
                className="hidden"
              />
              {receiptPreview ? (
                <div className="relative mt-1 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <img src={receiptPreview} alt="Receipt preview" className="w-full max-h-64 object-contain bg-slate-50 dark:bg-slate-800" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 bg-white/80 hover:bg-white dark:bg-slate-900/80 dark:hover:bg-slate-900"
                    onClick={() => {
                      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
                      setReceiptFile(null);
                      setReceiptPreview(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="mt-1 w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
                  onClick={() => receiptInputRef.current?.click()}
                  type="button"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Take photo or pick file
                </Button>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5">
                Required unless a no-receipt reason is entered. Goes into the imports bucket and surfaces on the list as a receipt-attached badge.
              </p>
            </div>
            {!receiptFile && !completingList?.receipt_url && (
              <div>
                <Label htmlFor="orders_no_receipt_reason">No receipt reason</Label>
                <Textarea
                  id="orders_no_receipt_reason"
                  value={noReceiptReason}
                  onChange={(e) => setNoReceiptReason(e.target.value)}
                  placeholder="Supplier did not provide a slip, till offline, cash purchase, etc."
                  className="min-h-[84px]"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeComplete} disabled={completing} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
              Cancel
            </Button>
            <Button
              onClick={completeList}
              disabled={completing}
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
            >
              {completing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : <><Check className="h-4 w-4 mr-2" />Mark complete</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
