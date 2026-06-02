/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin Amendments tab for the Order Details modal.
 *
 * Lists every order_amendment_requests row tied to this order
 * (pending first, then history) and lets the admin approve / reject
 * pending ones via /api/orders/amendment-review. On approval, the
 * cascade fires server-side (kitchen prep regen + invoice refresh)
 * so this UI just needs to mark the request as actioned and refresh.
 *
 * Kept presentational + thin. The proposed-changes diff is rendered
 * as a key/value list because the structured fields are simple
 * (guest_count, menu_items, etc.) and a generic JSONB pretty-printer
 * is fine for the edge cases.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Clock, AlertTriangle, FileText } from "lucide-react";

interface CascadeStep {
  ok: boolean;
  reason?: string;
  skipped?: boolean;
}
interface CascadeReceipt {
  kitchen_prep?: CascadeStep;
  invoice?: CascadeStep;
  inventory?: CascadeStep;
  retried_at?: string;
  retried_by?: string;
}

interface AmendmentRequest {
  id: string;
  order_id: string;
  company_id: string;
  requested_at: string;
  proposed_changes: Record<string, any>;
  client_notes: string | null;
  // TIGHTEN I.73: status enum pruned to the live set; dead values
  // (auto_rejected_late, cancelled_by_client, superseded) had no writers
  // and the DB CHECK now refuses them.
  status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
  review_notes: string | null;
  applied_snapshot?: {
    before?: Record<string, any>;
    applied_keys?: string[];
    cascade?: CascadeReceipt;
  } | null;
}

interface Props {
  orderId: string;
  // The current order values, so we can show before / after on the diff.
  currentOrder: Record<string, any>;
  onActioned?: () => void;
}

export function AmendmentsTab({ orderId, currentOrder, onActioned }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AmendmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("order_amendment_requests")
      .select("*")
      .eq("order_id", orderId)
      .order("requested_at", { ascending: false });
    if (!error && data) setRows(data as AmendmentRequest[]);
    setLoading(false);
  };

  useEffect(() => {
    if (orderId) load();
  }, [orderId]);

  const retryCascade = async (request_id: string, force = false) => {
    setBusyId(request_id);
    try {
      const resp = await fetch("/api/orders/amendment-cascade-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id, force }),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(j?.error || "Retry failed");
      toast({
        title: j?.all_steps_succeeded ? "Cascade complete" : "Cascade partially recovered",
        description: j?.all_steps_succeeded
          ? "Kitchen prep, invoice, and inventory are all up to date."
          : "Some steps still need attention - check the receipt.",
      });
      onActioned?.();
      await load();
    } catch (err: any) {
      toast({
        title: "Could not retry cascade",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const review = async (request_id: string, action: "approve" | "reject", note?: string) => {
    setBusyId(request_id);
    try {
      const resp = await fetch("/api/orders/amendment-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id, action, review_notes: note || null }),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(j?.error || "Review failed");
      toast({
        title: action === "approve" ? "Amendment approved" : "Amendment rejected",
        description:
          action === "approve"
            ? "Changes applied. Kitchen prep + invoice are refreshing."
            : "The request has been logged as rejected.",
      });
      onActioned?.();
      await load();
    } catch (err: any) {
      toast({
        title: "Could not action amendment",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
      setRejectingId(null);
      setRejectNote("");
    }
  };

  const pending = rows.filter((r) => r.status === "pending");
  const history = rows.filter((r) => r.status !== "pending");

  if (loading) {
    return (
      <div className="text-center py-8 text-sm text-slate-500">
        Loading amendment requests...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-10">
        <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-600 font-medium">No amendment requests on this order.</p>
        <p className="text-xs text-slate-500 mt-1">
          Clients can request changes from their portal up to the company's amendment cutoff.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-2">
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Pending review ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                currentOrder={currentOrder}
                isBusy={busyId === r.id}
                isRejecting={rejectingId === r.id}
                rejectNote={rejectNote}
                setRejectNote={setRejectNote}
                onApprove={() => review(r.id, "approve")}
                onStartReject={() => setRejectingId(r.id)}
                onCancelReject={() => { setRejectingId(null); setRejectNote(""); }}
                onConfirmReject={() => review(r.id, "reject", rejectNote)}
              />
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">History</h3>
          <div className="space-y-2">
            {history.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                currentOrder={currentOrder}
                readOnly
                isBusy={busyId === r.id}
                onRetryCascade={() => retryCascade(r.id, false)}
                onForceRetryCascade={() => retryCascade(r.id, true)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RequestCard({
  request,
  currentOrder,
  isBusy,
  isRejecting,
  rejectNote,
  setRejectNote,
  onApprove,
  onStartReject,
  onCancelReject,
  onConfirmReject,
  onRetryCascade,
  onForceRetryCascade,
  readOnly,
}: {
  request: AmendmentRequest;
  currentOrder: Record<string, any>;
  isBusy?: boolean;
  isRejecting?: boolean;
  rejectNote?: string;
  setRejectNote?: (v: string) => void;
  onApprove?: () => void;
  onStartReject?: () => void;
  onCancelReject?: () => void;
  onConfirmReject?: () => void;
  onRetryCascade?: () => void;
  onForceRetryCascade?: () => void;
  readOnly?: boolean;
}) {
  const requestedAt = request.requested_at
    ? new Date(request.requested_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
  const fields = Object.keys(request.proposed_changes || {});
  const statusBadge: Record<string, { label: string; tone: string; icon: any }> = {
    pending:  { label: "Pending",  tone: "bg-amber-100 text-amber-800 border-amber-200",    icon: Clock },
    approved: { label: "Approved", tone: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
    rejected: { label: "Rejected", tone: "bg-rose-100 text-rose-700 border-rose-200",       icon: XCircle },
  };
  const sb = statusBadge[request.status] || statusBadge.pending;
  const SbIcon = sb.icon;

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <Badge className={`${sb.tone} border gap-1`}>
            <SbIcon className="w-3 h-3" /> {sb.label}
          </Badge>
          <p className="text-xs text-slate-500 mt-1.5">Requested {requestedAt}</p>
        </div>
      </div>

      {request.client_notes && (
        <p className="text-sm text-slate-700 italic mb-3">
          &ldquo;{request.client_notes}&rdquo;
        </p>
      )}

      <table className="w-full text-sm border-t border-slate-100">
        <thead>
          <tr className="text-xs text-slate-500 uppercase tracking-wide">
            <th className="text-left py-2 pr-2 font-medium">Field</th>
            <th className="text-left py-2 pr-2 font-medium">Currently</th>
            <th className="text-left py-2 font-medium">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((k) => (
            <tr key={k} className="border-t border-slate-100">
              <td className="py-2 pr-2 font-medium text-slate-700 capitalize">{k.replace(/_/g, " ")}</td>
              <td className="py-2 pr-2 text-slate-600 align-top">
                <span className="block max-w-[18ch] truncate" title={renderValue(currentOrder[k])}>
                  {renderValue(currentOrder[k])}
                </span>
              </td>
              <td className="py-2 text-slate-900 font-medium align-top">
                <span className="block max-w-[18ch] truncate" title={renderValue(request.proposed_changes[k])}>
                  {renderValue(request.proposed_changes[k])}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!readOnly && (
        <div className="mt-4">
          {isRejecting ? (
            <div className="space-y-2">
              <Textarea
                value={rejectNote || ""}
                onChange={(e) => setRejectNote?.(e.target.value)}
                placeholder="Optional: tell the client why (private to your team for now)"
                rows={2}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={onCancelReject} disabled={isBusy}>
                  Cancel
                </Button>
                <Button size="sm" onClick={onConfirmReject} disabled={isBusy} className="bg-rose-600 hover:bg-rose-700">
                  {isBusy ? "Rejecting..." : "Confirm rejection"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={onStartReject} disabled={isBusy}>
                <XCircle className="w-4 h-4 mr-1.5" />
                Reject
              </Button>
              <Button size="sm" onClick={onApprove} disabled={isBusy} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                {isBusy ? "Approving..." : "Approve + apply"}
              </Button>
            </div>
          )}
        </div>
      )}

      {readOnly && request.review_notes && (
        <p className="mt-3 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Note:</span> {request.review_notes}
        </p>
      )}

      {readOnly && request.status === "approved" && request.applied_snapshot?.cascade && (
        <CascadePanel
          cascade={request.applied_snapshot.cascade}
          isBusy={isBusy}
          onRetry={onRetryCascade}
          onForceRetry={onForceRetryCascade}
        />
      )}
    </div>
  );
}

/**
 * Cascade receipt panel for approved amendments. Surfaces the
 * per-step outcome that amendment-review.ts persists to
 * applied_snapshot.cascade [P1-01]. When any step failed, offers a
 * "Retry failed steps" button that calls
 * /api/orders/amendment-cascade-retry.
 */
function CascadePanel({
  cascade,
  isBusy,
  onRetry,
  onForceRetry,
}: {
  cascade: CascadeReceipt;
  isBusy?: boolean;
  onRetry?: () => void;
  onForceRetry?: () => void;
}) {
  const steps: Array<{ key: keyof CascadeReceipt; label: string }> = [
    { key: "kitchen_prep", label: "Kitchen prep regenerated" },
    { key: "invoice", label: "Invoice refreshed" },
    { key: "inventory", label: "Inventory recalculated" },
  ];
  const anyFailed = steps.some((s) => {
    const v = cascade[s.key] as CascadeStep | undefined;
    return v && v.skipped !== true && v.ok !== true;
  });

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-700 mb-2">Cascade outcome</p>
      <ul className="space-y-1.5">
        {steps.map(({ key, label }) => {
          const v = cascade[key] as CascadeStep | undefined;
          if (!v) {
            return (
              <li key={key} className="flex items-start gap-2 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5 mt-0.5" />
                <span>{label}: not run</span>
              </li>
            );
          }
          if (v.skipped) {
            return (
              <li key={key} className="flex items-start gap-2 text-xs text-slate-500">
                <span className="w-3.5 h-3.5 mt-0.5 inline-block rounded-full border border-slate-300" />
                <span>{label}: skipped (not relevant to this amendment)</span>
              </li>
            );
          }
          if (v.ok) {
            return (
              <li key={key} className="flex items-start gap-2 text-xs text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" />
                <span>{label}: done</span>
              </li>
            );
          }
          return (
            <li key={key} className="flex items-start gap-2 text-xs text-rose-700">
              <XCircle className="w-3.5 h-3.5 mt-0.5" />
              <span>
                <span className="font-medium">{label}: failed</span>
                {v.reason && <span className="block text-rose-600 font-normal">{v.reason}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {cascade.retried_at && (
        <p className="text-[11px] text-slate-500 mt-2">
          Last retried {new Date(cascade.retried_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
      {anyFailed && (
        <div className="mt-3 flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onForceRetry} disabled={isBusy}>
            Retry all (force)
          </Button>
          <Button size="sm" onClick={onRetry} disabled={isBusy}>
            {isBusy ? "Retrying..." : "Retry failed steps"}
          </Button>
        </div>
      )}
    </div>
  );
}

function renderValue(v: any): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
  return String(v);
}
