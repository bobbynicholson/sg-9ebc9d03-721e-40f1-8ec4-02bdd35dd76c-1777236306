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
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import Link from "next/link";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Calendar, Mail, Users, DollarSign, MapPin, FileText,
  Save, Send, Loader2, Sparkles, AlertTriangle, ArrowRight, Pencil,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { quoteService } from "@/services/quoteService";
import { Quote } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import { formatLocalDate } from "@/lib/localFormat";
import { useToast } from "@/hooks/use-toast";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { resolveBranchSettings } from "@/services/branchSettingsService";
import { QuoteSendDialog } from "@/components/billing/QuoteSendDialog";
import { ChangeRequestPanel, ChangeReq } from "@/components/admin/quotes/ChangeRequestPanel";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { describeQuoteEditImpact } from "@/services/quote/propagateQuoteEdit";
import { breakdownFromLineSum } from "@/lib/vatMath";
import { usePricingMode } from "@/hooks/usePricingMode";

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

// VAT rate now resolves per-tenant (regions override -> companies
// default -> 15% hard fallback) - see resolveBranchSettings. The
// previous `const TAX_RATE = 0.15` was hardcoded and silently applied
// 15% to every UK / US / non-VAT-registered quote saved from this page.

interface MenuItemRow {
  // Stable id - menu_item_id when carried in from menu_items, else
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

function AdminQuoteDetailInner() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const { toast } = useToast();
  // Wave 27: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Send-dialog state. Mirrors the list-page pattern: clicking "Save &
  // Send" no longer fires the email immediately. We save the latest
  // pricing as a draft, then open the review-before-send composer so
  // the operator can read + edit the resolved template, then click
  // Send inside the dialog. Avoids the legacy save-and-fire coupling
  // where a status flip to 'sent' through quoteService.updateQuote
  // triggered _fireQuoteSentEmail behind the scenes with no preview.
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  // Wave 51 - propagation confirmation modal. When the linked order
  // is past acceptance and the operator changes a load-bearing field
  // (event_date, event_time, guest_count, total, menu, equipment),
  // we surface the cascade impacts before save commits.
  const [propagateImpactOpen, setPropagateImpactOpen] = useState(false);
  const [propagateImpacts, setPropagateImpacts] = useState<string[]>([]);
  const [pendingSaveAction, setPendingSaveAction] = useState<"draft" | "send" | null>(null);
  const [linkedOrderForImpact, setLinkedOrderForImpact] = useState<any>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const companyId =
    ((user as any)?.user_metadata?.company_id as string | undefined) ||
    ((user as any)?.company_id as string | undefined) ||
    null;

  // Tenant-aware currency + VAT rate. Audit (May 2026) found this page
  // was hardcoded to "R" + 15% VAT, silently corrupting totals on UK /
  // US tenants and on non-VAT-registered ZA tenants every time a draft
  // saved from here was reopened.
  const tenantCurrency = useTenantCurrency(companyId);
  const fmtMoney = tenantCurrency.format;
  const [taxRate, setTaxRate] = useState(0.15);
  const [vatRegistered, setVatRegistered] = useState(true);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const branch = await resolveBranchSettings(companyId, null);
        if (!cancelled) {
          setVatRegistered(branch.vatRegistered);
          setTaxRate(branch.vatRegistered ? Number(branch.vatRate) : 0);
        }
      } catch (e) {
        console.warn("[quotes/[id]] branch settings load failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // Pricing editor state - only used when the quote is in 'draft'.
  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");

  // Client change-requests against this quote. Loaded after the quote
  // resolves so we can scope by quote_id. Inserts come from the public
  // /q/[token] view via the service-role API route; this page handles
  // mark-as-addressed / dismiss / reply. Type is exported from the
  // sticky panel component so we share one shape between page + panel.
  const [changeRequests, setChangeRequests] = useState<ChangeReq[]>([]);
  const [changeReqUpdatingId, setChangeReqUpdatingId] = useState<string | null>(null);

  // Deep-link state. The bell-notification href looks like
  // `/admin/quotes/{id}#change-requests` and may also carry a
  // ?change_request_id={id} so the operator's eye lands on the
  // specific request that fired the alert. We capture both on first
  // mount so they survive subsequent re-renders without flickering.
  const [highlightChangeReqId, setHighlightChangeReqId] = useState<string | null>(null);
  const [forcePanelOpen, setForcePanelOpen] = useState<boolean>(false);

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

  // Lazy-load tenant company name for the send dialog so the resolved
  // email body says "Spit Braai Delivery" rather than the generic
  // fallback. One read per page visit, cancellable.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("companies")
        .select("company_name")
        .eq("id", companyId)
        .maybeSingle();
      if (!cancelled && data?.company_name) setTenantName(data.company_name);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // Load change requests once the quote id is known. Fetches everything
  // (pending + addressed + dismissed) so the operator has the full
  // history visible. Tiny query, no pagination needed.
  useEffect(() => {
    if (!id || typeof id !== "string") return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("quote_change_requests")
        .select("id, message, requested_changes, status, submitter_name, addressed_at, created_at")
        .eq("quote_id", id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setChangeRequests((data as ChangeReq[]) || []);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Deep-link capture. Runs once on mount so a subsequent setState or
  // route swap doesn't blank the highlight. We read the raw URL (not
  // router.query) because the hash isn't part of router.query and the
  // query string is also accessible synchronously here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const wantsAnchor = url.hash === "#change-requests";
    const reqId = url.searchParams.get("change_request_id");
    if (wantsAnchor || reqId) {
      setForcePanelOpen(true);
    }
    if (reqId) setHighlightChangeReqId(reqId);
  }, []);

  // Once the data lands, scroll the panel into view if the URL asked
  // us to. The browser's default scroll-to-anchor fires before the
  // panel is in the DOM since it depends on the async fetch above.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!forcePanelOpen) return;
    if (changeRequests.length === 0) return;
    const el = document.getElementById("change-requests");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [changeRequests, forcePanelOpen]);

  const updateChangeRequestStatus = async (
    reqId: string,
    nextStatus: "addressed" | "dismissed",
  ) => {
    setChangeReqUpdatingId(reqId);
    try {
      const patch: Record<string, any> = { status: nextStatus };
      if (nextStatus === "addressed") {
        patch.addressed_at = new Date().toISOString();
        patch.addressed_by = user?.id ?? null;
      }
      const { error } = await (supabase as any)
        .from("quote_change_requests")
        .update(patch)
        .eq("id", reqId);
      if (error) throw error;
      setChangeRequests((prev) =>
        prev.map((r) =>
          r.id === reqId
            ? { ...r, status: nextStatus, addressed_at: patch.addressed_at ?? r.addressed_at }
            : r,
        ),
      );
      toast({
        title: nextStatus === "addressed" ? "Marked as addressed" : "Dismissed",
        description: nextStatus === "addressed"
          ? "The client request is now in your handled pile."
          : "Request hidden from the active list.",
      });
    } catch (err: any) {
      toast({
        title: "Could not update",
        description: err?.message || "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setChangeReqUpdatingId(null);
    }
  };

  const handleReplyToChangeRequest = (req: ChangeReq) => {
    if (!quote) return;
    const clientEmail = (quote as any).client_email || "";
    if (!clientEmail) {
      toast({
        title: "No client email on this quote",
        description: "Add an email to the client record so you can reply.",
        variant: "destructive",
      });
      return;
    }
    const subject = `Re: your changes on quote ${(quote as any).quote_number || ""}`.trim();
    const body =
      `Hi ${req.submitter_name || (quote as any).client_name || "there"},\n\n` +
      `Thanks for sending through the changes. We've got:\n\n"${req.message}"\n\n` +
      `Just a quick note to confirm we're looking at it. ` +
      `We'll send through an updated quote shortly.\n\n` +
      `Best,`;
    const href = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  };

  // Flow audit Leg C P0-7: this page used to compute
  // `total = subtotal + (subtotal * taxRate)` regardless of the
  // tenant's pricing convention. For tenants on
  // companies.pricing_includes_vat=true the line unit_prices already
  // include VAT, so adding VAT on top produced a quote that was 15%
  // higher than the saleable price the operator typed in.
  // Route through breakdownFromLineSum so inc-VAT and ex-VAT tenants
  // both get arithmetic that matches the rest of the system
  // (invoice generation already honours the flag).
  const pricingMode = usePricingMode();
  const computed = useMemo(() => {
    const itemsSubtotal = items.reduce(
      (s, it) => s + it.quantity * it.unit_price,
      0,
    );
    const lineSum = itemsSubtotal + deliveryFee - discount;
    const br = breakdownFromLineSum(lineSum, taxRate, pricingMode.mode);
    return {
      itemsSubtotal,
      // subtotal here is the ex-VAT figure, matching the invoice math.
      subtotal: br.net,
      tax: br.vat,
      total: br.gross,
    };
  }, [items, deliveryFee, discount, taxRate, pricingMode.mode]);

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

  // Wave 51 - pre-flight check. Look up the linked order, build the
  // would-be payload, and ask describeQuoteEditImpact whether any
  // load-bearing field is moving. If yes, hold the save behind the
  // confirmation modal. If no (or no linked order), commit
  // immediately. Used by both Save Draft and Save & Send.
  const _runPreflightThenSave = async (action: "draft" | "send") => {
    if (!quote || !id || typeof id !== "string") return;
    try {
      const { data: linkedOrder } = await (supabase as any)
        .from("orders")
        .select("id, status, order_number")
        .eq("quote_id", id)
        .is("deleted_at", null)
        .maybeSingle();
      const afterPayload = buildPayload();
      const { needsConfirmation, impacts } = describeQuoteEditImpact({
        beforeQuote: quote,
        afterQuote: { ...quote, ...afterPayload },
        linkedOrder: linkedOrder || null,
      });
      if (needsConfirmation) {
        setLinkedOrderForImpact(linkedOrder || null);
        setPropagateImpacts(impacts);
        setPendingSaveAction(action);
        setPropagateImpactOpen(true);
        return;
      }
    } catch (e) {
      console.warn("[quote-edit] preflight check failed; saving without modal:", e);
    }
    if (action === "draft") return _doSaveDraft();
    return _doSend();
  };

  const _doSaveDraft = async () => {
    if (!quote || !id || typeof id !== "string") return;
    setSaving(true);
    try {
      // Wave 51 - route through quoteService.updateQuote so the
      // post-Wave-51 propagation hook fires. The earlier code wrote
      // directly via supabase, bypassing every quote-side side effect.
      const updated = await quoteService.updateQuote(id, buildPayload() as Partial<Quote>);
      const refreshed = await quoteService.getQuote(id);
      setQuote(refreshed);
      const propReceipt = (updated as any)?._propagationReceipt;
      const propLine = _formatPropagationLine(propReceipt);
      toast({
        title: "Draft saved",
        description: ["Your changes are stored.", propLine].filter(Boolean).join(" "),
      });
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

  const handleSaveDraft = () => _runPreflightThenSave("draft");

  // "Save & Send" - two-stage. Stage 1: persist the latest pricing as
  // a draft (no status change, so quoteService.updateQuote does NOT
  // fire _fireQuoteSentEmail). Stage 2: open QuoteSendDialog. The
  // dialog hits /api/send-email with the resolved template + the
  // operator's edits, then stamps sent_at + status='sent' itself on
  // a confirmed successful delivery. Old behaviour fired the email
  // the moment the operator clicked Save & Send, with no preview and
  // no chance to fix a typo.
  const _doSend = async () => {
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
      // Save the latest pricing as a draft. NO status change - the
      // dialog flips status='sent' after the email actually goes out.
      const updated = await quoteService.updateQuote(id, buildPayload() as Partial<Quote>);
      if (!updated) throw new Error("Quote update returned no row");
      const refreshed = await quoteService.getQuote(id);
      setQuote(refreshed);
      // Wave 51 - propagation receipt surfaced before the dialog opens
      // so the operator sees what changed on the order in the same flash.
      const propReceipt = (updated as any)?._propagationReceipt;
      const propLine = _formatPropagationLine(propReceipt);
      if (propLine) {
        toast({ title: "Saved", description: propLine });
      }
      // Hand off to the review-before-send composer.
      setSendDialogOpen(true);
    } catch (e: any) {
      toast({
        title: "Could not save",
        description: e?.message || "Try again, or save the draft and retry.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => _runPreflightThenSave("send");

  // Wave 51 - format the propagation receipt as a one-line toast.
  // Returns "" when nothing was propagated so the caller can collapse.
  function _formatPropagationLine(r: any): string {
    if (!r || r.noLinkedOrder) return "";
    if (r.refusedPostDispatch) {
      return `Order is past dispatch. Amendment request opened for review.`;
    }
    const parts: string[] = [];
    if (r.fieldsChanged && r.fieldsChanged.length > 0) {
      parts.push(`${r.fieldsChanged.length} field${r.fieldsChanged.length === 1 ? "" : "s"} mirrored to the order`);
    }
    if (r.balanceDueDateRecalculated) parts.push("balance due date recalculated");
    if (r.prepTasksRescheduled) parts.push("kitchen prep rescheduled");
    if (r.equipmentBookingsResynced) parts.push("equipment bookings re-synced");
    if (r.collectionRescheduled) parts.push("collection trip moved");
    if (r.emailQueueResynced) parts.push("pre-event reminders re-stamped");
    if (r.orderItemsRebuilt) parts.push("order line items rebuilt");
    return parts.length > 0 ? `Order updated - ${parts.join(", ")}.` : "";
  }

  const isClientRequest = (quote as any)?.external_source === "client_portal_rebook";

  return (
    <>
      <Head>
        <title>Quote details - CateringMS</title>
      </Head>
      <NoIndexMeta />

      {/* Wave 14 follow-up: page used to render edge-to-edge so the
          fixed AdminNav sidebar overlapped the content card on
          desktop. Match the lg:pl-72 / xl:pl-80 pattern every other
          /admin/* page uses, plus the pt-20/lg:pt-6 mobile spacing
          for the floating nav button. */}
      <AdminNav />
      <div className="min-h-screen bg-slate-50 lg:pl-72 xl:pl-80">

        <div className="max-w-full px-4 pt-20 lg:pt-6 pb-12">
          <div className="mb-6">
            <Link href={withSlug("/admin/quotes")}>
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
                <Link href={withSlug("/admin/quotes")}>
                  <Button>Back to Quotes</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
              <div className="space-y-6 min-w-0">
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
                      {/* ODOC H.5: prominent header-level Edit quote CTA.
                          The inline editor on this page only flips when
                          status === 'draft' and only lets you tweak
                          unit prices + delivery + notes. The full editor
                          at /admin/quotes/new?fromQuoteId= is the one
                          that lets the operator change menu items,
                          event date, guest count, venue. Pre-H.5 that
                          editor lived behind the buried "Revise & resend"
                          button at the bottom of the action bar; admins
                          editing in response to a client change request
                          (the screenshot use case) couldn't find it.
                          Hidden for rejected / expired - editing those
                          doesn't fit the workflow (operator should
                          duplicate to a new quote instead). */}
                      {quote.status !== "draft"
                        && quote.status !== "rejected"
                        && quote.status !== "expired" && (
                        <Link href={withSlug(`/admin/quotes/new?fromQuoteId=${quote.id}`)}>
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                            title="Open the full editor to change menu items, date, guests, venue. Save & Send will re-send to the client for re-acceptance."
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit quote
                          </Button>
                        </Link>
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
                        <p className="text-slate-900 font-medium">{quote.client_email || "-"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Event Date</p>
                        <p className="text-slate-900 font-medium">
                          {formatLocalDate(quote.event_date, "-")}
                          {(quote as any).event_time
                            ? ` · ${String((quote as any).event_time).slice(0, 5)} start`
                            : ""}
                        </p>
                        {(quote as any).setup_time
                          && String((quote as any).setup_time).slice(0, 5) !== String((quote as any).event_time || "").slice(0, 5) && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Setup arrival: {String((quote as any).setup_time).slice(0, 5)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Users className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Guests</p>
                        <p className="text-slate-900 font-medium">{quote.guest_count ?? "-"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Venue</p>
                        <p className="text-slate-900 font-medium">
                          {(quote as any).venue_address || "-"}
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
                  {isDraft
                    && changeRequests.some((r) => r.status === "pending") && (
                    <p className="mt-2 text-xs text-blue-700 flex items-center gap-1.5">
                      Editing in response to client request. See panel
                      <ArrowRight className="w-3.5 h-3.5" />
                    </p>
                  )}
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
                                  <span>{fmtMoney(it.unit_price)}</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right font-medium text-slate-900 w-[140px]">
                                {fmtMoney(it.quantity * it.unit_price)}
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
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">{tenantCurrency.symbol}</span>
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
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">{tenantCurrency.symbol}</span>
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
                  {/* Wave 12 audit: align the running-total panel with
                      what the customer sees on /q/[token] and the PDF.
                      Under inc-VAT mode the line items above are
                      gross, so the Subtotal line is gross too and VAT
                      is shown as a "incl" footnote. The legacy ex-VAT
                      layout (items net + delivery + Subtotal +
                      VAT-on-top + Total) stays for ex-VAT tenants. */}
                  {(() => {
                    const incVat = pricingMode.mode === "inc";
                    const liveDelivery = isDraft ? deliveryFee : safeNum((quote as any).delivery_fee);
                    const liveDiscount = isDraft ? discount : safeNum((quote as any).discount_amount);
                    const liveTotal = isDraft
                      ? computed.total
                      : safeNum((quote as any).total ?? (quote as any).total_amount);
                    const liveTax = isDraft
                      ? computed.tax
                      : safeNum((quote as any).tax ?? (quote as any).tax_amount);
                    // For inc-VAT the displayed Subtotal IS the gross
                    // (items + delivery, post-discount). For ex-VAT
                    // the displayed Subtotal stays the ex-VAT net
                    // (legacy convention).
                    const liveSubtotalEx = isDraft ? computed.subtotal : safeNum((quote as any).subtotal);
                    const liveSubtotalGross = liveTotal;
                    return (
                      <div className="space-y-2 pt-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Items{incVat ? " (incl VAT)" : ""}</span>
                          <span className="font-medium">{fmtMoney(computed.itemsSubtotal)}</span>
                        </div>
                        {liveDelivery > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Delivery fee</span>
                            <span className="font-medium">{fmtMoney(liveDelivery)}</span>
                          </div>
                        )}
                        {liveDiscount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Discount</span>
                            <span className="font-medium text-rose-600">- {fmtMoney(liveDiscount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Subtotal{incVat && vatRegistered ? " (incl VAT)" : ""}</span>
                          <span className="font-medium">
                            {fmtMoney(incVat ? liveSubtotalGross : liveSubtotalEx)}
                          </span>
                        </div>
                        {vatRegistered && !incVat && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">VAT ({(taxRate * 100).toFixed(taxRate * 100 < 10 ? 1 : 0)}%)</span>
                            <span className="font-medium">{fmtMoney(liveTax)}</span>
                          </div>
                        )}
                        <div className="h-px bg-slate-200" />
                        <div className="flex justify-between text-lg">
                          <span className="font-semibold">Total{vatRegistered ? " incl. VAT" : ""}</span>
                          <span className="font-bold text-green-600 flex items-center gap-1">
                            <DollarSign className="w-5 h-5" />
                            {fmtMoney(liveTotal)}
                          </span>
                        </div>
                        {vatRegistered && incVat && liveTax > 0 && (
                          <p className="text-[11px] text-slate-500 text-right">
                            Includes VAT ({(taxRate * 100).toFixed(taxRate * 100 < 10 ? 1 : 0)}%) of {fmtMoney(liveTax)}
                          </p>
                        )}
                      </div>
                    );
                  })()}
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
                <Link href={withSlug("/admin/quotes")} className="flex-1 min-w-[120px]">
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
                  <Link href={withSlug(`/admin/orders/new?quoteId=${quote.id}`)} className="flex-1 min-w-[180px]">
                    <Button className="w-full bg-gradient-to-r from-green-600 to-emerald-600">
                      <Sparkles className="w-4 h-4 mr-2" />
                      Convert to order
                    </Button>
                  </Link>
                ) : null}
                {/* Wave 14 audit: when a client requests changes after
                    the quote has left draft (sent / viewed / accepted),
                    the operator had no way to actually re-price or
                    tweak it - only Mark addressed / Reply / Dismiss
                    which close the conversation without touching the
                    quote. The richer editor at /admin/quotes/new
                    already supports loading an existing quote via
                    fromQuoteId and writing back to the same row; we
                    just need a visible affordance to get there.
                    On Save & Send the editor clears accepted_at +
                    viewed_at so the public view resets to "awaiting
                    your response", and marks pending change requests
                    as 'addressed'. */}
                {!isDraft && (
                  <Link
                    href={withSlug(`/admin/quotes/new?fromQuoteId=${quote.id}`)}
                    className="flex-1 min-w-[180px]"
                  >
                    <Button
                      variant="outline"
                      className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Revise &amp; resend
                    </Button>
                  </Link>
                )}
              </div>

              {/* Send-flow shortcuts. Same set as the row buttons on
                  /admin/quotes so the detail page is feature-complete:
                  Mark sent (anchors follow-up timing), Copy link
                  (paste into email / WhatsApp), PDF (browser-native
                  print of the public quote page). */}
              {!isDraft && quote.status !== "accepted" && quote.status !== "rejected" && (
                <>
                  {/* QTE-B (XSC Wave B): re-send email is the
                      primary CTA when a quote is sitting at status='sent'.
                      Pre-audit, sales reps saw only Mark/Copy/Download
                      here and defaulted to copy-link-paste-into-whatsapp
                      because nothing in front of them said "email".
                      Email send tracks open rate + auto-flips status
                      via the dialog. */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Send className="w-3 h-3" />
                      Email send tracks open rate + auto-flips the quote status. Copy-link skips both.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={handleSend}
                        disabled={sending || saving}
                        className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 gap-1.5"
                      >
                        <Send className="w-4 h-4" />
                        {(quote as any).sent_at ? "Re-send by email" : "Send by email"}
                      </Button>
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
                              .eq("id", quote.id);
                            if (error) throw error;
                            const refreshed = await quoteService.getQuote(quote.id);
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
                        title="Already emailed outside the system? This anchors the follow-up timer without firing another email."
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
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              window.open(`${window.location.origin}/q/${(quote as any).public_token}?print=1`, "_blank", "noopener");
                            }}
                            className="gap-1.5 text-slate-600"
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
                  </div>
                </>
              )}

              {!isDraft && quote.status !== "accepted" && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>This quote is no longer in draft. Editing is disabled to preserve history.</span>
                </div>
              )}
              </div>

              {/* Sticky change-request panel. Only renders if there's
                  something to show; on narrower viewports it stacks
                  beneath the main column instead of docking. */}
              <div className="lg:col-start-2">
                <ChangeRequestPanel
                  requests={changeRequests}
                  clientNameFallback={(quote as any).client_name ?? null}
                  highlightId={highlightChangeReqId}
                  onMarkAddressed={(id) => updateChangeRequestStatus(id, "addressed")}
                  onDismiss={(id) => updateChangeRequestStatus(id, "dismissed")}
                  onReply={handleReplyToChangeRequest}
                  updatingId={changeReqUpdatingId}
                  forceOpen={forcePanelOpen}
                />
              </div>
            </div>
          )}
        </div>

        <Footer />
      </div>

      {/* Review-before-send composer. Same dialog the list-page Send
          button uses. onSent refreshes the local quote so the UI
          immediately reflects status='sent' + the new sent_at. */}
      {companyId && quote && (
        <QuoteSendDialog
          open={sendDialogOpen}
          onOpenChange={setSendDialogOpen}
          companyId={companyId}
          tenantName={tenantName}
          quote={{
            id: quote.id,
            quote_number: (quote as any).quote_number ?? null,
            client_name: quote.client_name ?? null,
            client_email: quote.client_email ?? null,
            total: computed.total,
            total_amount: computed.total,
            currency: (quote as any).currency ?? "ZAR",
            event_name: (quote as any).event_name ?? null,
            quote_name: (quote as any).quote_name ?? null,
            user_id: (quote as any).user_id ?? null,
            public_token: (quote as any).public_token ?? null,
            // TIGHTEN I.128: forward guest count + event date + the
            // converted flag so the body reflects the live booking.
            guest_count: (quote as any).guest_count ?? null,
            event_date: (quote as any).event_date ?? null,
            is_converted: !!(quote as any).converted_to_order_id,
          }}
          onSent={async () => {
            if (typeof id === "string") {
              const refreshed = await quoteService.getQuote(id);
              setQuote(refreshed);
            }
          }}
        />
      )}

      {/* Wave 51 - propagation impact confirmation modal. Fires when
          the operator's edit will move event_date / event_time /
          guest_count / total / menu / equipment on a quote whose
          linked order is past acceptance. Lists every cascade
          consequence so the operator commits with their eyes open. */}
      <AlertDialog open={propagateImpactOpen} onOpenChange={setPropagateImpactOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This change touches the linked order</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Quote {(quote as any)?.quote_number ?? "this quote"}
                  {linkedOrderForImpact?.order_number ? ` is linked to order ${linkedOrderForImpact.order_number}` : ""}.
                  Saving will propagate the changes through:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  {propagateImpacts.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500 pt-2">
                  Cancel to keep editing. Confirm to apply across the order, kitchen schedule, equipment bookings, and reminders.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setPropagateImpactOpen(false);
              setPendingSaveAction(null);
            }}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              const action = pendingSaveAction;
              setPropagateImpactOpen(false);
              setPendingSaveAction(null);
              if (action === "draft") await _doSaveDraft();
              else if (action === "send") await _doSend();
            }}>
              Apply &amp; save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// QTS-A (QTS-8): match the quotes-index + new wrapper. sales_admin
// is the page's primary user.
export default function AdminQuoteDetail() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <AdminQuoteDetailInner />
    </ProtectedRoute>
  );
}
