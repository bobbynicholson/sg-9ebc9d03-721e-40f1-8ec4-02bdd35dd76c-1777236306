/**
 * KitchenLiveStateStrip - Wave 70.7b
 *
 * The 4-metric "what's happening right now" strip that sits at the
 * top of the kitchen nav (below the service mode badge). Each pill
 * is a tap target that deep-links straight into the filtered view.
 *
 *   Overdue   - prep tasks past start_at and not done
 *   On pass   - orders.status = 'ready' for today
 *   In prep   - orders today, status preparing/confirmed
 *   Next      - HH:mm of the next event (or "--" if none)
 *
 * Layout: 2x2 grid on mobile (drawer is 90vw), 4x1 horizontal on
 * desktop expanded sidebar. The grid switch is via Tailwind only.
 *
 * Empty-state: when all counts are zero and no event today, the
 * whole strip collapses to a friendly "All quiet" status pill.
 */
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";
import { useKitchenLiveCounts } from "@/hooks/useKitchenLiveCounts";
import { usePortalServiceMode } from "@/hooks/usePortalServiceMode";
import { Clock, Flame, ClipboardList, CalendarClock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Pill {
  key: string;
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "warning" | "critical" | "info" | "muted";
  href: string;
  pulse?: boolean;
  aria: string;
}

const TONE_BG: Record<Pill["tone"], string> = {
  default:  "bg-brand-primary/10 hover:bg-brand-primary/15 border-brand-primary/20 text-brand-primary",
  warning:  "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900",
  critical: "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-900",
  info:     "bg-brand-primary/10 hover:bg-brand-primary/15 border-brand-primary/20 text-brand-primary",
  muted:    "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500",
};

const TONE_ICON_BG: Record<Pill["tone"], string> = {
  default:  "bg-brand-primary/15 text-brand-primary",
  warning:  "bg-amber-200/70 text-amber-700",
  critical: "bg-rose-200/70 text-rose-700",
  info:     "bg-brand-primary/15 text-brand-primary",
  muted:    "bg-slate-200/40 text-slate-400",
};

export function KitchenLiveStateStrip() {
  const { withSlug } = useTenantHref();
  const counts = useKitchenLiveCounts();
  const serviceMode = usePortalServiceMode();

  // Empty-tenant / quiet treatment: no events today and zero
  // counts -> show a single "All quiet" status pill instead of
  // four sad zeros.
  if (
    serviceMode.todayEventCount === 0
    && counts.overdue === 0
    && counts.onPass === 0
    && counts.inPrep === 0
    && !counts.loading
  ) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 px-3 py-2.5 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">All quiet</p>
          <p className="text-[10px] text-slate-500 truncate">No events today, nothing pending</p>
        </div>
      </div>
    );
  }

  const nextEventLabel = serviceMode.firstEventTime
    ? serviceMode.firstEventTime.slice(0, 5)
    : "--";

  const pills: Pill[] = [
    {
      key: "overdue",
      label: "Overdue",
      value: counts.loading ? "…" : String(counts.overdue),
      icon: Clock,
      tone: counts.overdue > 0 ? "critical" : "muted",
      pulse: counts.overdue > 0,
      href: "/team-portal/kitchen/production?filter=overdue",
      aria: `${counts.overdue} overdue prep tasks. Tap to view.`,
    },
    {
      key: "on-pass",
      label: "On pass",
      value: counts.loading ? "…" : String(counts.onPass),
      icon: Flame,
      tone: counts.onPass > 0 ? "warning" : "muted",
      href: "/team-portal/kitchen/production?filter=ready",
      aria: `${counts.onPass} orders ready on the pass. Tap to view.`,
    },
    {
      key: "in-prep",
      label: "In prep",
      value: counts.loading ? "…" : String(counts.inPrep),
      icon: ClipboardList,
      tone: counts.inPrep > 0 ? "default" : "muted",
      href: "/team-portal/kitchen/prep-list",
      aria: `${counts.inPrep} items currently in prep. Tap to view.`,
    },
    {
      key: "next",
      label: "Next event",
      value: nextEventLabel,
      icon: CalendarClock,
      tone: serviceMode.minutesToNextEvent != null && serviceMode.minutesToNextEvent < 60
        ? "warning"
        : "info",
      href: "/team-portal/kitchen/today",
      aria: nextEventLabel === "--"
        ? "No upcoming event today"
        : `Next event at ${nextEventLabel}. Tap to open today's view.`,
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-1.5"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Kitchen live state"
    >
      {pills.map((p) => {
        const Icon = p.icon;
        return (
          <Link
            key={p.key}
            href={withSlug(p.href)}
            aria-label={p.aria}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-all active:scale-[0.98]",
              TONE_BG[p.tone],
            )}
          >
            <span
              className={cn(
                "flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center",
                TONE_ICON_BG[p.tone],
                p.pulse ? "motion-safe:animate-pulse" : "",
              )}
            >
              <Icon className="h-3 w-3" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold tabular-nums leading-none">
                {p.value}
              </span>
              <span className="block text-[9px] uppercase tracking-wider opacity-80 mt-0.5 leading-none truncate">
                {p.label}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
