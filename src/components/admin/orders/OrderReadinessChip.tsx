/**
 * OrderReadinessChip - Wave 46 T2.
 *
 * Single full-width pill at the top of the order card. Replaces the
 * old "NEXT TO DO" banner. Shows the green/orange/red logistics
 * traffic light + headline + subhead for the most pressing missing
 * piece. Click the chevron to expand into the per-signal breakdown
 * (each row has a deep-link "Fix it" button).
 *
 * Bobby's "lovely vibe" register - emerald for green, amber for
 * orange, rose for red. No "ACT NOW" alarmist copy. Goal is to make
 * Callum feel held, not policed.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, AlertCircle, ExternalLink, Loader2, Sparkles, Flag } from "lucide-react";
import type { OrderReadiness, ReadinessSignal } from "@/services/order/orderReadiness";
import { useTenantHref } from "@/lib/tenantUrl";
import { useToast } from "@/hooks/use-toast";
import { emitOrderUpdated } from "@/lib/events/orderEvents";

// Wave 56 - emerald retired in favour of green per the existing
// TimelineTrack docstring: "green-500 (not emerald-500) is the
// unambiguous hospital-cross green; emerald reads as teal which
// muddied the signal". Pulse on the rose chip removed - the colour
// + ring already carries enough urgency, and the previous pulse
// stacked with the timeline's stage-dot pulse on the same row, two
// out-of-sync heartbeats.
const TONE: Record<OrderReadiness["chip"], {
  card: string;
  dot: string;
  label: string;
  Icon: any;
  pulse: string;
}> = {
  green: {
    card: "bg-green-50 border-green-200",
    dot: "bg-green-500",
    label: "text-green-800",
    Icon: CheckCircle2,
    pulse: "",
  },
  orange: {
    card: "bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
    label: "text-amber-800",
    Icon: AlertTriangle,
    pulse: "",
  },
  red: {
    card: "bg-rose-50 border-rose-300 ring-1 ring-rose-200",
    dot: "bg-rose-500",
    label: "text-rose-800",
    Icon: AlertCircle,
    pulse: "",
  },
};

interface Props {
  readiness: OrderReadiness;
  /** Optional click target for the headline - typically opens the
   *  order detail drawer. */
  onOpen?: () => void;
  /** Wave 70.9 - order id so action buttons can POST to the
   *  right entity (e.g. regenerate-prep-tasks). */
  orderId?: string;
  /** Wave 70.9 - called after a successful action so the page
   *  can refetch / refresh state. */
  onActionComplete?: () => void;
  /** Wave 70.16 - event date in ISO YYYY-MM-DD. When supplied,
   *  enables silent auto-heal of missing prep tasks on future
   *  events so admin never has to manually click "Generate now"
   *  on a fresh order. Past events still require explicit manual
   *  override (the operator must consciously backfill history). */
  eventDate?: string | null;
  /** Wave 70.22 - order status + event_time so the chip can
   *  surface a Close out button when the order is past its
   *  event but still in a non-terminal state. Admin gates the
   *  button visibility at the page level via canShowCloseOut. */
  eventTime?: string | null;
  status?: string | null;
  /** Wave 70.22 - when true, the chip renders a Close out
   *  button on past-event non-terminal orders that fires the
   *  force-close API. Page-level role gate (admin / owner). */
  canShowCloseOut?: boolean;
  /** Wave 70.93 - opt OUT of the silent auto-heal effect. Default
   *  false (= heal on every mount). The admin orders list page
   *  renders this chip per row, so the default behaviour fired N
   *  parallel /api/orders/regenerate-prep-tasks POSTs per page
   *  load. Setting this true on the list path keeps the auto-heal
   *  exclusive to the order modal context. */
  disableAutoHeal?: boolean;
}

// Wave 70.58 - the session-once sessionStorage gate was removed.
// It trapped orders into permanent failure when the first auto-heal
// attempt ran before the operator had pickup_time set or had
// finished adding items; the gate marked the order "attempted" and
// the silent retry path was killed. Replaced with a per-mount ref
// gate at the call-site so we still don't fire on every render of
// the same mount, but each fresh modal open gets a clean retry.

export function OrderReadinessChip({
  readiness,
  onOpen,
  orderId,
  onActionComplete,
  eventDate,
  eventTime,
  status,
  disableAutoHeal,
  canShowCloseOut,
}: Props) {
  const [open, setOpen] = useState(false);
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const tone = TONE[readiness.chip];
  const Icon = tone.Icon;
  const failingCount = readiness.failingHigh.length + readiness.failingMedium.length;
  const autoHealFiredRef = useRef<string | null>(null);
  const [closingOut, setClosingOut] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);

  // Wave 70.22 - decide whether to surface the Close out button.
  // Three conditions: caller opted-in (admin/owner page), order
  // status is non-terminal, event is in the past.
  const showCloseOut = (() => {
    if (!canShowCloseOut || !orderId) return false;
    const s = (status || "").toString().toLowerCase();
    if (["delivered", "completed", "cancelled", "refunded"].includes(s)) return false;
    if (!eventDate) return false;
    const dt = eventTime
      ? new Date(`${eventDate}T${String(eventTime).slice(0, 8)}`)
      : new Date(`${eventDate}T12:00:00`);
    if (isNaN(dt.getTime())) return false;
    return dt.getTime() < Date.now();
  })();

  const handleCloseOut = async () => {
    if (!orderId) return;
    if (!closeConfirm) {
      setCloseConfirm(true);
      // Auto-clear confirm after 5s if not acted on, so the
      // button doesn't stay in confirm-pending forever.
      setTimeout(() => setCloseConfirm(false), 5000);
      return;
    }
    setClosingOut(true);
    try {
      const r = await fetch(`/api/orders/${orderId}/force-close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "Closed from order readiness chip" }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Couldn't close order", description: data.error || "Server error", variant: "destructive" });
        return;
      }
      toast({ title: "Order closed", description: data.message });
      // Wave 70.40: notify every listening surface (calendar,
      // invoices, dashboard widgets) so they refetch without a
      // hard refresh. force-close changes status + stamps + may
      // mark prep tasks done - big enough state delta to ping
      // everyone.
      emitOrderUpdated(orderId, "readiness-chip:force-close", ["status", "prep"]);
      onActionComplete?.();
    } catch (e: any) {
      toast({ title: "Close failed", description: e?.message, variant: "destructive" });
    } finally {
      setClosingOut(false);
      setCloseConfirm(false);
    }
  };

  // Wave 70.58 - silent auto-heal of missing prep tasks. When the
  // chip detects the kitchen_prep_tasks_present signal failing AND
  // the order event is today or later, silently fire the regen
  // endpoint. The API is idempotent (returns "already_has_pending_
  // tasks" no-op when tasks exist, "no_menu_items_or_no_pickup_time"
  // when the planner has no work to do) so calling on every chip
  // render is cheap.
  //
  // Pre-Wave-70.58 the heal was gated by a sessionStorage "attempted
  // once per orderId per browser session" flag. That gate was
  // designed to prevent loops but ended up trapping orders into
  // permanent failure - if the first attempt ran while the operator
  // hadn't yet set pickup_time or added items, the order was marked
  // attempted and the chip's "Generate prep tasks" button was the
  // only recovery surface. Per owner brief 2026-05-22: no manual
  // buttons; everything automatic. Gate removed.
  //
  // Per-mount ref prevents a render storm within the same modal
  // session from re-firing - we re-fire once per orderId per mount
  // cycle, not once per session.
  useEffect(() => {
    if (!orderId) return;
    // Wave 70.93: opt-out gate for list contexts. The orders list
    // renders this chip per row, so without the gate each row's
    // effect fires a POST to /api/orders/regenerate-prep-tasks
    // on mount - up to N parallel POSTs per page load on a busy
    // tenant. Pages that render the chip in a list pass
    // disableAutoHeal so heal stays exclusive to the modal
    // context (where the operator just opened a specific order
    // and a missing-prep state is genuinely actionable in
    // foreground).
    if (disableAutoHeal) return;
    if (autoHealFiredRef.current === orderId) return;

    const prepSignal = readiness.failingHigh.find((s) => s.key === "kitchen_prep_tasks_present");
    if (!prepSignal) return;

    // Gate: only auto-heal future events. Past events would need a
    // force=true override that's never operator-friendly to surface
    // automatically (we don't know if the operator wants paperwork
    // backfilled or whether the order is just stale).
    if (eventDate) {
      const todayIso = new Date().toISOString().slice(0, 10);
      if (String(eventDate).slice(0, 10) < todayIso) return;
    } else {
      return;
    }

    autoHealFiredRef.current = orderId;

    void (async () => {
      try {
        const r = await fetch("/api/orders/regenerate-prep-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ order_id: orderId, force: true }),
        });
        const data = await r.json();
        if (r.ok && data?.created > 0) {
          onActionComplete?.();
        }
      } catch {
        /* silent - the next modal open will retry */
      }
    })();
  }, [orderId, eventDate, readiness.failingHigh, onActionComplete, disableAutoHeal]);

  // Wave 57 - shared focus-visible utility for the raw <button>
  // elements inside the chip. Pre-Wave-57 keyboard users got
  // nothing on tab focus.
  const focusRing = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

  return (
    <div className={`rounded-lg border ${tone.card} dark:bg-slate-800 dark:border-slate-700 px-3 py-2 mb-2`}>
      {/* Headline row */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex w-7 h-7 rounded-full items-center justify-center shrink-0 ${tone.dot} ${tone.pulse}`}
          aria-hidden="true"
        >
          <Icon className="w-4 h-4 text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${tone.label} dark:text-slate-100`}>
            {readiness.headline}
          </div>
          <div className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 truncate">
            {readiness.subhead}
          </div>
        </div>
        {/* Wave 70.22 - Close out button on past-event non-terminal
            orders so admin can tidy up paperwork without leaving the
            chip. Two-step confirm pattern: first tap arms it ("Sure?"
            label), second tap fires the API. Auto-clears after 5s
            so the button doesn't stay armed forever. */}
        {showCloseOut && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleCloseOut(); }}
            disabled={closingOut}
            className={`text-xs font-semibold flex-shrink-0 px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-all ${focusRing} ${
              closeConfirm
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
            title={closeConfirm ? "Tap again to confirm" : "Force-close: marks prep done + stamps delivery + flips status"}
          >
            {closingOut
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Flag className="w-3.5 h-3.5" />}
            {closingOut ? "Closing..." : closeConfirm ? "Sure? Tap again" : "Close out"}
          </button>
        )}
        {onOpen && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className={`text-xs font-semibold flex-shrink-0 px-3 py-1.5 rounded-md text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 ${focusRing}`}
          >
            Open →
          </button>
        )}
        {failingCount > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-600 hover:bg-white/60 shrink-0 ${focusRing}`}
            aria-label={open ? "Collapse details" : "Expand details"}
            aria-expanded={open}
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Expanded per-signal breakdown */}
      {open && failingCount > 0 && (
        <ul className="mt-2 space-y-1 border-t border-white/40 pt-2">
          {[...readiness.failingHigh, ...readiness.failingMedium].map((sig) => (
            <SignalRow
              key={sig.key}
              signal={sig}
              withSlug={withSlug}
              orderId={orderId}
              onActionComplete={onActionComplete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SignalRow({
  signal,
  withSlug,
  orderId,
}: {
  signal: ReadinessSignal;
  withSlug: (href: string) => string;
  orderId?: string;
  /** Wave 70.58: prop retained on the parent's call site for the
   *  general SignalRow shape, but with regenerate_prep_tasks now
   *  auto-healing silently there's no longer an action that fires
   *  this from a child row. Future button-based actionTypes can
   *  thread it back in. */
  onActionComplete?: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const dotTone = signal.severity === "high" ? "bg-rose-500" : "bg-amber-500";

  // Wave 70.58: the regenerate_prep_tasks actionType no longer
  // surfaces a manual button. The parent chip's auto-heal effect
  // fires the same API silently on every mount for future-dated
  // orders, so a visible "Generate prep tasks" trigger was just
  // adding a failure surface (operators clicked it before the
  // order had pickup_time set and got a confusing error). Other
  // actionTypes can still land here as buttons.
  const runAction = async () => {
    if (!orderId || !signal.actionType) return;
    setBusy(true);
    try {
      // Reserved for future actionTypes. regenerate_prep_tasks now
      // auto-heals silently from the parent useEffect.
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const label = signal.actionLabel || "Fix it";
  const isAutoHealing = signal.actionType === "regenerate_prep_tasks";

  return (
    <li className="flex items-start gap-2 text-xs">
      <span className={`mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${dotTone}`} aria-hidden="true" />
      <span className="flex-1 text-slate-800">{signal.message}</span>
      {isAutoHealing ? (
        // Passive indicator - the auto-heal effect on the parent
        // is running this in the background. No click needed.
        <span
          className="text-[11px] text-slate-500 inline-flex items-center gap-1 shrink-0"
          title="Prep tasks generate automatically once the order has menu items + a pickup time. Re-opens of this modal will retry."
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          Auto-generating
        </span>
      ) : signal.actionType ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void runAction(); }}
          disabled={busy}
          className="text-xs font-semibold text-orange-700 hover:text-orange-900 inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {busy ? "Generating..." : label}
        </button>
      ) : signal.actionLink ? (
        <Link
          href={withSlug(signal.actionLink)}
          onClick={(e) => e.stopPropagation()}
          scroll={false}
          className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-0.5 shrink-0"
        >
          Fix it <ExternalLink className="w-3 h-3" />
        </Link>
      ) : null}
    </li>
  );
}
