/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Quote detail page.
 *
 * Two modes, switched on quote.status:
 *   - DRAFT  -> pricing-editable in place. The catering team sets a
 *              unit_price per menu line, optionally tweaks tax + a
 *              delivery fee, and either saves a draft or sends the
 *              quote (status -> sent, which fires the existing
 *              trg_quote_sent_email trigger to queue an email).
 *   - OTHER  -> read-only summary.
 *
 * The team's most common path here is "client submitted a request via
 * the client portal -> price the lines -> send". We keep the
 * read-only view for already-sent / accepted / rejected quotes so
 * historical context is visible.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Calendar, Mail, Users, DollarSign, MapPin, FileText,
  Save, Send, Loader2, Sparkles, AlertTriangle,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { quoteService } from "@/services/quoteService";
import { Quote } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLOURS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-indigo-100 text-indigo-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-amber-100 text-amber-700",
  pending: "bg-amber-100 text-amber-700",
  revised: "bg-orange-100 text-orange-700",
};

const TAX_RATE = 0.15; // 15% VAT in ZA

interface MenuItemRow {
  // Stable id -- menu_item_id when carried in from menu_items, else
  // a generated key so React can reconcile the rows.
  key: string;
  menu_item_id: string | null;
  item_name: string;
  category: string | null;
  dietary_tags: string[] | null;
  quantity: number;
  unit_price: number;
}

function safeNum(n: any): number {
  const v = typeof n === "string" ? parseFloat(n) : Number(n);
  return Number.isFinite(v) ? v : 0;
}

export default function AdminQuoteDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const { toast } = useToast();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Pricing editor state -- only used when the quote is in 'draft'.
  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");

  const isDraft = quote?.status === "draft";

  // Load + hydrate.
  useEffect(() => {
    if (!id || typeof id !== "string") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await quoteService.getQuote(id);
      if (cancelled) return;
      setQuote(data);
      // Seed the pricing editor from the stored menu_items jsonb.
      const raw = (data as any)?.menu_items;
      const arr = Array.isArray(raw) ? raw : [];
      setItems(
        arr.map((m: any, i: number) => ({
          key: m.menu_item_id || `m_${i}`,
          menu_item_id: m.menu_item_id ?? null,
          item_name: m.item_name ?? "",
          category: m.category ?? null,
          dietary_tags: Array.isArray(m.dietary_tags) ? m.dietary_tags : null,
          quantity: safeNum(m.quantity),
          unit_price: safeNum(m.unit_price),
        })),
      );
      setDeliveryFee(safeNum((data as any)?.delivery_fee));
      setDiscount(safeNum((data as any)?.discount_amount));
      setNotes((data as any)?.notes ?? "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Live-computed totals from the editor state. Falls back to the
  // saved totals when the quote isn't a draft (we still display them
  // in the read-only view).
  const computed = useMemo(() => {
    const itemsSubtotal = items.reduce(
      (s, it) => s + it.quantity * it.unit_price,
      0,
    );
    const subtotal = itemsSubtotal + deliveryFee - discount;
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;
    return { itemsSubtotal, subtotal, tax, total };
  }, [items, deliveryFee, discount]);

  const updateItem = (key: string, patch: Partial<MenuItemRow>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const removeItem = (key: string) =>
    setItems((prev) => prev.filter((it) => it.key !== key));

  // Build the persistence payload from the current editor state.
  const buildPayload = () => {
    // Re-emit menu_items in the same shape the rest of the app reads
    // (admin/quotes/new template re-applier, client portal forecast,
    // etc.). Recomputed line_total per row keeps reports accurate.
    const menuItemsJson = items.map((it) => ({
      menu_item_id: it.menu_item_id,
      item_name: it.item_name,
      category: it.category,
      dietary_tags: it.dietary_tags,
      quantity: it.quantity,
      unit_price: it.unit_price,
      line_total: it.quantity * it.unit_price,
    }));
    return {
      menu_items: menuItemsJson,
      subtotal: computed.subtotal,
      tax_amount: computed.tax,
      tax: computed.tax,
      total_amount: computed.total,
      total: computed.total,
      discount_amount: discount,
      notes: notes || null,
    } as any;
  };

  const handleSaveDraft = async () => {
    if (!quote || !id || typeof id !== "string") return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("quotes")
        .update(buildPayload())
        .eq("id", id);
      if (error) throw error;
      const refreshed = await quoteService.getQuote(id);
      setQuote(refreshed);
      toast({ title: "Draft saved", description: "Your changes are stored." });
    } catch (e: any) {
      toast({
        title: "Could not save",
        description: e?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!quote || !id || typeof id !== "string") return;
    if (!quote.client_email) {
      toast({
        title: "No client email",
        description: "Add an email to this quote before sending.",
        variant: "destructive",
      });
      return;
    }
    if (computed.total <= 0) {
      toast({
        title: "Nothing to send",
        description: "Set unit prices on at least one line before sending.",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    try {
      // First persist the latest pricing -- otherwise sending uses the
      // stale figures from before the team last edited.
      const { error: saveErr } = await supabase
        .from("quotes")
        .update({ ...buildPayload(), status: "sent", sent_at: new Date().toISOString() })
        .eq("id", id);
      if (saveErr) throw saveErr;
      const refreshed = await quoteService.getQuote(id);
      setQuote(refreshed);
      toast({
        title: "Quote sent",
        description: `Email queued to ${quote.client_email}.`,
      });
    } catch (e: any) {
      toast({
        title: "Could not send",
        description: e?.message || "Try again, or save the draft and retry.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const isClientRequest = (quote as any)?.external_source === "client_portal_rebook";

  return (
    <>
      <Head>
        <title>Quote Details | CateringMS</title>
      </Head>
      <NoIndexMeta />

      <div className="min-h-screen bg-slate-50">
        <AdminNav />

        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="mb-6">
            <Link href="/admin/quotes">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Quotes
              </Button>
            </Link>
          </div>

          {loading ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="p-12 text-center text-slate-500">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                Loading quote...
              </CardContent>
            </Card>
          ) : !quote ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="p-12 text-center">
                <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-900 mb-2">Quote not found</h2>
                <p className="text-slate-600 mb-6">This quote may have been deleted or never existed.</p>
                <Link href="/admin/quotes">
                  <Button>Back to Quotes</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Header card, client + status + provenance */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <CardTitle className="text-2xl mb-2">{quote.client_name}</CardTitle>
                      <p className="text-sm text-slate-500">
                        Quote {(quote as any).quote_number || `#${quote.id?.slice(0, 8)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={STATUS_COLOURS[quote.status as string] ?? STATUS_COLOURS.draft}>
                        {quote.status}
                      </Badge>
                      {isClientRequest && (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 border">
                          Client portal request
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isDraft && isClientRequest && (
                    <div className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <Sparkles className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-emerald-900">
                          {quote.client_name} sent this request from the client portal.
                        </p>
                        <p className="text-emerald-700 mt-0.5">
                          Set the unit price for each line below, tweak the delivery fee or discount if you need to,
                          then hit "Save & Send" to email the priced quote back.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-start gap-3">
                      <Mail className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Client Email</p>
                        <p className="text-slate-900 font-medium">{quote.client_email || "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Event Date</p>
                        <p className="text-slate-900 font-medium">
                          {quote.event_date ? new Date(quote.event_date).toLocaleDateString() : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Users className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Guests</p>
                        <p className="text-slate-900 font-medium">{quote.guest_count ?? "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Venue</p>
                        <p className="text-slate-900 font-medium">
                          {(quote as any).venue_address || "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Menu items, editable when draft, read-only otherwise */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-lg">Menu items</CardTitle>
                    {isDraft && (
                      <p className="text-xs text-slate-500">
                        Set a unit price for each line. Totals update live.
                      </p>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {items.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No menu items on this quote yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 text-left">
                            <th className="py-2 pr-3">Item</th>
                            <th className="py-2 px-3">Qty</th>
                            <th className="py-2 px-3">Unit price</th>
                            <th className="py-2 px-3 text-right">Line total</th>
                            {isDraft && <th className="py-2 pl-3" />}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => (
                            <tr key={it.key} className="border-t border-slate-100 align-top">
                              <td className="py-3 pr-3">
                                <div className="font-medium text-slate-900">{it.item_name}</div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  {it.category && (
                                    <span className="text-[11px] text-slate-500">{it.category}</span>
                                  )}
                                  {it.dietary_tags?.slice(0, 3).map((t) => (
                                    <span
                                      key={t}
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 capitalize"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="py-3 px-3 w-[110px]">
                                {isDraft ? (
                                  <Input
                                    type="number"
                                    min={0}
                                    inputMode="numeric"
                                    value={it.quantity || ""}
                                    onChange={(e) =>
                                      updateItem(it.key, { quantity: safeNum(e.target.value) })
                                    }
                                    className="h-9"
                                  />
                                ) : (
                                  <span>{it.quantity}</span>
                                )}
                              </td>
                              <td className="py-3 px-3 w-[150px]">
                                {isDraft ? (
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                                      R
                                    </span>
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      inputMode="decimal"
                                      value={it.unit_price || ""}
                                      onChange={(e) =>
                                        updateItem(it.key, { unit_price: safeNum(e.target.value) })
                                      }
                                      className="h-9 pl-6"
                                    />
                                  </div>
                                ) : (
                                  <span>R {it.unit_price.toFixed(2)}</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right font-medium text-slate-900 w-[140px]">
                                R {(it.quantity * it.unit_price).toFixed(2)}
                              </td>
                              {isDraft && (
                                <td className="py-3 pl-3 w-[64px] text-right">
                                  <button
                                    type="button"
                                    className="text-xs text-slate-400 hover:text-rose-600"
                                    onClick={() => removeItem(it.key)}
                                  >
                                    Remove
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Adjustments + totals */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Pricing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-600 block mb-1">Delivery fee</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">R</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={deliveryFee || ""}
                            onChange={(e) => setDeliveryFee(safeNum(e.target.value))}
                            className="h-9 pl-6"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-600 block mb-1">Discount (subtracted before VAT)</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">R</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={discount || ""}
                            onChange={(e) => setDiscount(safeNum(e.target.value))}
                            className="h-9 pl-6"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Items subtotal</span>
                      <span className="font-medium">R {computed.itemsSubtotal.toFixed(2)}</span>
                    </div>
                    {(isDraft ? deliveryFee : safeNum((quote as any).delivery_fee)) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Delivery fee</span>
                        <span className="font-medium">
                          R {(isDraft ? deliveryFee : safeNum((quote as any).delivery_fee)).toFixed(2)}
                        </span>
                      </div>
                    )}
                    {(isDraft ? discount : safeNum((quote as any).discount_amount)) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Discount</span>
                        <span className="font-medium text-rose-600">
                          - R {(isDraft ? discount : safeNum((quote as any).discount_amount)).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Subtotal</span>
                      <span className="font-medium">
                        R {(isDraft ? computed.subtotal : safeNum((quote as any).subtotal)).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">VAT (15%)</span>
                      <span className="font-medium">
                        R {(isDraft ? computed.tax : safeNum((quote as any).tax ?? (quote as any).tax_amount)).toFixed(2)}
                      </span>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div className="flex justify-between text-lg">
                      <span className="font-semibold">Total</span>
                      <span className="font-bold text-green-600 flex items-center gap-1">
                        <DollarSign className="w-5 h-5" />
                        R {(isDraft ? computed.total : safeNum((quote as any).total ?? (quote as any).total_amount)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notes, editable when draft */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Internal notes</CardTitle>
                </CardHeader>
                <CardContent>
                  {isDraft ? (
                    <Textarea
                      rows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notes the client won't see (kitchen prep notes, special instructions, etc.)"
                    />
                  ) : (
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {(quote as any).notes || <span className="text-slate-400 italic">No notes</span>}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Action bar */}
              <div className="flex flex-wrap gap-3">
                <Link href="/admin/quotes" className="flex-1 min-w-[120px]">
                  <Button variant="outline" className="w-full">Back to list</Button>
                </Link>
                {isDraft ? (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1 min-w-[160px]"
                      onClick={handleSaveDraft}
                      disabled={saving || sending}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save draft
                        </>
                      )}
                    </Button>
                    <Button
                      className="flex-1 min-w-[180px] bg-gradient-to-r from-green-600 to-emerald-600"
                      onClick={handleSend}
                      disabled={sending || saving}
                    >
                      {sending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Save & Send
                        </>
                      )}
                    </Button>
                  </>
                ) : quote.status === "accepted" && !(quote as any).converted_to_order_id ? (
                  <Link href={`/admin/orders/new?quoteId=${quote.id}`} className="flex-1 min-w-[180px]">
                    <Button className="w-full bg-gradient-to-r from-green-600 to-emerald-600">
                      <Sparkles className="w-4 h-4 mr-2" />
                      Convert to order
                    </Button>
                  </Link>
                ) : null}
              </div>

              {/* Send-flow shortcuts. Same set as the row buttons on
                  /admin/quotes so the detail page is feature-complete:
                  Mark sent (anchors follow-up timing), Copy link
                  (paste into email / WhatsApp), PDF (browser-native
                  print of the public quote page). */}
              {!isDraft && quote.status !== "accepted" && quote.status !== "rejected" && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const isAlreadySent = !!(quote as any).sent_at;
                      const ok = isAlreadySent
                        ? typeof window !== "undefined" && window.confirm(
                            `Reset the 'sent' timestamp for this quote? Follow-up timing restarts from now.`,
                          )
                        : true;
                      if (!ok) return;
                      const nowIso = new Date().toISOString();
                      const nextStatus = quote.status === "draft" ? "sent" : quote.status;
                      try {
                        const { error } = await (supabase as any)
                          .from("quotes")
                          .update({ sent_at: nowIso, status: nextStatus })
                          .eq("id", id);
                        if (error) throw error;
                        const refreshed = await quoteService.getQuote(id);
                        setQuote(refreshed);
                        toast({
                          title: isAlreadySent ? "Sent timestamp reset" : "Marked as sent",
                          description: isAlreadySent
                            ? "Follow-up timing restarts from now."
                            : "Follow-up timing now anchored to this moment.",
                        });
                      } catch (err: any) {
                        toast({ title: "Could not mark as sent", description: err?.message, variant: "destructive" });
                      }
                    }}
                    title="Anchor follow-up timing -- mark as sent without firing an email"
                    className="gap-1.5"
                  >
                    {(quote as any).sent_at ? "Reset sent timestamp" : "Mark as sent"}
                  </Button>
                  {(quote as any).public_token && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const url = `${window.location.origin}/q/${(quote as any).public_token}`;
                          try {
                            await navigator.clipboard.writeText(url);
                            toast({ title: "Link copied", description: "Paste into email or WhatsApp." });
                          } catch {
                            toast({ title: "Couldn't copy", description: url, variant: "destructive" });
                          }
                        }}
                        className="gap-1.5"
                      >
                        Copy public link
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          window.open(`${window.location.origin}/q/${(quote as any).public_token}?print=1`, "_blank", "noopener");
                        }}
                        className="gap-1.5"
                      >
                        Download PDF
                      </Button>
                    </>
                  )}
                  {(quote as any).sent_at && (
                    <span className="text-[11px] text-slate-500 self-center ml-auto">
                      Sent {new Date((quote as any).sent_at).toLocaleString("en-ZA")}
                    </span>
                  )}
                </div>
              )}

              {!isDraft && quote.status !== "accepted" && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>This quote is no longer in draft. Editing is disabled to preserve history.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <Footer />
      </div>
    </>
  );
}
