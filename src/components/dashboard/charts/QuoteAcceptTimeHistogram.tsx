/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 4 chart 2 - Quote-to-accept time distribution.
 *
 * Histogram of hours between sent_at and accepted_at, bucketed.
 * Recharts BarChart with median + 90th-percentile annotations.
 */
import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Clock } from "lucide-react";
import type { QuoteAcceptTimeResult } from "../extractors/aggregateQuoteAcceptTime";

interface Props {
  data: QuoteAcceptTimeResult;
  loading?: boolean;
}

const fmtHours = (h: number): string => {
  if (!isFinite(h)) return "-";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  if (h < 168) return `${(h / 24).toFixed(1)} d`;
  return `${(h / 168).toFixed(1)} wk`;
};

export function QuoteAcceptTimeHistogram({ data, loading }: Props) {
  const ariaSummary = useMemo(() => {
    if (data.total === 0) return "No accepted quotes yet to measure response time.";
    return `Quote acceptance speed across ${data.total} accepted quote${data.total === 1 ? "" : "s"}. Median ${fmtHours(data.medianHours)}, 90th percentile ${fmtHours(data.p90Hours)}, fastest ${fmtHours(data.fastestHours)}.`;
  }, [data]);

  const isEmpty = data.total === 0;

  // Pick the busiest bucket - highlighted in a slightly darker shade.
  const peakIdx = useMemo(() => {
    if (isEmpty) return -1;
    let best = -1; let max = 0;
    for (const b of data.buckets) {
      if (b.count > max) { max = b.count; best = b.idx; }
    }
    return best;
  }, [data, isEmpty]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-600" />
          Time to accept
          <InfoTooltip
            content={
              "How fast clients say yes. Each bar = number of quotes that were accepted within that time window since being sent.\n\n" +
              "A heavy left side is healthy: clients decide fast. A long right tail (14d+) is your follow-up workload - chase or close those out so they don't sit forever."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : isEmpty ? (
          <div className="h-56 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <Clock className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Time-to-accept will show here</p>
            <p className="text-xs">once you have accepted quotes with sent + accepted timestamps.</p>
          </div>
        ) : (
          <div aria-label={ariaSummary}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.buckets} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip
                  formatter={(value: any, _name: string, item: any) => [
                    `${Number(value).toLocaleString("en-ZA")} quote${Number(value) === 1 ? "" : "s"}`,
                    item?.payload?.longLabel || "Bucket",
                  ]}
                  labelFormatter={() => ""}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.buckets.map((b) => (
                    <Cell key={`b-${b.idx}`} fill={b.idx === peakIdx ? "#10b981" : "#86efac"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 px-2 grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded bg-emerald-50 border border-emerald-100 px-2 py-1">
                <div className="text-[9px] uppercase tracking-wide text-emerald-700">Median</div>
                <div className="font-semibold text-emerald-900">{fmtHours(data.medianHours)}</div>
              </div>
              <div className="rounded bg-amber-50 border border-amber-100 px-2 py-1">
                <div className="text-[9px] uppercase tracking-wide text-amber-700">90th %ile</div>
                <div className="font-semibold text-amber-900">{fmtHours(data.p90Hours)}</div>
              </div>
              <div className="rounded bg-sky-50 border border-sky-100 px-2 py-1">
                <div className="text-[9px] uppercase tracking-wide text-sky-700">Fastest</div>
                <div className="font-semibold text-sky-900">{fmtHours(data.fastestHours)}</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
