/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC Wave B: top-of-document alert banners.
 *
 * One component, one stack. Each banner is conditionally rendered
 * based on the order's denormalised flags. Order of precedence:
 *
 *   1. Cancelled - terminal, hides everything else
 *   2. Postponed - terminal until resumed
 *   3. Time-to-event countdown (always shown if event is upcoming
 *      or recent, with an urgency colour band)
 *   4. comms_paused_until - client deliberately muted
 *   5. requires_refrigeration - cold-chain flag
 *   6. requires_two_drivers - dispatch needs a 2-person job
 *   7. final_order_change_date - amendment cutoff warning
 *
 * The countdown updates client-side every minute (cheap setInterval)
 * so the urgency band tracks real time without re-fetches.
 */
import { useEffect, useState } from "react";
import {
  Ban, Pause, Clock, BellOff, Snowflake, Users, CalendarClock, AlertCircle,
} from "lucide-react";

interface OrderShape {
  event_date: string;
  event_time: string | null;
  collection_time: string | null;
  status: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  postponed_at: string | null;
  paused_reason: string | null;
  paused_expected_resume_date: string | null;
  paused_from_status: string | null;
  comms_paused_until: string | null;
  requires_refrigeration: boolean | null;
  requires_two_drivers: boolean | null;
  final_order_change_date: string | null;
}

interface Props {
  order: OrderShape;
}

function fmtAbs(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Build a Date from event_date (YYYY-MM-DD) + a time string (HH:MM:SS or HH:MM).
 * Returns null if either piece is missing.
 */
function combineDateTime(date: string, time: string | null): Date | null {
  if (!date) return null;
  const t = time || "00:00:00";
  // event_date is a calendar date - parse as local, not UTC.
  const iso = `${date}T${t.length === 5 ? t + ":00" : t}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function OrderAlertBanners({ order }: Props) {
  // Tick once a minute so the countdown stays fresh without re-fetching.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // 1. Cancelled - terminal, takes over the strip
  if (order.cancelled_at) {
    return (
      <div className="flex items-start gap-3 p-3 mb-3 rounded-lg border-2 border-rose-300 bg-rose-50">
        <Ban className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-rose-900 uppercase tracking-wider">Order cancelled</p>
          <p className="text-xs text-rose-800 mt-0.5">
            {fmtAbs(order.cancelled_at)}
            {order.cancellation_reason && <span> · {order.cancellation_reason}</span>}
          </p>
        </div>
      </div>
    );
  }

  // 2. Postponed - terminal until resumed
  const postponed = !!order.postponed_at || order.status === "paused";
  // Build the rest of the stack:
  const banners: Array<{ key: string; node: JSX.Element }> = [];

  if (postponed) {
    banners.push({
      key: "postponed",
      node: (
        <div className="flex items-start gap-3 p-3 rounded-lg border-2 border-amber-300 bg-amber-50">
          <Pause className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-900 uppercase tracking-wider">Order postponed</p>
            <p className="text-xs text-amber-800 mt-0.5">
              {fmtAbs(order.postponed_at)}
              {order.paused_reason && <span> · {order.paused_reason}</span>}
              {order.paused_expected_resume_date && (
                <span> · Resume {fmtDate(order.paused_expected_resume_date)}</span>
              )}
              {order.paused_from_status && (
                <span className="ml-2 text-[10px] uppercase tracking-wider bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                  was {order.paused_from_status}
                </span>
              )}
            </p>
          </div>
        </div>
      ),
    });
  }

  // 3. Time-to-event countdown - the headline urgency signal.
  // Use event_time as the target (or 12:00 default if missing). For
  // pre-event the countdown points at the event. After event_date
  // is in the past we stop counting (different banners take over).
  const eventStart = combineDateTime(order.event_date, order.event_time);
  if (eventStart && !postponed) {
    const msToEvent = eventStart.getTime() - now.getTime();
    const isOverdue = msToEvent < 0;
    const absMs = Math.abs(msToEvent);
    const days = Math.floor(absMs / 86_400_000);
    const hours = Math.floor((absMs % 86_400_000) / 3_600_000);
    const mins = Math.floor((absMs % 3_600_000) / 60_000);

    // Urgency colour band - based on hours-to-event when in future.
    let tone = "bg-slate-50 border-slate-200 text-slate-800";
    let label = "Time to event";
    if (isOverdue) {
      // Past event - skip the banner entirely once order is closed.
      if (order.status === "completed" || order.status === "delivered") {
        // suppress - it's done
      } else {
        tone = "bg-rose-50 border-rose-300 text-rose-900";
        label = "Event was";
      }
    } else {
      const hoursLeft = msToEvent / 3_600_000;
      if (hoursLeft < 2) tone = "bg-rose-50 border-rose-300 text-rose-900";
      else if (hoursLeft < 24) tone = "bg-orange-50 border-orange-300 text-orange-900";
      else if (hoursLeft < 72) tone = "bg-amber-50 border-amber-300 text-amber-900";
      else if (hoursLeft < 168) tone = "bg-blue-50 border-blue-300 text-blue-900";
      else tone = "bg-slate-50 border-slate-200 text-slate-800";
    }

    const show = !isOverdue || (order.status !== "completed" && order.status !== "delivered");
    if (show) {
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0 || days > 0) parts.push(`${hours}h`);
      parts.push(`${mins}m`);
      banners.push({
        key: "countdown",
        node: (
          <div className={`flex items-center gap-3 p-3 rounded-lg border-2 ${tone}`}>
            <Clock className="w-5 h-5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wider font-semibold opacity-80">{label}</p>
              <p className="text-lg font-bold tabular-nums leading-tight">
                {isOverdue ? "T+" : "T-"}{parts.join(" ")}
              </p>
            </div>
            <div className="text-right text-xs tabular-nums opacity-75">
              <p>{eventStart.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}</p>
              {order.event_time && <p>{order.event_time.slice(0, 5)}</p>}
            </div>
          </div>
        ),
      });
    }
  }

  // 4. comms_paused_until - operator must NOT chase the client
  if (order.comms_paused_until && new Date(order.comms_paused_until) > now) {
    banners.push({
      key: "comms-paused",
      node: (
        <div className="flex items-start gap-2 p-2.5 rounded-md border border-slate-300 bg-slate-50">
          <BellOff className="w-4 h-4 border-slate-300 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-slate-900">Client comms paused</p>
            <p className="text-slate-900">No automated comms will go out until {fmtDate(order.comms_paused_until)}. Operators should not chase manually either.</p>
          </div>
        </div>
      ),
    });
  }

  // 5. Cold-chain flag - critical for driver + kitchen handoff
  if (order.requires_refrigeration) {
    banners.push({
      key: "cold-chain",
      node: (
        <div className="flex items-start gap-2 p-2.5 rounded-md border border-brand-primary/30 bg-brand-primary/10">
          <Snowflake className="w-4 h-4 text-brand-primary flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-brand-primary">Cold chain required</p>
            <p className="text-brand-primary">Refrigerated transport mandatory. Driver must use a cold-chain capable vehicle. Stage time at room temperature is the failure mode.</p>
          </div>
        </div>
      ),
    });
  }

  // 6. Two-driver / two-person job flag
  if (order.requires_two_drivers) {
    banners.push({
      key: "two-drivers",
      node: (
        <div className="flex items-start gap-2 p-2.5 rounded-md border border-blue-300 bg-blue-50">
          <Users className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-blue-900">Two-driver job</p>
            <p className="text-blue-800">Heavy load or two-stop run. Dispatch must assign a secondary driver / vehicle.</p>
          </div>
        </div>
      ),
    });
  }

  // 7. Cancellation / amendment cutoff - if final_order_change_date
  // is in the future but inside 72h, show as countdown.
  if (order.final_order_change_date) {
    const cutoff = new Date(order.final_order_change_date);
    const msToCutoff = cutoff.getTime() - now.getTime();
    const hoursToCutoff = msToCutoff / 3_600_000;
    if (msToCutoff > 0 && hoursToCutoff < 72) {
      banners.push({
        key: "amendment-cutoff",
        node: (
          <div className="flex items-start gap-2 p-2.5 rounded-md border border-amber-300 bg-amber-50">
            <CalendarClock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-semibold text-amber-900">Amendment cutoff approaching</p>
              <p className="text-amber-800">
                Final changes by {fmtAbs(order.final_order_change_date)}.
                {hoursToCutoff < 24 && <span className="font-semibold"> Under 24 hours.</span>}
              </p>
            </div>
          </div>
        ),
      });
    } else if (msToCutoff <= 0 && order.status !== "completed" && order.status !== "delivered" && order.status !== "cancelled") {
      banners.push({
        key: "amendment-closed",
        node: (
          <div className="flex items-start gap-2 p-2.5 rounded-md border border-slate-300 bg-slate-100">
            <AlertCircle className="w-4 h-4 text-slate-700 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-semibold text-slate-900">Amendments closed</p>
              <p className="text-slate-700">Cutoff was {fmtAbs(order.final_order_change_date)}. Late changes require admin override.</p>
            </div>
          </div>
        ),
      });
    }
  }

  if (banners.length === 0) return null;

  return (
    <div className="space-y-2 mb-3 print:hidden">
      {banners.map((b) => <div key={b.key}>{b.node}</div>)}
    </div>
  );
}
