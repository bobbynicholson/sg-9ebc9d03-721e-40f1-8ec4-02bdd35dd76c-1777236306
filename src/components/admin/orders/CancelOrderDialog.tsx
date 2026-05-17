import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Receipt, Calendar, ShieldAlert, Wallet, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
// Wave 28.7: read existing credit balance for the client so the
// operator sees their full exposure before issuing more credit.
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
  /** New in get_refund_for_order_honour_cancellation_fee migration --
   *  the company's flat cancellation fee, used as fallback when no
   *  deposit_refund_tiers are configured. */
  cancellation_fee_percent?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string | null;
  orderNumber?: string | null;
  onCancelled?: (result: { refund_amount: number; refund_payment_id: string | null }) => void;
}

const REASON_OPTIONS = [
  { value: "client_cancelled",  label: "Client cancelled" },
  { value: "no_payment",        label: "No payment received" },
  { value: "kitchen_capacity",  label: "Kitchen capacity issue" },
  { value: "weather",           label: "Weather" },
  { value: "force_majeure",     label: "Force majeure (loadshedding, lockdown, disaster)" },
  { value: "other",             label: "Other" },
];

const fmt = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

export function CancelOrderDialog({ open, onOpenChange, orderId, orderNumber, onCancelled }: Props) {
  const { toast } = useToast();
  const [snap, setSnap] = useState<RefundSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [reasonCategory, setReasonCategory] = useState("client_cancelled");
  const [reason, setReason] = useState("");
  const [refundOverride, setRefundOverride] = useState<string>("");
  const [bypassLateGuard, setBypassLateGuard] = useState(false);
  // Wave 28.7: payout toggle + supporting state.
  const [payoutChoice, setPayoutChoice] = useState<"refund" | "credit">("refund");
  const [committedCostNote, setCommittedCostNote] = useState("");
  const [existingCredit, setExistingCredit] = useState<number>(0);

  useEffect(() => {
    if (!open || !orderId) {
      setSnap(null);
      setReason("");
      setRefundOverride("");
      setBypassLateGuard(false);
      setError("");
      setCommittedCostNote("");
      setPayoutChoice("refund");
      setExistingCredit(0);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_refund_for_order", { p_order_id: orderId });
        if (error) throw error;
        setSnap(data as unknown as RefundSnapshot);

        // Wave 28.7: read existing credit balance for this client
        // so the operator can see total exposure before issuing more.
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
            setExistingCredit(bal.available);
          }
        } catch (e) {
          console.warn("[CancelOrderDialog] credit balance read failed:", e);
        }
      } catch (e: any) {
        setError(e?.message || "Could not load refund preview");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, orderId]);

  // Wave 28.7: derive credit amount = refund + bonus_pp (capped 100%).
  // Mirrors what /api/orders/[id]/cancel computes server-side so the
  // preview matches the row that lands.
  const derivedCredit = useMemo(() => {
    if (!snap) return 0;
    const policy = (snap.policy_snapshot || {}) as any;
    const bonusPp = Math.max(
      0,
      Math.min(100, Number(policy.credit_bonus_pct ?? 10)),
    );
    const creditPct = Math.min(100, Number(snap.refund_pct || 0) + bonusPp);
    const base = Math.max(snap.deposit_paid_amount || 0, snap.total_amount_paid || 0);
    return Math.round(base * (creditPct / 100) * 100) / 100;
  }, [snap]);

  const bonusPp = useMemo(() => {
    if (!snap) return 10;
    const policy = (snap.policy_snapshot || {}) as any;
    return Math.max(0, Math.min(100, Number(policy.credit_bonus_pct ?? 10)));
  }, [snap]);

  const handleSubmit = async () => {
    if (!orderId || !snap) return;
    setSubmitting(true);
    setError("");
    try {
      const body: any = {
        reason_category: reasonCategory,
        reason: reason || undefined,
        // Wave 28.7: pass the payout choice + supporting fields so
        // the API uses the credit-issue path when chosen.
        payout_choice: payoutChoice,
        committed_cost_note: committedCostNote.trim() || undefined,
        requested_by: "admin",
      };
      if (payoutChoice === "credit" && derivedCredit > 0) {
        body.credit_amount = derivedCredit;
      }
      if (refundOverride !== "" && !Number.isNaN(Number(refundOverride))) {
        body.refund_override = Number(refundOverride);
      }
      if (snap.requires_owner_override) {
        body.bypass_late_guard = bypassLateGuard;
      }
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Cancellation failed");
        if (json.requires_confirmation) {
          // owner-override flow: re-show with the late-guard checkbox
          // visible so user can opt in.
        }
        setSubmitting(false);
        return;
      }
      toast({
        title: "Order cancelled",
        description:
          json.payout_choice === "credit" && json.credit_amount > 0
            ? `${fmt.format(json.credit_amount)} added to client store credit.`
            : json.refund_amount > 0
              ? `Refund of ${fmt.format(json.refund_amount)} pending. Mark it paid once the EFT is sent.`
              : "No payout due (forfeit tier).",
      });
      // Wave 70.49 -- if the release cascade flagged manual follow-ups
      // (3rd-party hire suppliers, outsource providers) surface a second
      // toast with the count + names so the operator can act before
      // closing the dialog. We don't auto-email these contacts (per
      // Bobby's call -- supplier cancellation fees aren't tracked,
      // automated cancel emails could trigger fees we didn't authorise).
      const followups = Array.isArray(json.manual_followups) ? json.manual_followups : [];
      if (followups.length > 0) {
        const namesFirst3 = followups.slice(0, 3).map((f: any) => f.label).join(", ");
        const more = followups.length > 3 ? ` +${followups.length - 3} more` : "";
        toast({
          title: `${followups.length} manual follow-up${followups.length === 1 ? "" : "s"} required`,
          description: `Phone / email these 3rd parties so they don't show up: ${namesFirst3}${more}.`,
          // Use the destructive variant so it's visually distinct from
          // the "success" toast and harder to dismiss without reading.
          variant: "destructive",
        });
      }
      onCancelled?.({
        refund_amount: json.refund_amount,
        refund_payment_id: json.refund_payment_id,
      });
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || "Cancellation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <ShieldAlert className="w-5 h-5" />
            Cancel order {orderNumber ? `#${orderNumber}` : ""}
          </DialogTitle>
        </DialogHeader>

        {loading || !snap ? (
          <div className="py-8 text-center text-sm text-slate-500">
            {loading ? "Calculating refund..." : error || "Loading..."}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Refund preview tile */}
            <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 space-y-2">
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 mt-0.5 text-slate-500" />
                <div className="text-sm flex-1">
                  Event in <strong>{snap.days_to_event} day{snap.days_to_event === 1 ? "" : "s"}</strong>
                  {" -- "}policy tier: <strong className="capitalize">{snap.tier_label}</strong>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Receipt className="w-4 h-4 mt-0.5 text-emerald-600" />
                <div className="text-sm flex-1">
                  Paid by client so far: <strong>{fmt.format(Math.max(snap.deposit_paid_amount, snap.total_amount_paid))}</strong>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Receipt className="w-4 h-4 mt-0.5 text-rose-600" />
                <div className="text-sm flex-1">
                  Refund due: <strong className="text-rose-700">{fmt.format(snap.refund_amount)}</strong>
                  {" "}({snap.refund_pct}%)
                  {/* When no deposit_refund_tiers are configured the
                      RPC falls back to (100 - cancellation_fee_percent).
                      Surface that source so the operator knows the
                      number isn't coming from a tier walk. */}
                  {!Array.isArray(snap.policy_snapshot?.deposit_refund_tiers)
                    || snap.policy_snapshot.deposit_refund_tiers.length === 0 ? (
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Based on company cancellation fee {snap.cancellation_fee_percent ?? 25}%. Set tiered tiers under Policy if you want it to scale with notice.
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Wave 28.7: existing-credit panel. Surfaces what this
                client already has on their wallet so the operator
                doesn't accidentally over-issue credit. */}
            {existingCredit > 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm flex items-start gap-2">
                <Wallet className="w-4 h-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-emerald-900">
                    Client already holds {fmt.format(existingCredit)} in store credit.
                  </p>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    {payoutChoice === "credit" && derivedCredit > 0
                      ? `New balance after this credit: ${fmt.format(existingCredit + derivedCredit)}.`
                      : "Visible so you can decide whether refund or credit makes sense."}
                  </p>
                </div>
              </div>
            ) : null}

            {/* Wave 28.7: payout choice toggle. Refund (default) keeps
                the legacy gateway flow; Credit issues a wallet entry
                via payments{type:credit_issue}. The catering company
                keeps the cash; the client gets a future-dated voucher
                worth refund_pct + bonus_pp. */}
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
                  <p className="text-sm font-bold text-slate-900 tabular-nums">
                    {fmt.format(snap.refund_amount)}
                  </p>
                  <p className="text-xs text-slate-700 font-medium">Refund</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    To client's original payment method.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutChoice("credit")}
                  className={`text-left rounded-lg border-2 p-3 transition-all ${
                    payoutChoice === "credit"
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Wallet className="w-4 h-4 text-emerald-600" />
                    {bonusPp > 0 && derivedCredit > snap.refund_amount && (
                      <span className="text-[10px] font-medium uppercase text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5">
                        +{bonusPp}pp bonus
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-900 tabular-nums">
                    {fmt.format(derivedCredit)}
                  </p>
                  <p className="text-xs text-slate-700 font-medium">Store credit</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Cash stays in. Client uses it on a future booking.
                  </p>
                </button>
              </div>
            </div>

            {/* Owner-override warning */}
            {snap.requires_owner_override ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-2">
                <div className="flex gap-2 text-amber-900">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    Late cancellation: less than {snap.late_cancel_override_days} day{snap.late_cancel_override_days === 1 ? "" : "s"} to event. This requires an owner-level override.
                  </div>
                </div>
                <label className="flex items-center gap-2 text-amber-900 text-xs">
                  <input
                    type="checkbox"
                    checked={bypassLateGuard}
                    onChange={(e) => setBypassLateGuard(e.target.checked)}
                    className="rounded"
                  />
                  I understand and want to proceed with the late cancellation.
                </label>
              </div>
            ) : null}

            {/* Reason */}
            <div className="space-y-2">
              <Label className="text-xs text-slate-600">Reason category</Label>
              <Select value={reasonCategory} onValueChange={setReasonCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-600">Notes (optional)</Label>
              <Textarea
                rows={2}
                placeholder="Anything the team should know about this cancellation"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {/* Refund override -- only shown for the refund payout
                path. The credit path uses the derived amount which the
                wizard has already shown the client. */}
            {payoutChoice === "refund" && (
              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Override refund amount (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder={String(snap.refund_amount)}
                  value={refundOverride}
                  onChange={(e) => setRefundOverride(e.target.value)}
                />
                <p className="text-xs text-slate-500">Leave blank to use the policy refund of {fmt.format(snap.refund_amount)}.</p>
              </div>
            )}

            {/* Wave 28.7: committed-cost note. Optional free text the
                operator can flag (e.g. "shopped 12kg lamb already").
                Lands in cancellation_requests.policy_snapshot._committed_cost_note
                and renders inside the rich admin notification. */}
            <div className="space-y-2">
              <Label className="text-xs text-slate-600">Committed cost note (optional)</Label>
              <Textarea
                rows={2}
                placeholder="e.g. shopped 12kg lamb, paid driver standby, hire deposit forfeited"
                value={committedCostNote}
                onChange={(e) => setCommittedCostNote(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Helps your team and your own audit trail track what spend doesn't come back.
              </p>
            </div>

            {error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 flex gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep the order
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
