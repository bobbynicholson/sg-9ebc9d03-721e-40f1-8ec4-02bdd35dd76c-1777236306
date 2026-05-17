/**
 * AdminLiveStateStrip -- Wave 70.31
 *
 * The live-state pill grid at the top of the admin nav (below the
 * mode badge). Surfaces the most-pressing numbers so the owner can
 * see what's happening without leaving the current page.
 *
 * Desktop: 2 rows of 3 pills (6 total)
 *   Row 1: Events / Live / Quotes (ops-side)
 *   Row 2: Revenue / Unpaid / Alerts (money-side, gated)
 *
 * Mobile: just row 1 (4 pills max if non-finance role -- alerts
 * promoted into row 1 in place of Live when no events today).
 *
 * Each pill is a tap target deep-linking to the right page. Tones
 * follow the established critical/warning/default/info/muted system.
 *
 * Empty-state collapse: when every count is zero and the role can't
 * see finance (so revenue/unpaid would be hidden anyway), the whole
 * strip collapses to one "All quiet" status pill.
 */
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";
import { useAdminLiveCounts } from "@/hooks/useAdminLiveCounts";
import { useAdminPortalMode } from "@/hooks/useAdminPortalMode";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useAuth } from "@/contexts/AuthContext";
import {
  Calendar, Truck, FileSpreadsheet, Wallet, AlertTriangle, DollarSign, Sparkles, UserPlus,
} from "lucide-react";
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
  default:  "bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-900",
  warning:  "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900",
  critical: "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-900",
  info:     "bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-900",
  muted:    "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500",
};

const TONE_ICON_BG: Record<Pill["tone"], string> = {
  default:  "bg-purple-200/70 text-purple-700",
  warning:  "bg-amber-200/70 text-amber-700",
  critical: "bg-rose-200/70 text-rose-700",
  info:     "bg-blue-200/70 text-blue-700",
  muted:    "bg-slate-200/40 text-slate-400",
};

export function AdminLiveStateStrip() {
  const { withSlug } = useTenantHref();
  const { user, profile } = useAuth();
  const companyId = ((profile as { company_id?: string } | null)?.company_id)
    || ((user as { company_id?: string } | null)?.company_id);
  const tenantCurrency = useTenantCurrency(companyId ?? null);
  const counts = useAdminLiveCounts();
  const mode = useAdminPortalMode();

  // Empty-state: collapse the whole strip to one pill when nothing
  // is happening AND the role can't see finance (which would justify
  // showing R0 spend tracking even on quiet days).
  if (
    counts.eventsToday === 0
    && counts.inTransitNow === 0
    && counts.quotesOverdue === 0
    && counts.dispatchGaps === 0
    && counts.alertsTotal === 0
    && counts.newLeadsToday === 0
    && (!counts.canSeeFinance || (counts.revenueToday === 0 && counts.unpaidValue === 0))
    && !counts.loading
  ) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 px-3 py-2.5 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">All quiet</p>
          <p className="text-[10px] text-slate-500 truncate">
            {mode.mode === "setup" ? "Finish onboarding to get going." : "Nothing pressing right now."}
          </p>
        </div>
      </div>
    );
  }

  // Money pill formatter: tenant currency, k-suffix at >= 10k to
  // keep pill width tight on narrow screens.
  const fmtMoney = (n: number) => {
    if (!n) return tenantCurrency.symbol + "0";
    if (n >= 10_000) return `${tenantCurrency.symbol}${(n / 1000).toFixed(0)}k`;
    return tenantCurrency.format(Math.round(n), 0);
  };

  // Wave 70.41b -- shortened labels so they fit the 256-288px sidebar
  // without truncating to "OVER..." / "REVEN..." / "ALERT..." which
  // Bobby flagged as confusing. Each label now <= 6 chars, fits the
  // pill's ~70-80px column at 9px text comfortably. Full meaning is
  // surfaced via the aria/title tooltip so hovering gives the long
  // form ("Quotes overdue > 48h", "Today's revenue", etc).
  const row1: Pill[] = [
    {
      key: "events",
      label: "Events",
      value: counts.loading ? "…" : String(counts.eventsToday),
      icon: Calendar,
      tone: counts.eventsToday > 0 ? "default" : "muted",
      pulse: counts.eventsToday > 0 && counts.inTransitNow > 0,
      href: "/admin/calendar",
      aria: `${counts.eventsToday} event${counts.eventsToday === 1 ? "" : "s"} today. Tap to open the calendar.`,
    },
    {
      key: "live",
      label: "Live",
      value: counts.loading ? "…" : String(counts.inTransitNow),
      icon: Truck,
      tone: counts.inTransitNow > 0 ? "critical" : "muted",
      pulse: counts.inTransitNow > 0,
      href: "/admin/tracking",
      aria: `${counts.inTransitNow} order${counts.inTransitNow === 1 ? "" : "s"} on the road right now. Tap to open live operations.`,
    },
    {
      key: "quotes",
      label: "Quotes",
      value: counts.loading ? "…" : String(counts.quotesOverdue),
      icon: FileSpreadsheet,
      tone: counts.quotesOverdue > 0 ? "warning" : "muted",
      href: "/admin/quotes",
      aria: `${counts.quotesOverdue} quote${counts.quotesOverdue === 1 ? "" : "s"} overdue (> 48h with no client response). Tap to follow up.`,
    },
  ];

  // Row 2: money + alerts. Money pills hidden for non-finance roles.
  const row2: Pill[] = [];
  if (counts.canSeeFinance) {
    row2.push({
      key: "revenue",
      label: "Today",
      value: counts.loading ? "…" : fmtMoney(counts.revenueToday),
      icon: DollarSign,
      tone: counts.revenueToday > 0 ? "info" : "muted",
      href: "/admin/financial-dashboard",
      aria: `Today's revenue: ${tenantCurrency.format(counts.revenueToday)}. Tap to open the financial dashboard.`,
    });
    row2.push({
      key: "unpaid",
      label: "Unpaid",
      value: counts.loading ? "…" : fmtMoney(counts.unpaidValue),
      icon: Wallet,
      tone: counts.unpaidValue > 0 ? "warning" : "muted",
      href: "/admin/invoices",
      // Wave 70.41b -- aria text updated to match the new query
      // semantics (all outstanding, not just past-due overdue).
      aria: `Outstanding invoices total: ${tenantCurrency.format(counts.unpaidValue)}. Tap to chase.`,
    });
  } else {
    // Non-finance: replace money pills with new-leads + dispatch-gaps
    // so the row still earns its space.
    row2.push({
      key: "leads",
      label: "Leads",
      value: counts.loading ? "…" : String(counts.newLeadsToday),
      icon: UserPlus,
      tone: counts.newLeadsToday > 0 ? "info" : "muted",
      href: "/admin/leads",
      aria: `${counts.newLeadsToday} new lead${counts.newLeadsToday === 1 ? "" : "s"} today. Tap to open the leads inbox.`,
    });
    row2.push({
      key: "gaps",
      label: "Gaps",
      value: counts.loading ? "…" : String(counts.dispatchGaps),
      icon: AlertTriangle,
      tone: counts.dispatchGaps > 0 ? "critical" : "muted",
      href: "/admin/order-assignments",
      aria: `${counts.dispatchGaps} confirmed order${counts.dispatchGaps === 1 ? "" : "s"} in next 7d without a driver. Tap to assign.`,
    });
  }
  row2.push({
    key: "alerts",
    label: "Alerts",
    value: counts.loading ? "…" : String(counts.alertsTotal),
    icon: AlertTriangle,
    tone: counts.alertsTotal > 0 ? "critical" : "muted",
    href: "/admin/notifications",
    aria: `${counts.alertsTotal} alert${counts.alertsTotal === 1 ? "" : "s"}: refunds + email failures. Tap to triage.`,
  });

  const renderPill = (p: Pill) => {
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
          <span className="block text-[14px] font-bold tabular-nums leading-none">{p.value}</span>
          {/* Wave 70.41b -- dropped truncate so labels that don't fit
              break to a second line rather than collapsing to
              "OVER..." / "REVEN...". With the shortened labels above
              this should only trigger on the very narrow xl-collapsed
              sidebar state, and a 2-line label still reads correctly. */}
          <span className="block text-[9px] uppercase tracking-wider opacity-80 mt-0.5 leading-none">{p.label}</span>
        </span>
      </Link>
    );
  };

  return (
    <div
      className="space-y-1.5"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Admin live state"
    >
      <div className="grid grid-cols-3 gap-1.5">
        {row1.map(renderPill)}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {row2.map(renderPill)}
      </div>
    </div>
  );
}
