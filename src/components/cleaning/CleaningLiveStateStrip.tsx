/**
 * CleaningLiveStateStrip -- Wave 70.28
 *
 * The 4-metric "what's happening right now" strip that sits at the
 * top of the cleaning nav (below the mode badge). Each pill is a
 * tap target that deep-links straight into the filtered view.
 *
 *   Returns   -- handovers due in the next 4h (critical when overdue)
 *   Washing   -- in-progress handovers right now
 *   Damages   -- open damage reports (warning tone)
 *   On duty   -- live headcount on the cleaning floor
 *
 * Layout: 2x2 grid (drawer + collapsed-friendly).
 *
 * Empty-state: when everything is zero and no events out today, the
 * whole strip collapses to a single "All quiet" status pill rather
 * than four sad zeros.
 */
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";
import { useCleaningLiveCounts } from "@/hooks/useCleaningLiveCounts";
import { useCleaningPortalMode } from "@/hooks/useCleaningPortalMode";
import { PackageOpen, Droplets, AlertTriangle, Users, Sparkles } from "lucide-react";
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
  default:  "bg-cyan-50 hover:bg-cyan-100 border-cyan-200 text-cyan-900",
  warning:  "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900",
  critical: "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-900",
  info:     "bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-900",
  muted:    "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500",
};

const TONE_ICON_BG: Record<Pill["tone"], string> = {
  default:  "bg-cyan-200/70 text-cyan-700",
  warning:  "bg-amber-200/70 text-amber-700",
  critical: "bg-rose-200/70 text-rose-700",
  info:     "bg-blue-200/70 text-blue-700",
  muted:    "bg-slate-200/40 text-slate-400",
};

export function CleaningLiveStateStrip() {
  const { withSlug } = useTenantHref();
  const counts = useCleaningLiveCounts();
  const mode = useCleaningPortalMode();

  // Empty-state collapse: nothing live, no events out today, no open
  // damages. Single "All quiet" pill instead of four sad zeros.
  if (
    mode.outboundToday === 0
    && counts.returnsDue === 0
    && counts.inProgress === 0
    && counts.openDamages === 0
    && counts.onDutyNow === 0
    && !counts.loading
  ) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 px-3 py-2.5 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">All quiet</p>
          <p className="text-[10px] text-slate-500 truncate">No returns due, nothing in the wash.</p>
        </div>
      </div>
    );
  }

  // Wave 70.28a -- per-pill tooltip strings. The screen-reader
  // `aria` field used to be the only context the user got; sighted
  // users now also see the same hint on hover via `title`.
  const pills: Pill[] = [
    {
      key: "returns",
      label: "Returns",
      value: counts.loading ? "…" : String(counts.returnsDue),
      icon: PackageOpen,
      tone: counts.returnsDue > 0 ? "critical" : "muted",
      pulse: counts.returnsDue > 0,
      href: "/team-portal/cleaning/dashboard#returns",
      aria: `${counts.returnsDue} returns due in the next 4 hours. Tap to open the returns board.`,
    },
    {
      key: "washing",
      label: "Washing",
      value: counts.loading ? "…" : String(counts.inProgress),
      icon: Droplets,
      tone: counts.inProgress > 0 ? "default" : "muted",
      href: "/team-portal/cleaning/dashboard#washing",
      aria: `${counts.inProgress} handovers being washed right now. Tap to open the active jobs queue.`,
    },
    {
      key: "damages",
      label: "Damages",
      value: counts.loading ? "…" : String(counts.openDamages),
      icon: AlertTriangle,
      tone: counts.openDamages > 0 ? "warning" : "muted",
      href: "/team-portal/cleaning/damage",
      aria: `${counts.openDamages} open damage reports. Tap to open the damage register.`,
    },
    {
      key: "on-duty",
      label: "On duty",
      value: counts.loading ? "…" : String(counts.onDutyNow),
      icon: Users,
      tone: counts.onDutyNow > 0 ? "info" : "muted",
      href: "/team-portal/cleaning/dashboard",
      aria: `${counts.onDutyNow} cleaning staff on duty right now. Tap to open the team board.`,
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-1.5"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Cleaning live state"
    >
      {pills.map((p) => {
        const Icon = p.icon;
        return (
          <Link
            key={p.key}
            href={withSlug(p.href)}
            aria-label={p.aria}
            title={p.aria}
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
