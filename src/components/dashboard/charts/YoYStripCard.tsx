/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 1 chart 2 - Year-over-year comparison strip.
 *
 * 4 mini-cards with sparkline + delta vs same period last year.
 * Lives directly under the revenue trend chart so the eye reads
 * "trend" then "how does this compare to last year?" in one beat.
 */
import { useMemo } from "react";
import {
  ResponsiveContainer, AreaChart, Area, YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { YoYStripResult } from "../extractors/aggregateYoYStrip";

interface Props {
  data: YoYStripResult | null;
  loading?: boolean;
}

const TONES: Record<"positive" | "negative" | "neutral", {
  text: string; bg: string; stroke: string; fill: string;
}> = {
  positive: { text: "text-brand-primary", bg: "bg-brand-primary/10", stroke: "#10b981", fill: "#10b981" },
  negative: { text: "text-rose-700",    bg: "bg-rose-50",    stroke: "#e11d48", fill: "#e11d48" },
  neutral:  { text: "text-slate-600",   bg: "bg-slate-50",   stroke: "#64748b", fill: "#64748b" },
};

const toneFor = (deltaPct: number | null): "positive" | "negative" | "neutral" => {
  if (deltaPct === null) return "neutral";
  if (deltaPct > 0.5) return "positive";
  if (deltaPct < -0.5) return "negative";
  return "neutral";
};

const fmtDelta = (deltaPct: number | null): string => {
  if (deltaPct === null) return "no prior data";
  const sign = deltaPct > 0 ? "+" : "";
  return `${sign}${deltaPct.toFixed(1)}% vs last year`;
};

function MetricCard({
  label,
  display,
  deltaPct,
  sparkline,
}: {
  label: string;
  display: string;
  deltaPct: number | null;
  sparkline: number[];
}) {
  const tone = toneFor(deltaPct);
  const t = TONES[tone];
  const Arrow = tone === "positive" ? ArrowUp : tone === "negative" ? ArrowDown : ArrowRight;

  // Recharts wants array-of-objects.
  const sparkData = useMemo(() => sparkline.map((v, i) => ({ i, v })), [sparkline]);
  const hasSpark = sparkline.some((v) => v > 0);

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1">
              <div className="truncate text-xs uppercase tracking-wide text-slate-500">{label}</div>
              <InfoTooltip content={label === "Booked revenue"
                ? "Gross total_amount, including tax, for reportable committed orders grouped by event date. Compared with the same date window last year; cancelled and automated test orders are excluded."
                : label === "Confirmed orders"
                  ? "Count of reportable committed orders grouped by event date, compared with the same date window last year. Cancelled and automated test orders are excluded."
                  : label === "Avg order value"
                    ? "Booked gross revenue divided by booked-order count for each comparison window. Includes tax in total_amount; cancelled, unconfirmed pipeline and test orders are excluded."
                    : "Accepted quotes dated by accepted_at divided by leads dated by created_at in each comparison window. These are period counts, not a same-lead cohort conversion rate; quotes that were won and then cancelled are excluded."} />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">{display}</div>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${t.bg} ${t.text}`}>
            <Arrow className="w-3 h-3" />
            {fmtDelta(deltaPct)}
          </span>
        </div>
        {hasSpark ? (
          <div className="mt-3 -mx-1 h-10">
            <ResponsiveContainer width="100%" height={40}>
              <AreaChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={t.stroke}
                  strokeWidth={1.5}
                  fill={t.fill}
                  fillOpacity={0.18}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-3 h-10 flex items-center text-[11px] text-slate-300">
            Sparkline appears once you have a year of data.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function YoYStripCard({ data, loading }: Props) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-0 shadow-sm"><CardContent className="p-4 h-28 animate-pulse" /></Card>
        ))}
      </div>
    );
  }

  const ariaSummary = `Year-over-year strip: revenue ${data.revenue.display} (${fmtDelta(data.revenue.deltaPct)}), orders ${data.orderCount.display}, AOV ${data.avgOrderValue.display}, conversion ${data.conversionRate.display}.`;

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      aria-label={ariaSummary}
    >
      <MetricCard {...data.revenue} />
      <MetricCard {...data.orderCount} />
      <MetricCard {...data.avgOrderValue} />
      <MetricCard {...data.conversionRate} />
    </div>
  );
}
