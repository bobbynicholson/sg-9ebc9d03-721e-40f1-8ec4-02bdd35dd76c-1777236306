/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RemoveOrderDialog - the unified "cancel or purge" entry point.
 *
 * TIGHTEN I.121 (2026-06-02): the existing CancelOrderDialog was the
 * right tool for real cancellations - refund preview, payout choice,
 * release cascade, late-cancel guard. But it had no way to:
 *
 *   1. Suppress the client email (every cancel emails the client).
 *   2. Permanently delete a test order (cancelled rows pile up).
 *
 * This dialog wraps both flows in a two-step UI:
 *
 *   Step 1 - Choose mode. Cancel (real cancellation, refund per
 *   policy, optional notify) or Purge (test data / mistake, wipes
 *   the row + all linked records, never emails).
 *
 *   Step 2 - Mode-specific confirmation:
 *     Cancel: refund preview, payout choice, reason, notes,
 *             notify-client checkbox, late-cancel override.
 *     Purge:  red banner, impact list with counts, type-to-confirm,
 *             optional also-delete-quote toggle.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertCircle, Receipt, Calendar, ShieldAlert, Wallet, CreditCard,
  Trash2, Ban, ArrowLeft, MailX,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getClientCreditBalance } from "@/services/cancellation/clientCreditBalance";

interface RefundSnapshot {
  order_id: string;
  event_date: string;
  days_to_event: number;
  refund_pct: number;
  refund_amount: number;
  tier_label: string;
  deposit_paid_amount: number;
  total_amount_paid: number;
  can_postpone: boolean;
  postponement_notice_days: number;
  requires_owner_override: boolean;
  late_cancel_override_days: number;
  policy_snapshot?: any;
  cancellation_fee_percent?: number;
}

interface ImpactCounts {
  invoices: number;
  payments: number;
  kitchen_prep_tasks: number;
  equipment_bookings: number;
  equipment_hire_orders: number;
  driver_assignments: number;
  outsource_assignments: number;
  shopping_list_items: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string | null;
  orderNumber?: string | null;
  /** Allow purge mode. Owner / company admin only - non-permitted
   *  callers see only the Cancel option. */
  canPurge?: boolean;
  onResolved?: (result: { mode: "cancel" | "purge"; refund_amount?: number }) => void;
}

const REASON_OPTIONS = [
  { value: "client_cancelled",  label: "Client cancelled" },
  { value: "no_payment",        label: "No payment received" },
  { value: "kitchen_capacity",  label: "Kitchen capacity issue" },
  { value: "weather",           label: "Weather" },
  { value: "force_majeure",     label: "Force majeure (loadshedding, lockdown, disaster)" },
  // TIGHTEN I.121 new categories.
  { value: "tenant_decision",   label: "We cancelled (double-booking, ops decision)" },
  { value: "client_dispute",    label: "Client dispute / fraud risk" },
  { value: "test_data",         label: "Test data - clean up" },
  { value: "other",             label: "Other" },
];

const fmt = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

export function RemoveOrderDialog({
  open, onOpenChange, orderId, orderNumber, canPurge, onResolved,
}: Props) {
  const { toast } = useToast();

  // Step 1: mode chooser; step 2: mode-specific form.
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<"cancel" | "purge">("cancel");

  // Shared loading state for the refund preview (cancel mode) and
  // the impact preview (purge mode).
  const [snap, setSnap] = useState<RefundSnapshot | null>(null);
  const [impact, setImpact] = useState<ImpactCounts | null>(null);
  const [linkedQuote, setLinkedQuote] = useState<{ id: string; quote_number: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Cancel-mode form state.
  const [reasonCategory, setReasonCategory] = useState("client_cancelled");
  const [reason, setReason] = useState("");
  const [refundOverride, setRefundOverride] = useState<string>("");
  const [bypassLateGuard, setBypassLateGuard] = useState(false);
  const [payoutChoice, setPayoutChoice] = useState<"refund" | "credit">("refund");
  const [committedCostNote, setCommittedCostNote] = useState("");
  const [existingCredit, setExistingCredit] = useState<number>(0);
  const [notifyClient, setNotifyClient] = useState<boolean>(true);

  // Purge-mode form state.
  const [confirmText, setConfirmText] = useState("");
  const [alsoDeleteQuote, setAlsoDeleteQuote] = useState<boolean>(false);
  const [purgeNotes, setPurgeNotes] = useState("");

  // Reset everything when the dialog opens / closes.
  useEffect(() => {
    if (!open || !orderId) {
      setStep(1);
      setMode("cancel");
      setSnap(null);
      setImpact(null);
      setLinkedQuote(null);
      setReason(""); setRefundOverride(""); setBypassLateGuard(false);
      setError(""); setCommittedCostNote(""); setPayoutChoice("refund");
      setExistingCredit(0); setNotifyClient(true);
      setReasonCategory("client_cancelled");
      setConfirmText(""); setAlsoDeleteQuote(false); setPurgeNotes("");
      return;
    }
  }, [open, orderId]);

  // When operator advances to step 2, load the data the form needs.
  useEffect(() => {
    if (!open || !orderId || step !== 2) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        if (mode === "cancel") {
          const { data, error: rpcErr } = await supabase.rpc("get_refund_for_order", { p_order_id: orderId });
          if (rpcErr) throw rpcErr;
          if (cancelled) return;
          setSnap(data as unknown as RefundSnapshot);
          try {
            const { data: orderRow } = await (supabase as any)
              .from("orders")
              .select("client_id, company_id")
              .eq("id", orderId)
              .maybeSingle();
            if (orderRow?.client_id && orderRow?.company_id) {
              const bal = await getClientCreditBalance(supabase, {
                companyId: orderRow.company_id,
                clientId: orderRow.client_id,
              });
              if (!cancelled) setExistingCredit(bal.available);
            }
          } catch (e) {
            console.warn("[RemoveOrderDialog] credit balance read failed:", e);
          }
        } else {
          // Purge mode: count the rows that will go.
          const c: ImpactCounts = {
            invoices: 0, payments: 0, kitchen_prep_tasks: 0,
            equipment_bookings: 0, equipment_hire_orders: 0,
            driver_assignments: 0, outsource_assignments: 0,
            shopping_list_items: 0,
          };
          const count = async (table: string, col: string) => {
            const { count: n } = await (supabase as any)
              .from(table)
              .select("id", { count: "exact", head: true })
              .eq(col, orderId);
            return n || 0;
          };
          const [inv, pay, prep, eqB, hireO, drv, outs, sl, ord] = await Promise.all([
            count("invoices", "order_id"),
            count("payments", "order_id"),
            count("kitchen_prep_tasks", "order_id"),
            count("equipment_bookings", "order_id"),
            count("equipment_hire_orders", "order_id"),
            count("driver_assignments", "order_id"),
            count("outsource_assignments", "order_id"),
            count("shopping_list_items", "source_order_id"),
            (supabase as any).from("orders").select("quote_id").eq("id", orderId).maybeSingle(),
          ]);
          c.invoices = inv; c.payments = pay; c.kitchen_prep_tasks = prep;
          c.equipment_bookings = eqB; c.equipment_hire_orders = hireO;
          c.driver_assignments = drv; c.outsource_assignments = outs;
          c.shopping_list_items = sl;
          if (!cancelled) setImpact(c);
          const qId = (ord as any)?.data?.quote_id ?? null;
          if (qId) {
            const { data: q } = await (supabase as any)
              .from("quotes")
              .select("id, quote_number, status")
              .eq("id", qId)
              .maybeSingle();
            if (!cancelled && q) {
              setLinkedQuote({ id: q.id, quote_number: q.quote_number });
              // Default the toggle ON when the quote isn't accepted by
              // someone else - it likely belongs to this test order.
              if ((q as any).status !== "accepted") setAlsoDeleteQuote(true);
            }
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, orderId, step, mode]);

  const derivedCredit = useMemo(() => {
    if (!snap) return 0;
    const policy = (snap.policy_snapshot || {}) as any;
    const bonusPp = Math.max(0, Math.min(100, Number(policy.credit_bonus_pct ?? 10)));
    const creditPct = Math.min(100, Number(snap.refund_pct || 0) + bonusPp);
    const base = Math.max(snap.deposit_paid_amount || 0, snap.total_amount_paid || 0);
    return Math.round(base * (creditPct / 100) * 100) / 100;
  }, [snap]);

  const bonusPp = useMemo(() => {
    if (!snap) return 10;
    const policy = (snap.policy_snapshot || {}) as any;
    return Math.max(0, Math.min(100, Number(policy.credit_bonus_pct ?? 10)));
  }, [snap]);

  const handleSubmitCancel = async () => {
    if (!orderId || !snap) return;
    setSubmitting(true); setError("");
    try {
      const body: any = {
        reason_category: reasonCategory,
        reason: reason || undefined,
        payout_choice: payoutChoice,
        committed_cost_note: committedCostNote.trim() || undefined,
        requested_by: "admin",
        notify_client: notifyClient,
      };
      if (payoutChoice === "credit" && derivedCredit > 0) body.credit_amount = derivedCredit;
      if (refundOverride !== "" && !Number.isNaN(Number(refundOverride))) {
        body.refund_override = Number(refundOverride);
      }
      if (snap.requires_owner_override) body.bypass_late_guard = bypassLateGuard;
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Cancellation failed"); setSubmitting(false); return; }
      toast({
        title: notifyClient ? "Order cancelled" : "Order cancelled (no email sent)",
        description:
          json.payout_choice === "credit" && json.credit_amount > 0
            ? `${fmt.format(json.credit_amount)} added to client store credit.`
            : json.refund_amount > 0
              ? `Refund of ${fmt.format(json.refund_amount)} pending. Mark it paid once the EFT is sent.`
              : "No payout due (forfeit tier).",
      });
      const followups = Array.isArray(json.manual_followups) ? json.manual_followups : [];
      if (followups.length > 0) {
        const namesFirst3 = followups.slice(0, 3).map((f: any) => f.label).join(", ");
        const more = followups.length > 3 ? ` +${followups.length - 3} more` : "";
        toast({
          title: `${followups.length} manual follow-up${followups.length === 1 ? "" : "s"} required`,
          description: `Phone / email these 3rd parties so they don't show up: ${namesFirst3}${more}.`,
          variant: "destructive",
        });
      }
      onResolved?.({ mode: "cancel", refund_amount: json.refund_amount });
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || "Cancellation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitPurge = async () => {
    if (!orderId || !orderNumber) return;
    if (confirmText.trim() !== orderNumber) {
      setError(`Type "${orderNumber}" exactly to confirm.`);
      return;
    }
    setSubmitting(true); setError("");
    try {
      const res = await fetch(`/api/orders/${orderId}/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm_order_number: confirmText.trim(),
          also_delete_quote: alsoDeleteQuote,
          notes: purgeNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Purge failed"); setSubmitting(false); return; }
      const dc = json.deleted_counts || {};
      const total = Object.values(dc).reduce((a: number, b: any) => a + (typeof b === "number" && b > 0 ? b : 0), 0);
      toast({
        title: `Order ${orderNumber} purged`,
        description: json.purged_quote
          ? `${total} record${total === 1 ? "" : "s"} deleted. Originating quote ${json.purged_quote.quote_number || ""} also removed.`
          : `${total} record${total === 1 ? "" : "s"} deleted. No client email sent.`,
      });
      onResolved?.({ mode: "purge" });
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || "Purge failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            {mode === "purge" ? <Trash2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            {step === 1
              ? `What do you want to do with ${orderNumber ? `#${orderNumber}` : "this order"}?`
              : mode === "cancel"
                ? `Cancel order ${orderNumber ? `#${orderNumber}` : ""}`
                : `Permanently delete ${orderNumber ? `#${orderNumber}` : "this order"}`}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          /* ──────────── STEP 1: mode chooser ──────────── */
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => { setMode("cancel"); setStep(2); }}
              className="w-full text-left rounded-lg border-2 border-slate-200 hover:border-rose-300 hover:bg-rose-50/40 p-4 transition-all"
            >
              <div className="flex items-start gap-3">
                <Ban className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-slate-900">Cancel order</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    The order stays on record as cancelled. Calculate refund or credit per your policy, void invoices, release equipment + kitchen + drivers, mark linked quote as lost. You choose whether to email the client.
                  </p>
                </div>
              </div>
            </button>

            {canPurge && (
              <button
                type="button"
                onClick={() => { setMode("purge"); setStep(2); }}
                className="w-full text-left rounded-lg border-2 border-slate-200 hover:border-red-400 hover:bg-red-50/40 p-4 transition-all"
              >
                <div className="flex items-start gap-3">
                  <Trash2 className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-slate-900">Purge order (permanent)</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Use when this was test data, a mistaken creation, or a duplicate. Wipes the order and every linked record (invoices, payments, prep, equipment, shopping). Never emails the client. Irreversible.
                    </p>
                  </div>
                </div>
              </button>
            )}
            {!canPurge && (
              <p className="text-[11px] text-slate-500 px-1">
                Purge is owner / company admin only.
              </p>
            )}
          </div>
        ) : mode === "cancel" ? (
          /* ──────────── STEP 2: CANCEL form ──────────── */
          loading || !snap ? (
            <div className="py-8 text-center text-sm text-slate-500">
              {loading ? "Calculating refund..." : error || "Loading..."}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Refund preview */}
              <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 mt-0.5 text-slate-500" />
                  <div className="text-sm flex-1">
                    Event in <strong>{snap.days_to_event} day{snap.days_to_event === 1 ? "" : "s"}</strong>
                    {" - "}policy tier: <strong className="capitalize">{snap.tier_label}</strong>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Receipt className="w-4 h-4 mt-0.5 text-brand-primary" />
                  <div className="text-sm flex-1">
                    Paid by client so far: <strong>{fmt.format(Math.max(snap.deposit_paid_amount, snap.total_amount_paid))}</strong>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Receipt className="w-4 h-4 mt-0.5 text-rose-600" />
                  <div className="text-sm flex-1">
                    Refund due: <strong className="text-rose-700">{fmt.format(snap.refund_amount)}</strong>
                    {" "}({snap.refund_pct}%)
                    {!Array.isArray(snap.policy_snapshot?.deposit_refund_tiers)
                      || snap.policy_snapshot.deposit_refund_tiers.length === 0 ? (
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        Based on company cancellation fee {snap.cancellation_fee_percent ?? 25}%. Set tiered tiers under Policy if you want it to scale with notice.
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {existingCredit > 0 ? (
                <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/10 p-3 text-sm flex items-start gap-2">
                  <Wallet className="w-4 h-4 mt-0.5 text-brand-primary flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-brand-primary">
                      Client already holds {fmt.format(existingCredit)} in store credit.
                    </p>
                    <p className="text-xs text-brand-primary mt-0.5">
                      {payoutChoice === "credit" && derivedCredit > 0
                        ? `New balance after this credit: ${fmt.format(existingCredit + derivedCredit)}.`
                        : "Visible so you can decide whether refund or credit makes sense."}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Payout toggle */}
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <Label className="text-xs text-slate-600">Payout method</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayoutChoice("refund")}
                    className={`text-left rounded-lg border-2 p-3 transition-all ${
                      payoutChoice === "refund"
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:border-blue-300"
                    } ${snap.refund_amount === 0 ? "opacity-60" : ""}`}
                    disabled={snap.refund_amount === 0}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-sm font-bold text-slate-900 tabular-nums">{fmt.format(snap.refund_amount)}</p>
                    <p className="text-xs text-slate-700 font-medium">Refund</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">To client's original payment method.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayoutChoice("credit")}
                    className={`text-left rounded-lg border-2 p-3 transition-all ${
                      payoutChoice === "credit"
                        ? "border-brand-primary bg-brand-primary/10"
                        : "border-slate-200 hover:border-brand-primary/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Wallet className="w-4 h-4 text-brand-primary" />
                      {bonusPp > 0 && derivedCredit > snap.refund_amount && (
                        <span className="text-[10px] font-medium uppercase text-brand-primary bg-brand-primary/15 rounded px-1.5 py-0.5">
                          +{bonusPp}pp bonus
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-900 tabular-nums">{fmt.format(derivedCredit)}</p>
                    <p className="text-xs text-slate-700 font-medium">Store credit</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Cash stays in. Client uses it on a future booking.</p>
                  </button>
                </div>
              </div>

              {snap.requires_owner_override ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-2">
                  <div className="flex gap-2 text-amber-900">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      Late cancellation: less than {snap.late_cancel_override_days} day{snap.late_cancel_override_days === 1 ? "" : "s"} to event. This requires an owner-level override.
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-amber-900 text-xs">
                    <input type="checkbox" checked={bypassLateGuard} onChange={(e) => setBypassLateGuard(e.target.checked)} className="rounded" />
                    I understand and want to proceed with the late cancellation.
                  </label>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Reason category</Label>
                <Select value={reasonCategory} onValueChange={setReasonCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REASON_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Notes (optional)</Label>
                <Textarea rows={2} placeholder="Anything the team should know about this cancellation" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>

              {payoutChoice === "refund" && (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">Override refund amount (optional)</Label>
                  <Input type="number" min={0} step={0.01} placeholder={String(snap.refund_amount)} value={refundOverride} onChange={(e) => setRefundOverride(e.target.value)} />
                  <p className="text-xs text-slate-500">Leave blank to use the policy refund of {fmt.format(snap.refund_amount)}.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Committed cost note (optional)</Label>
                <Textarea rows={2} placeholder="e.g. shopped 12kg lamb, paid driver standby, hire deposit forfeited" value={committedCostNote} onChange={(e) => setCommittedCostNote(e.target.value)} />
                <p className="text-xs text-slate-500">Helps your team and your own audit trail track what spend doesn't come back.</p>
              </div>

              {/* TIGHTEN I.121: notify-client toggle. Defaults ON for
                  real cancels; admin unticks for internal corrections
                  or test orders the client never saw. */}
              <div className={`rounded-lg border p-3 ${notifyClient ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50"}`}>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyClient}
                    onChange={(e) => setNotifyClient(e.target.checked)}
                    className="rounded mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 flex items-center gap-1.5">
                      Email the client about this cancellation
                      {!notifyClient && <MailX className="w-3.5 h-3.5 text-amber-700" />}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {notifyClient
                        ? "Sends your cancellation template with refund / credit details and SLA."
                        : "Silent cancel. The order is still cancelled and refund / credit still queued, but no email goes out. Use for test data or internal corrections."}
                    </p>
                  </div>
                </label>
              </div>

              {error ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 flex gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              ) : null}
            </div>
          )
        ) : (
          /* ──────────── STEP 2: PURGE form ──────────── */
          loading ? (
            <div className="py-8 text-center text-sm text-slate-500">Counting linked records...</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 text-sm space-y-2">
                <div className="flex items-start gap-2 text-red-900">
                  <Trash2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">This permanently deletes the order.</p>
                    <p className="text-xs mt-0.5">
                      The row, every linked invoice, payment, prep task, equipment booking, and audit trail entry will be removed. No client email goes out. The action is irreversible.
                    </p>
                  </div>
                </div>
              </div>

              {impact && (
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-medium text-slate-700 mb-2">Records that will be deleted:</p>
                  <ul className="text-sm text-slate-700 space-y-1">
                    <li>1 order ({orderNumber || "this row"})</li>
                    {impact.invoices > 0 && <li>{impact.invoices} invoice{impact.invoices === 1 ? "" : "s"}</li>}
                    {impact.payments > 0 && <li>{impact.payments} payment{impact.payments === 1 ? "" : "s"}</li>}
                    {impact.kitchen_prep_tasks > 0 && <li>{impact.kitchen_prep_tasks} kitchen prep task{impact.kitchen_prep_tasks === 1 ? "" : "s"}</li>}
                    {impact.equipment_bookings > 0 && <li>{impact.equipment_bookings} equipment booking{impact.equipment_bookings === 1 ? "" : "s"}</li>}
                    {impact.equipment_hire_orders > 0 && <li>{impact.equipment_hire_orders} equipment hire order{impact.equipment_hire_orders === 1 ? "" : "s"}</li>}
                    {impact.driver_assignments > 0 && <li>{impact.driver_assignments} driver assignment{impact.driver_assignments === 1 ? "" : "s"}</li>}
                    {impact.outsource_assignments > 0 && <li>{impact.outsource_assignments} outsource assignment{impact.outsource_assignments === 1 ? "" : "s"}</li>}
                    {impact.shopping_list_items > 0 && <li>{impact.shopping_list_items} shopping list item{impact.shopping_list_items === 1 ? "" : "s"}</li>}
                  </ul>
                </div>
              )}

              {linkedQuote && (
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alsoDeleteQuote}
                      onChange={(e) => setAlsoDeleteQuote(e.target.checked)}
                      className="rounded mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">
                        Also delete the originating quote ({linkedQuote.quote_number || "no number"})
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Only deletes if no other orders reference this quote. Leave unticked to keep the quote available for re-conversion.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Why are you purging this? (captured in audit log)</Label>
                <Textarea
                  rows={2}
                  placeholder="e.g. test data from onboarding walkthrough, duplicate order, client picked the wrong tenant"
                  value={purgeNotes}
                  onChange={(e) => setPurgeNotes(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-600">
                  Type <span className="font-mono font-semibold">{orderNumber}</span> to confirm
                </Label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={orderNumber || ""}
                  className="font-mono"
                  autoComplete="off"
                />
              </div>

              {error ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 flex gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              ) : null}
            </div>
          )
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === 2 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStep(1); setError(""); }}
              disabled={submitting}
              className="mr-auto"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep the order
          </Button>
          {step === 2 && mode === "cancel" && (
            <Button
              variant="destructive"
              onClick={handleSubmitCancel}
              disabled={submitting || loading || !snap || (snap.requires_owner_override && !bypassLateGuard)}
            >
              {submitting
                ? "Cancelling..."
                : `Confirm cancel${
                    snap && payoutChoice === "credit" && derivedCredit > 0
                      ? ` + ${fmt.format(derivedCredit)} credit`
                      : snap && snap.refund_amount > 0
                        ? ` + ${fmt.format(snap.refund_amount)} refund`
                        : ""
                  }`}
            </Button>
          )}
          {step === 2 && mode === "purge" && (
            <Button
              variant="destructive"
              onClick={handleSubmitPurge}
              disabled={submitting || loading || confirmText.trim() !== (orderNumber || "")}
              className="bg-red-700 hover:bg-red-800"
            >
              {submitting ? "Deleting..." : "Permanently delete"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
