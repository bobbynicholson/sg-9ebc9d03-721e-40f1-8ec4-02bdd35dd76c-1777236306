/**
 * OrderTimesStrip - Wave 70.9
 *
 * Inline 5-pill strip on each order row showing the day-of-event
 * timing the admin needs at a glance:
 *
 *   1. Kitchen ready  - pickup_time (food done in the kitchen)
 *   2. Driver collect - pickup_time (same moment unless explicit
 *      collection_time is set)
 *   3. Drive          - delivery_time - pickup_time (computed)
 *   4. Delivery       - delivery_time (or setup_time, or
 *      event_time minus the tenant's "early arrival" buffer)
 *   5. Eating         - event_time (guests start eating)
 *
 * Pills with a real value show in a slate tone; computed-and-
 * missing ones show "--" in muted slate. The component is
 * deliberately tolerant of partial data because most tenants
 * won't have populated every timing field at first.
 *
 * Mount in the order row (admin/orders) next to the price.
 */
import { ChefHat, Truck, Route, MapPin, Utensils } from "lucide-react";

interface OrderTimesStripProps {
  /** Order row fields used to compute the times. All optional --
   *  the strip renders even when most are null. */
  event_time?: string | null;
  pickup_time?: string | null;
  setup_time?: string | null;
  delivery_time?: string | null;
  /** Tenant default for "arrive at venue this many minutes before
   *  event_time". Used to derive a delivery time when delivery_time
   *  itself isn't set. Defaults to 30. */
  earlyArrivalMin?: number;
  /** Tenant default for "kitchen needs this many minutes between
   *  ready and event start" - fallback when pickup_time isn't set.
   *  Defaults to 90. */
  kitchenLeadMin?: number;
  className?: string;
}

/** Parse HH:mm[:ss] -> total minutes since midnight, or null. */
function parseHHmm(s: string | null | undefined): number | null {
  if (!s) return null;
  const [h, m] = s.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Format total minutes -> "HH:mm". */
function fmtTime(mins: number | null): string {
  if (mins == null || !Number.isFinite(mins)) return "--";
  // Wrap-around: if a buffer pulled us before midnight, show with
  // a leading "-d" marker so the operator notices.
  if (mins < 0) {
    const positive = (mins + 1440) % 1440;
    const h = Math.floor(positive / 60);
    const m = positive % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} -1d`;
  }
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Format duration in minutes -> "Xh Ym" or "Ym". */
function fmtDuration(mins: number | null): string {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return "--";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function OrderTimesStrip({
  event_time,
  pickup_time,
  setup_time,
  delivery_time,
  earlyArrivalMin = 30,
  kitchenLeadMin = 90,
  className,
}: OrderTimesStripProps) {
  const eat = parseHHmm(event_time);
  const pickup = parseHHmm(pickup_time);
  const setup = parseHHmm(setup_time);
  const deliv = parseHHmm(delivery_time);

  // Derived delivery: explicit delivery_time wins; else setup_time;
  // else event_time minus the tenant early-arrival buffer.
  const deliveryMin = deliv != null
    ? deliv
    : setup != null
      ? setup
      : eat != null
        ? eat - earlyArrivalMin
        : null;

  // Derived kitchen-ready / driver-collect: explicit pickup_time
  // wins; else event_time minus a kitchen-lead default.
  const readyMin = pickup != null
    ? pickup
    : eat != null
      ? eat - kitchenLeadMin
      : null;

  // Drive time: gap between collect and delivery.
  const driveMin = readyMin != null && deliveryMin != null && deliveryMin > readyMin
    ? deliveryMin - readyMin
    : null;

  // If the order has NO timing data at all, render nothing so the
  // strip doesn't take up empty space on lead-time-less orders.
  if (eat == null && pickup == null && setup == null && deliv == null) {
    return null;
  }

  const pills: Array<{ key: string; label: string; value: string; icon: React.ComponentType<{ className?: string }>; tone: "have" | "derived" | "missing" }> = [
    {
      key: "ready",
      label: "Kitchen ready",
      value: fmtTime(readyMin),
      icon: ChefHat,
      tone: pickup != null ? "have" : readyMin != null ? "derived" : "missing",
    },
    {
      key: "collect",
      label: "Driver collect",
      value: fmtTime(readyMin),
      icon: Truck,
      tone: pickup != null ? "have" : readyMin != null ? "derived" : "missing",
    },
    {
      key: "drive",
      label: "Drive",
      value: fmtDuration(driveMin),
      icon: Route,
      tone: driveMin != null ? "derived" : "missing",
    },
    {
      key: "delivery",
      label: "Delivery",
      value: fmtTime(deliveryMin),
      icon: MapPin,
      tone: deliv != null || setup != null ? "have" : deliveryMin != null ? "derived" : "missing",
    },
    {
      key: "eat",
      label: "Eating",
      value: fmtTime(eat),
      icon: Utensils,
      tone: eat != null ? "have" : "missing",
    },
  ];

  const toneClass = (t: "have" | "derived" | "missing") =>
    t === "have"     ? "bg-white border-slate-200 text-slate-800" :
    t === "derived"  ? "bg-slate-50 border-slate-200 text-slate-700 italic" :
                       "bg-slate-50 border-slate-200 text-slate-400";

  return (
    <div
      className={`flex items-center gap-1 flex-wrap ${className || ""}`}
      aria-label="Day-of-event timing"
    >
      {pills.map((p) => {
        const Icon = p.icon;
        return (
          <span
            key={p.key}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${toneClass(p.tone)}`}
            title={`${p.label}${p.tone === "derived" ? " (computed - not yet set on the order)" : ""}`}
          >
            <Icon className="w-3 h-3 text-slate-500" />
            <span className="text-slate-500 mr-0.5">{p.label}</span>
            <span>{p.value}</span>
          </span>
        );
      })}
    </div>
  );
}
