/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin tab listing pending + historical cancellation_requests for a
 * single order. Approve / reject flow goes through
 * /api/orders/cancellation-review, which on approve runs the cancel
 * cascade + drops a refund payments row.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, CalendarX, Calendar, Receipt } from "lucide-react";
// Wave 70.49c - surfaces "manual follow-ups required" alongside the
// requests list so operators see hire-in / outsource notifications
// they still need to action without leaving the cancellation tab.
import { OrderManualFollowupsPanel } from "@/components/admin/OrderManualFollowupsPanel";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface CancellationRequest {
  id: string;
  order_id: string | null;
  company_id: string | null;
  request_type: string | null;
  requested_postpone_date: string | null;
  status: string | null;
  reason: string | null;
  feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  refund_amount_calculated: number | null;
  refund_amount_approved: number | null;
  policy_snapshot: any;
}

interface Props {
  orderId: string;
  /** Tenant company_id - drives the currency formatter. TIGHTEN I.79:
   *  was previously absent; the module hardcoded ZAR which read wrong
   *  for USD / GBP / EUR tenants on refund amounts in this tab. */
  companyId?: string | null;
  onActioned?: () => void;
}

export function CancellationRequestsTab({ orderId, companyId = null, onActioned }: Props) {
  const { toast } = useToast();
  // TIGHTEN I.79 (2026-06-02): tenant-aware currency. Falls back to ZAR
  // when companyId is missing (legacy callers / tests).
  const tenantCurrency = useTenantCurrency(companyId);
  const fmt = (n: number): string => tenantCurrency.format(n, 2);
  const [rows, setRows] = useState<CancellationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [refundOverride, setRefundOverride] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("cancellation_requests")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    if (!error && data) setRows(data as CancellationRequest[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [orderId]);

  const action = async (req: CancellationRequest, approve: boolean) => {
    setBusyId(req.id);
    try {
      const body: any = {
        request_id: req.id,
        action: approve ? "approve" : "reject",
      };
      if (!approve) body.review_notes = rejectNote || undefined;
      if (approve && req.request_type === "cancel") {
        const ov = refundOverride[req.id];
        if (ov && !Number.isNaN(Number(ov))) body.refund_override = Number(ov);
      }
      const res = await fetch("/api/orders/cancellation-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        toast({ title: "Action failed", description: j.error, variant: "destructive" });
      } else {
        toast({
          title: approve
            ? (req.request_type === "postpone" ? "Postponement approved" : "Cancellation approved")
            : "Request rejected",
          description: j.refund_amount > 0 ? `Refund of ${fmt(j.refund_amount)} pending. Mark paid on /admin/refunds.` : undefined,
        });
        await load();
        onActioned?.();
      }
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message || "Network error", variant: "destructive" });
    } finally {
      setBusyId(null);
      setRejectingId(null);
      setRejectNote("");
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500 p-4">Loading...</div>;
  }

  // Wave 70.49c - the manual follow-ups panel renders WHENEVER an
  // order has been cancelled with pending hire/outsource follow-ups,
  // even if there are no cancellation_requests rows (e.g. admin-side
  // direct cancel via /api/orders/[id]/cancel, which writes the
  // audit_logs row but NOT a cancellation_requests row). So the panel
  // sits above the requests list rather than being gated by it.
  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <OrderManualFollowupsPanel orderId={orderId} />
        <div className="text-sm text-slate-500 p-4">No cancellation or postponement requests on this order.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <OrderManualFollowupsPanel orderId={orderId} />
      {rows.map((req) => {
        const isPending = req.status === "pending";
        const Icon = req.request_type === "postpone" ? Calendar : CalendarX;
        const tone = isPending ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white";
        return (
          <div key={req.id} className={`rounded-lg border p-3 ${tone}`}>
            <div className="flex items-start gap-3">
              <Icon className="w-4 h-4 mt-0.5 text-slate-700" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-slate-900 capitalize">
                    {req.request_type === "postpone" ? "Postponement request" : "Cancellation request"}
                  </strong>
                  <Badge variant="outline" className="text-xs">
                    {req.status}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {new Date(req.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                  </span>
                </div>
                {req.request_type === "postpone" && req.requested_postpone_date ? (
                  <div className="text-xs text-slate-700 mt-1">
                    Requested new date: <strong>{new Date(req.requested_postpone_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</strong>
                  </div>
                ) : null}
                {req.refund_amount_calculated !== null ? (
                  <div className="text-xs text-slate-700 mt-1 flex items-center gap-1">
                    <Receipt className="w-3 h-3" />
                    Policy refund: <strong>{fmt(Number(req.refund_amount_calculated))}</strong>
                    {req.refund_amount_approved !== null && Number(req.refund_amount_approved) !== Number(req.refund_amount_calculated) ? (
                      <span className="ml-2 text-brand-primary">Approved: {fmt(Number(req.refund_amount_approved))}</span>
                    ) : null}
                  </div>
                ) : null}
                {req.reason ? <p className="text-xs text-slate-700 mt-1">Client reason: {req.reason}</p> : null}
                {req.feedback ? <p className="text-xs text-slate-600 mt-1 italic">"{req.feedback}"</p> : null}
                {req.review_notes ? <p className="text-xs text-slate-600 mt-1">Review note: {req.review_notes}</p> : null}
              </div>
            </div>

            {isPending && (
              <div className="mt-3 space-y-2">
                {req.request_type === "cancel" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Refund override (optional)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder={`Default: ${fmt(Number(req.refund_amount_calculated || 0))}`}
                      value={refundOverride[req.id] ?? ""}
                      onChange={(e) => setRefundOverride({ ...refundOverride, [req.id]: e.target.value })}
                    />
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => action(req, true)}
                    disabled={busyId === req.id}
                    className="bg-brand-primary hover:bg-brand-primary/90"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {busyId === req.id ? "Working..." : "Approve"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRejectingId(rejectingId === req.id ? null : req.id)}
                    disabled={busyId === req.id}
                    className="text-rose-700 border-rose-200 hover:bg-rose-50"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
                {rejectingId === req.id && (
                  <div className="space-y-2 pt-2 border-t border-amber-200">
                    <Textarea
                      rows={2}
                      placeholder="Why are you rejecting? (the client will see this)"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                    />
                    <Button size="sm" variant="destructive" onClick={() => action(req, false)} disabled={busyId === req.id}>
                      Confirm reject
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
