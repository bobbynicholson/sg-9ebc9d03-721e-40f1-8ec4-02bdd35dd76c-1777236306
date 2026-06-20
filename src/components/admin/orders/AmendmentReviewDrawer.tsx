/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AmendmentReviewDrawer + CancellationReviewDrawer
 *
 * Right-side review surfaces for the orders dashboard. Driven by query
 * params on /admin/orders - when the URL has ?orderId=...&amendment=...
 * (or &cancellation=...) the parent opens the matching drawer. Closing
 * the drawer strips the params so a refresh doesn't re-open it.
 *
 * The amendment drawer reads order_amendment_requests directly + the
 * order row, renders the proposed_changes diff against the current
 * order, and posts approve / reject / approve_partial back to
 * /api/orders/amendment-review. The cancellation drawer is symmetric
 * but talks to /api/orders/cancellation-review.
 *
 * Once a request is no longer pending, the action bar collapses to a
 * read-only audit summary so historical clicks from notifications
 * still surface the resolved state.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  CalendarX,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Edit,
  ExternalLink,
  Receipt,
  XCircle,
} from "lucide-react";

const FIELD_LABELS: Record<string, string> = {
  guest_count: "Guest count",
  menu_items: "Menu items",
  equipment_items: "Equipment",
  special_instructions: "Special instructions",
  delivery_time: "Delivery time",
  venue_address: "Venue address",
};

const STATUS_BADGE: Record<
  string,
  { label: string; tone: string; icon: typeof Clock }
> = {
  pending: {
    label: "Pending",
    tone: "bg-amber-100 text-amber-800 border-amber-200",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    tone: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    tone: "bg-rose-100 text-rose-700 border-rose-200",
    icon: XCircle,
  },
  // TIGHTEN I.73 (2026-06-02): pruned auto_rejected_late, cancelled_by_client,
  // and superseded. No code path ever wrote them, the CHECK constraint
  // now rejects them, and the table only ever held pending/approved/
  // rejected.
};

function renderValue(v: any): string {
  if (v === null || v === undefined || v === "") return "(none)";
  if (Array.isArray(v)) {
    if (v.length === 0) return "(none)";
    if (v.every((x) => typeof x === "string" || typeof x === "number")) {
      return v.join(", ");
    }
    return `${v.length} item${v.length === 1 ? "" : "s"}`;
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "(complex value)";
    }
  }
  return String(v);
}

/**
 * Readable list of menu / equipment line items for the review drawer.
 * Now that the client editor submits full menu_items / equipment_items
 * arrays (not just a guest count), the old renderValue collapsed them to
 * "5 items" - the operator couldn't see WHAT changed before approving.
 * This resolves per-guest lines to the actual headcount so the Currently
 * vs Requested columns are directly comparable ("Coleslaw x35").
 */
function lineItemList(v: any, guestCount: number): { name: string; qty: number }[] {
  const arr = Array.isArray(v)
    ? v
    : typeof v === "string"
      ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } })()
      : [];
  return arr
    .map((it: any) => {
      const name = it?.item_name || it?.name || "Item";
      const mode = String(it?.pricing_mode || it?.pricingMode || "");
      const rawQty = Number(it?.quantity ?? 0);
      // Per-guest dish stored as qty 0 -> show the live headcount.
      const qty = mode === "per_person" && rawQty <= 0 ? Number(guestCount) || 0 : rawQty;
      return { name: String(name), qty };
    })
    .filter((x) => x.name);
}

/**
 * Turn the amendment-review cascade receipt into a human sentence so
 * the operator sees the change actually rippled everywhere - kitchen,
 * finance, shopping, driver + cleaning - not just "saved". Mirrors
 * Bobby's rule that an edit must land consistently across the whole
 * process.
 */
function describeCascade(cascade: any): string {
  if (!cascade || typeof cascade !== "object") {
    return "Changes applied across the order.";
  }
  const synced: string[] = [];
  if (cascade.kitchen_prep?.ok) synced.push("kitchen prep");
  if (cascade.invoice?.ok) synced.push("invoice");
  if (cascade.inventory?.ok && cascade.inventory?.skipped !== true) synced.push("shopping");
  if (cascade.schedule?.ok && cascade.schedule?.skipped !== true) synced.push("driver + cleaning");

  const failed: string[] = [];
  if (cascade.kitchen_prep && cascade.kitchen_prep.ok === false) failed.push("kitchen prep");
  if (cascade.invoice && cascade.invoice.ok === false) failed.push("invoice");
  if (cascade.inventory && cascade.inventory.skipped !== true && cascade.inventory.ok === false) failed.push("shopping");
  if (cascade.schedule && cascade.schedule.skipped !== true && cascade.schedule.ok === false) failed.push("driver + cleaning");

  const base = synced.length
    ? `Synced everywhere: ${synced.join(", ")}.`
    : "Changes applied across the order.";
  return failed.length
    ? `${base} ${failed.join(", ")} need${failed.length === 1 ? "s" : ""} a retry - reopen this request to re-run.`
    : base;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - t;
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
  });
}

interface AmendmentRow {
  id: string;
  order_id: string;
  company_id: string;
  requested_at: string;
  proposed_changes: Record<string, any>;
  client_notes: string | null;
  status: string;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  review_notes: string | null;
  applied_snapshot: any;
  applied_at: string | null;
}

interface OrderRow {
  id: string;
  order_number?: string | null;
  client_name?: string | null;
  status?: string | null;
  guest_count?: number | null;
  menu_items?: any;
  equipment_items?: any;
  special_instructions?: string | null;
  delivery_time?: string | null;
  venue_address?: string | null;
}

interface AmendmentDrawerProps {
  open: boolean;
  amendmentId: string | null;
  orderId: string | null;
  onClose: () => void;
  onActioned: () => void;
  onEditOrder?: (orderId: string) => void;
}

export function AmendmentReviewDrawer({
  open,
  amendmentId,
  orderId,
  onClose,
  onActioned,
  onEditOrder,
}: AmendmentDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [request, setRequest] = useState<AmendmentRow | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [reviewerName, setReviewerName] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [busy, setBusy] = useState(false);
  // Per-key apply selection. Initialised to all-keys-selected so
  // "Approve all" is the default click; deselecting any key flips
  // the action to approve_partial under the hood.
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !amendmentId) {
      setRequest(null);
      setOrder(null);
      setReviewerName(null);
      setReviewNotes("");
      setSelectedKeys({});
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: req, error: reqError } = await (supabase as any)
          .from("order_amendment_requests")
          .select("*")
          .eq("id", amendmentId)
          .maybeSingle();
        if (reqError) {
          console.error("[AmendmentReviewDrawer] order_amendment_requests fetch failed:", reqError);
        }
        if (cancelled) return;
        setRequest(req || null);

        const targetOrderId = orderId || (req as any)?.order_id;
        if (targetOrderId) {
          const { data: ord, error: ordError } = await (supabase as any)
            .from("orders")
            // menu_items/equipment_items live on the linked quote, not orders.
            .select(
              "id, order_number, client_name, status, guest_count, special_instructions, delivery_time, venue_address, quote:quotes!orders_quote_id_fkey(menu_items, equipment_items)",
            )
            .eq("id", targetOrderId)
            .maybeSingle();
          if (ordError) {
            console.error("[AmendmentReviewDrawer] orders fetch failed:", ordError);
          }
          if (cancelled) return;
          setOrder(
            ord
              ? {
                  ...ord,
                  menu_items: ord.quote?.menu_items ?? null,
                  equipment_items: ord.quote?.equipment_items ?? null,
                }
              : null,
          );
        }

        // Reviewer name lookup - best-effort. profiles is the canonical
        // source for full_name; the FK on reviewed_by_user_id points at
        // auth.users which we can't read directly from the client.
        if ((req as any)?.reviewed_by_user_id) {
          const { data: prof, error: profError } = await (supabase as any)
            .from("profiles")
            .select("full_name, email")
            .eq("id", (req as any).reviewed_by_user_id)
            .maybeSingle();
          if (profError) {
            console.error("[AmendmentReviewDrawer] profiles fetch failed:", profError);
          }
          if (!cancelled) {
            setReviewerName(
              (prof as any)?.full_name || (prof as any)?.email || null,
            );
          }
        }

        if (req && (req as any).proposed_changes) {
          const next: Record<string, boolean> = {};
          for (const k of Object.keys((req as any).proposed_changes)) {
            next[k] = true;
          }
          if (!cancelled) setSelectedKeys(next);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, amendmentId, orderId]);

  const proposedKeys = useMemo(
    () => (request?.proposed_changes ? Object.keys(request.proposed_changes) : []),
    [request],
  );
  const isPending = request?.status === "pending";
  const sb = STATUS_BADGE[request?.status || "pending"] || STATUS_BADGE.pending;
  const SbIcon = sb.icon;

  const submitReview = async (
    action: "approve" | "reject" | "approve_partial",
  ) => {
    if (!request) return;
    setBusy(true);
    try {
      const body: any = {
        request_id: request.id,
        action,
        review_notes: reviewNotes || null,
      };
      if (action === "approve_partial") {
        body.apply_keys = Object.keys(selectedKeys).filter((k) => selectedKeys[k]);
        if (body.apply_keys.length === 0) {
          toast({
            title: "Pick at least one field",
            description: "Tick the keys you want to apply, or use Reject.",
            variant: "destructive",
          });
          setBusy(false);
          return;
        }
      }
      const resp = await fetch("/api/orders/amendment-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(j?.error || "Review failed");
      toast({
        title:
          action === "reject"
            ? "Amendment rejected"
            : action === "approve_partial"
              ? "Selected changes applied"
              : "Amendment approved",
        description:
          action === "reject"
            ? "The client has been notified."
            : describeCascade(j?.cascade),
      });
      onActioned();
      onClose();
    } catch (err: any) {
      toast({
        title: "Could not action amendment",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePrimaryApprove = () => {
    const allSelected =
      proposedKeys.length > 0 &&
      proposedKeys.every((k) => selectedKeys[k]);
    if (allSelected) {
      submitReview("approve");
    } else {
      submitReview("approve_partial");
    }
  };

  const requestedAtAbs = request?.requested_at
    ? new Date(request.requested_at).toLocaleString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Amendment review
          </SheetTitle>
          <SheetDescription>
            {order?.order_number ? `Order ${order.order_number}` : "Order"}
            {order?.client_name ? ` - ${order.client_name}` : ""}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="text-sm text-slate-500 mt-6">Loading request...</div>
        ) : !request ? (
          <div className="text-sm text-slate-500 mt-6">
            Amendment request not found. It may have been removed or
            superseded.
          </div>
        ) : (
          <div className="space-y-5 mt-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${sb.tone} border gap-1`}>
                <SbIcon className="w-3 h-3" /> {sb.label}
              </Badge>
              <span
                className="text-xs text-slate-500"
                title={requestedAtAbs}
              >
                Requested {formatRelative(request.requested_at)}
              </span>
              {order?.id && onEditOrder && (
                <button
                  type="button"
                  onClick={() => onEditOrder(order.id)}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                >
                  <Edit className="w-3 h-3" />
                  Edit the order directly
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            {request.client_notes && (
              <blockquote className="border-l-4 border-blue-300 bg-blue-50 px-3 py-2 text-sm text-slate-800 italic rounded-r">
                &ldquo;{request.client_notes}&rdquo;
              </blockquote>
            )}

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                What the client wants changed
              </h3>
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {proposedKeys.map((k) => {
                  const currentVal = order ? (order as any)[k] : null;
                  const proposedVal = request.proposed_changes[k];
                  const label = FIELD_LABELS[k] || k.replace(/_/g, " ");
                  return (
                    <div key={k} className="p-3">
                      <div className="flex items-start gap-2">
                        {isPending && proposedKeys.length > 1 && (
                          <Checkbox
                            checked={!!selectedKeys[k]}
                            onCheckedChange={(c) =>
                              setSelectedKeys((prev) => ({
                                ...prev,
                                [k]: !!c,
                              }))
                            }
                            className="mt-0.5"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700 capitalize mb-1">
                            {label}
                          </p>
                          {k === "menu_items" || k === "equipment_items" ? (
                            (() => {
                              const curGuests = Number((order as any)?.guest_count) || 0;
                              const propGuests =
                                request.proposed_changes?.guest_count != null
                                  ? Number(request.proposed_changes.guest_count)
                                  : curGuests;
                              const cur = lineItemList(currentVal, curGuests);
                              const prop = lineItemList(proposedVal, propGuests);
                              const curByName = new Map(cur.map((x) => [x.name, x.qty]));
                              const propByName = new Map(prop.map((x) => [x.name, x.qty]));
                              return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Currently</p>
                                    <ul className="space-y-0.5">
                                      {cur.length === 0 && <li className="text-slate-400">(none)</li>}
                                      {cur.map((x, i) => {
                                        const removed = !propByName.has(x.name);
                                        return (
                                          <li key={i} className={removed ? "text-rose-700 line-through" : "text-slate-600"}>
                                            {x.name} <span className="tabular-nums">×{x.qty}</span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Requested</p>
                                    <ul className="space-y-0.5">
                                      {prop.length === 0 && <li className="text-slate-400">(none)</li>}
                                      {prop.map((x, i) => {
                                        const isNew = !curByName.has(x.name);
                                        const changed = !isNew && curByName.get(x.name) !== x.qty;
                                        return (
                                          <li key={i} className={isNew ? "text-emerald-700 font-medium" : changed ? "text-amber-700" : "text-slate-700"}>
                                            {x.name} <span className="tabular-nums">×{x.qty}</span>
                                            {isNew && <span className="ml-1 text-[10px] uppercase">new</span>}
                                            {changed && <span className="ml-1 text-[10px] uppercase">was ×{curByName.get(x.name)}</span>}
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">
                                Currently
                              </p>
                              <p className="text-rose-700 line-through break-words">
                                {renderValue(currentVal)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">
                                Requested
                              </p>
                              <p className="text-emerald-700 underline decoration-emerald-400 decoration-2 underline-offset-2 break-words">
                                {renderValue(proposedVal)}
                              </p>
                            </div>
                          </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {!isPending && (
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                <p className="font-semibold text-slate-700">Audit</p>
                {request.reviewed_at && (
                  <p>
                    Reviewed {formatRelative(request.reviewed_at)}
                    {reviewerName ? ` by ${reviewerName}` : ""}
                  </p>
                )}
                {request.review_notes && (
                  <p className="text-slate-600">
                    Note: {request.review_notes}
                  </p>
                )}
                {request.applied_snapshot &&
                  Array.isArray(
                    (request.applied_snapshot as any).applied_keys,
                  ) && (
                    <p className="text-slate-600">
                      Applied keys:{" "}
                      {(request.applied_snapshot as any).applied_keys
                        .map((k: string) => FIELD_LABELS[k] || k)
                        .join(", ")}
                    </p>
                  )}
                {request.applied_snapshot &&
                  (request.applied_snapshot as any).cascade && (
                    <p className="text-slate-600">
                      Re-synced: {describeCascade((request.applied_snapshot as any).cascade)}
                    </p>
                  )}
              </section>
            )}

            {isPending && (
              <section className="space-y-3 border-t border-slate-200 pt-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="amendment-review-notes"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Review notes (optional, shared with the client on reject)
                  </Label>
                  <Textarea
                    id="amendment-review-notes"
                    rows={2}
                    placeholder="A short note for the client or your team..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => submitReview("reject")}
                    disabled={busy}
                    className="text-rose-700 border-rose-200 hover:bg-rose-50"
                  >
                    <XCircle className="w-4 h-4 mr-1.5" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={handlePrimaryApprove}
                    disabled={busy}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    {busy
                      ? "Working..."
                      : proposedKeys.length > 1 &&
                          !proposedKeys.every((k) => selectedKeys[k])
                        ? "Approve selected"
                        : "Approve all"}
                  </Button>
                </div>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface CancellationRow {
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
  reviewed_by_user_id?: string | null;
  review_notes: string | null;
  refund_amount_calculated: number | null;
  refund_amount_approved: number | null;
  policy_snapshot: any;
}

const fmtZAR = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
});

interface CancellationDrawerProps {
  open: boolean;
  cancellationId: string | null;
  orderId: string | null;
  onClose: () => void;
  onActioned: () => void;
  onEditOrder?: (orderId: string) => void;
}

export function CancellationReviewDrawer({
  open,
  cancellationId,
  orderId,
  onClose,
  onActioned,
  onEditOrder,
}: CancellationDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [request, setRequest] = useState<CancellationRow | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [reviewerName, setReviewerName] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [refundOverride, setRefundOverride] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !cancellationId) {
      setRequest(null);
      setOrder(null);
      setReviewerName(null);
      setReviewNotes("");
      setRefundOverride("");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: req, error: reqError } = await (supabase as any)
          .from("cancellation_requests")
          .select("*")
          .eq("id", cancellationId)
          .maybeSingle();
        if (reqError) {
          console.error("[CancellationReviewDrawer] cancellation_requests fetch failed:", reqError);
        }
        if (cancelled) return;
        setRequest(req || null);

        const targetOrderId = orderId || (req as any)?.order_id;
        if (targetOrderId) {
          const { data: ord, error: ordError } = await (supabase as any)
            .from("orders")
            .select("id, order_number, client_name, status")
            .eq("id", targetOrderId)
            .maybeSingle();
          if (ordError) {
            console.error("[CancellationReviewDrawer] orders fetch failed:", ordError);
          }
          if (cancelled) return;
          setOrder(ord || null);
        }

        if ((req as any)?.reviewed_by_user_id) {
          const { data: prof, error: profError } = await (supabase as any)
            .from("profiles")
            .select("full_name, email")
            .eq("id", (req as any).reviewed_by_user_id)
            .maybeSingle();
          if (profError) {
            console.error("[CancellationReviewDrawer] profiles fetch failed:", profError);
          }
          if (!cancelled) {
            setReviewerName(
              (prof as any)?.full_name || (prof as any)?.email || null,
            );
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, cancellationId, orderId]);

  const isPending = request?.status === "pending";
  const isPostpone = request?.request_type === "postpone";

  const submit = async (approve: boolean) => {
    if (!request) return;
    setBusy(true);
    try {
      const body: any = {
        request_id: request.id,
        action: approve ? "approve" : "reject",
      };
      if (!approve && reviewNotes) body.review_notes = reviewNotes;
      if (approve && reviewNotes) body.review_notes = reviewNotes;
      if (approve && request.request_type === "cancel" && refundOverride) {
        const n = Number(refundOverride);
        if (!Number.isNaN(n)) body.refund_override = n;
      }
      const res = await fetch("/api/orders/cancellation-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Action failed");
      toast({
        title: approve
          ? isPostpone
            ? "Postponement approved"
            : "Cancellation approved"
          : "Request rejected",
        description:
          j.refund_amount > 0
            ? `Refund of ${fmtZAR.format(j.refund_amount)} pending. Mark paid on /admin/refunds.`
            : undefined,
      });
      onActioned();
      onClose();
    } catch (e: any) {
      toast({
        title: "Action failed",
        description: e?.message || "Network error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const TypeIcon = isPostpone ? CalendarIcon : CalendarX;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <TypeIcon className="w-5 h-5 text-rose-600" />
            {isPostpone ? "Postponement review" : "Cancellation review"}
          </SheetTitle>
          <SheetDescription>
            {order?.order_number ? `Order ${order.order_number}` : "Order"}
            {order?.client_name ? ` - ${order.client_name}` : ""}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="text-sm text-slate-500 mt-6">Loading request...</div>
        ) : !request ? (
          <div className="text-sm text-slate-500 mt-6">
            Request not found.
          </div>
        ) : (
          <div className="space-y-5 mt-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="capitalize">
                {request.status}
              </Badge>
              <span className="text-xs text-slate-500">
                Requested {formatRelative(request.created_at)}
              </span>
              {order?.id && onEditOrder && (
                <button
                  type="button"
                  onClick={() => onEditOrder(order.id)}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                >
                  <Edit className="w-3 h-3" />
                  Edit the order directly
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 text-sm">
              <div className="p-3">
                <p className="text-xs font-semibold text-slate-700 mb-1">
                  Request type
                </p>
                <p className="capitalize">
                  {isPostpone ? "Postpone the event" : "Cancel the order"}
                </p>
              </div>
              {isPostpone && request.requested_postpone_date && (
                <div className="p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">
                    Requested new date
                  </p>
                  <p>
                    {new Date(request.requested_postpone_date).toLocaleDateString(
                      "en-ZA",
                      { day: "numeric", month: "long", year: "numeric" },
                    )}
                  </p>
                </div>
              )}
              {request.reason && (
                <div className="p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">
                    Reason
                  </p>
                  <p>{request.reason}</p>
                </div>
              )}
              {request.feedback && (
                <div className="p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">
                    Client message
                  </p>
                  <p className="italic text-slate-700">
                    &ldquo;{request.feedback}&rdquo;
                  </p>
                </div>
              )}
              {request.refund_amount_calculated !== null && (
                <div className="p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Receipt className="w-3 h-3" /> Calculated refund
                  </p>
                  <p>
                    {fmtZAR.format(Number(request.refund_amount_calculated))}
                  </p>
                  {request.refund_amount_approved !== null &&
                    Number(request.refund_amount_approved) !==
                      Number(request.refund_amount_calculated) && (
                      <p className="text-emerald-700 text-xs mt-1">
                        Approved:{" "}
                        {fmtZAR.format(Number(request.refund_amount_approved))}
                      </p>
                    )}
                </div>
              )}
              {request.policy_snapshot && (
                <div className="p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">
                    Policy snapshot
                  </p>
                  <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto">
                    {(() => {
                      try {
                        return JSON.stringify(request.policy_snapshot, null, 2);
                      } catch {
                        return "(unavailable)";
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>

            {!isPending && (
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                <p className="font-semibold text-slate-700">Audit</p>
                {request.reviewed_at && (
                  <p>
                    Reviewed {formatRelative(request.reviewed_at)}
                    {reviewerName ? ` by ${reviewerName}` : ""}
                  </p>
                )}
                {request.review_notes && (
                  <p className="text-slate-600">
                    Note: {request.review_notes}
                  </p>
                )}
              </section>
            )}

            {isPending && (
              <section className="space-y-3 border-t border-slate-200 pt-4">
                {!isPostpone && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cancel-refund-override"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Refund override (optional)
                    </Label>
                    <Input
                      id="cancel-refund-override"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder={
                        request.refund_amount_calculated !== null
                          ? `Default: ${fmtZAR.format(Number(request.refund_amount_calculated))}`
                          : "0.00"
                      }
                      value={refundOverride}
                      onChange={(e) => setRefundOverride(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="cancel-review-notes"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Review notes (optional, shared with the client on reject)
                  </Label>
                  <Textarea
                    id="cancel-review-notes"
                    rows={2}
                    placeholder="A short note for the client or your team..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => submit(false)}
                    disabled={busy}
                    className="text-rose-700 border-rose-200 hover:bg-rose-50"
                  >
                    <XCircle className="w-4 h-4 mr-1.5" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => submit(true)}
                    disabled={busy}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    {busy ? "Working..." : "Approve"}
                  </Button>
                </div>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
