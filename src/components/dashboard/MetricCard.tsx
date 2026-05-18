/**
 * Standard metric tile used across every dashboard. Built-in InfoTooltip
 * lets the user hover the (i) icon to see exactly what the number means
 * and where it's coming from - so "Total Revenue" stops being a black
 * box and becomes "sum of confirmed bookings, source: orders.total_amount
 * filtered by event_date in selected range".
 */
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
}

const BADGE_TONES = {
  green:  "bg-green-100 text-green-700",
  blue:   "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  amber:  "bg-amber-100 text-amber-700",
  red:    "bg-red-100 text-red-700",
  slate:  "bg-slate-100 text-slate-700",
};

export function MetricCard({
  label, value, hint, tooltip, badge, icon: Icon, iconColor = "text-slate-600", loading,
}: MetricCardProps) {
  return (
    <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
      <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
        <CardTitle className="flex items-start justify-between gap-2 text-xs sm:text-sm font-medium">
          <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {Icon && <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${iconColor}`} />}
            <span className="text-xs sm:text-sm truncate">{label}</span>
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
}
