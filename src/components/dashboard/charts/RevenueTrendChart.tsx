/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 1 chart 1 - Monthly revenue trend (12-month rolling).
 *
 * Dual-axis line chart: left axis R, right axis order count. Two
 * revenue lines (booked vs collected) plus a bar for order count.
 * Highest and lowest revenue months get a small label.
 */
import { useMemo } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TrendingUp } from "lucide-react";
import type { RevenueByMonthBucket } from "../extractors/aggregateRevenueByMonth";

const fmtR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n || 0);

const fmtRCompact = (n: number) => {
  if (n === 0) return "R0";
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R${Math.round(n / 1_000)}k`;
  return `R${Math.round(n)}`;
};

interface Props {
  data: RevenueByMonthBucket[];
  loading?: boolean;
}

export function RevenueTrendChart({ data, loading }: Props) {
  const { hasAny, peak, trough, ariaSummary } = useMemo(() => {
    const positives = data.filter((d) => d.booked > 0);
    const hasAny = positives.length > 0;
    if (!hasAny) {
      return { hasAny: false, peak: null, trough: null, ariaSummary: "No revenue history yet." };
    }
    const peak = positives.reduce((a, b) => (b.booked > a.booked ? b : a));
    const trough = positives.length > 1
      ? positives.reduce((a, b) => (b.booked < a.booked ? b : a))
      : null;
    const totalBooked = positives.reduce((s, d) => s + d.booked, 0);
    const totalCollected = positives.reduce((s, d) => s + d.collected, 0);
    const summary = `Last 12 months booked ${fmtR(totalBooked)}, collected ${fmtR(totalCollected)}. Peak month ${peak.label} at ${fmtR(peak.booked)}.`;
    return { hasAny: true, peak, trough, ariaSummary: summary };
  }, [data]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          Revenue trend (last 12 months)
          <InfoTooltip
            content={
              "Booked = total value of confirmed orders by month of event.\n" +
              "Collected = money actually received (deposits + balances).\n\n" +
              "Cancelled orders excluded. The bar shows order count on the right axis."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : !hasAny ? (
          <div className="h-64 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <TrendingUp className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Your monthly revenue trend will show here</p>
            <p className="text-xs">once you have confirmed orders with event dates.</p>
          </div>
        ) : (
          <div className="w-full" aria-label={ariaSummary}>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={data} margin={{ top: 16, right: 24, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  tickFormatter={fmtRCompact}
                  tick={{ fontSize: 11 }}
                  width={56}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  width={36}
                />
                <Tooltip
                  formatter={(value: any, name: string) => {
                    if (name === "Order count") return [Number(value).toLocaleString("en-ZA"), name];
                    return [fmtR(Number(value)), name];
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId="right"
                  dataKey="orderCount"
                  name="Order count"
                  fill="#cbd5e1"
                  fillOpacity={0.7}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="booked"
                  name="Booked"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="collected"
                  name="Collected"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            {(peak || trough) && (
              <div className="flex items-center gap-4 mt-2 px-2 text-[11px] text-slate-500">
                {peak && (
                  <span>
                    Peak: <span className="font-semibold text-emerald-700">{peak.label} {fmtR(peak.booked)}</span>
                  </span>
                )}
                {trough && trough.monthKey !== peak?.monthKey && (
                  <span>
                    Lowest: <span className="font-semibold text-slate-700">{trough.label} {fmtR(trough.booked)}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
