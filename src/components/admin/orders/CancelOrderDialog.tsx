import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Receipt, Calendar, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    if (!open || !orderId) {
      setSnap(null);
      setReason("");
      setRefundOverride("");
      setBypassLateGuard(false);
      setError("");
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_refund_for_order", { p_order_id: orderId });
        if (error) throw error;
        setSnap(data as unknown as RefundSnapshot);
      } catch (e: any) {
        setError(e?.message || "Could not load refund preview");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, orderId]);

  const handleSubmit = async () => {
    if (!orderId || !snap) return;
    setSubmitting(true);
    setError("");
    try {
      const body: any = {
        reason_category: reasonCategory,
        reason: reason || undefined,
      };
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
          json.refund_amount > 0
            ? `Refund of ${fmt.format(json.refund_amount)} pending. Mark it paid once the EFT is sent.`
            : "No refund due (forfeit tier).",
      });
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
                </div>
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

            {/* Refund override */}
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
            {submitting ? "Cancelling..." : `Confirm cancel${snap && snap.refund_amount > 0 ? ` + ${fmt.format(snap.refund_amount)} refund` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
