/**
 * Standard metric tile used across every dashboard. Built-in InfoTooltip
 * lets the user hover the (i) icon to see exactly what the number means
 * and where it's coming from - so "Total Revenue" stops being a black
 * box and becomes "sum of confirmed bookings, source: orders.total_amount
 * filtered by event_date in selected range".
 */
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface MetricCardProps {
  label: string;
  value: string | number;
  /** One-line description shown below the number. */
  hint?: string;
  /** Hover tooltip explaining definition + data source. */
  tooltip?: string;
  /** Optional badge top-right ("In progress", "Outstanding", etc.). */
  badge?: { text: string; tone?: "green" | "blue" | "purple" | "amber" | "red" | "slate" };
  /** Lucide icon component. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Tailwind colour for the icon. */
  iconColor?: string;
  /** Show a small loading skeleton when data isn't ready. */
  loading?: boolean;
  /**
   * Wave 70.52a - optional drill-down link. When provided, wraps the
   * tile in a Next.js Link so clicking opens the dedicated surface
   * for that number (e.g. Outstanding -> /admin/invoices?overdue=1).
   * Caller is responsible for tenant slug (use withSlug from
   * useTenantHref). Previously the card had hover:shadow-xl but no
   * click handler - operators got a hover affordance for a dead tile.
   */
  href?: string;
}

const BADGE_TONES = {
  green:  "bg-brand-primary/15 text-brand-primary",
  blue:   "bg-blue-100 text-blue-700",
  purple: "bg-slate-100 text-slate-700",
  amber:  "bg-amber-100 text-amber-700",
  red:    "bg-rose-100 text-rose-700",
  slate:  "bg-slate-100 text-slate-700",
};

export function MetricCard({
  label, value, hint, tooltip, badge, icon: Icon, iconColor = "text-slate-600", loading, href,
}: MetricCardProps) {
  const cardBody = (
    <Card
      className={`relative overflow-hidden transition-[box-shadow,border-color] duration-200 ${
        href ? "cursor-pointer hover:border-brand-primary/30 hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_16px_32px_-16px_rgba(15,23,42,0.18)] dark:hover:border-brand-primary/40" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-[2px] w-10 rounded-br-full bg-gradient-to-r from-brand-primary/70 to-transparent"
      />
      <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
        <CardTitle className="flex items-start justify-between gap-2 text-xs sm:text-sm font-medium">
          <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {Icon && <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${iconColor}`} />}
            {/* Wrap instead of truncate - "Outstandin..." next to a wide
                badge read like a rendering bug on 4-up rows. */}
            <span className="text-[11px] font-semibold uppercase tracking-wider leading-4 text-slate-500 dark:text-slate-400">{label}</span>
            {tooltip && <InfoTooltip content={tooltip} className="flex-shrink-0" />}
          </span>
          {badge && (
            <Badge className={`${BADGE_TONES[badge.tone || "slate"]} text-xs flex-shrink-0`}>
              {badge.text}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
        {loading ? (
          <div className="h-7 sm:h-8 md:h-9 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        ) : (
          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {value}
          </div>
        )}
        {hint && (
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{hint}</p>
        )}
      </CardContent>
    </Card>
  );

  // Wave 70.52a - wrap in Link when href is provided. Plain card
  // returns directly so this is a no-op for the non-clickable case.
  if (href) {
    return (
      <Link href={href} className="block" aria-label={`${label}: open details`}>
        {cardBody}
      </Link>
    );
  }
  return cardBody;
}
