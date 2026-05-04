/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 6 chart 1 -- Branch comparison spider/radar.
 *
 * Recharts RadarChart with one polygon per branch. Polygon vertices
 * are normalised 0..100 across the set of branches, so the chart
 * shows relative shape, not absolute size.
 *
 * Below the radar a small stat strip surfaces each branch's raw
 * numbers (revenue + win rate) so the relative shape is anchored
 * to real values.
 */
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Compass } from "lucide-react";
import type { BranchSpiderResult } from "../extractors/aggregateBranchSpider";

interface Props {
  data: BranchSpiderResult;
  loading?: boolean;
}

const fmtZAR = (n: number): string => {
  if (!isFinite(n) || n === 0) return "R 0";
  if (n >= 1_000_000) return `R ${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `R ${(n / 1_000).toFixed(1)}k`;
  return `R ${Math.round(n).toLocaleString("en-ZA")}`;
};

export function BranchSpiderChart({ data, loading }: Props) {
  const ariaSummary = data.isEmpty
    ? "Not enough activity across branches to compare yet."
    : `Branch comparison across ${data.series.length} branches on ${data.axes.length} metrics.`;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Compass className="w-4 h-4 text-indigo-600" />
          Branch comparison
          <InfoTooltip
            content={
              "Each polygon is a branch. The further a corner reaches, the better that branch performs on that metric, RELATIVE to its peers (not in absolute terms).\n\n" +
              "A branch with a tight, balanced shape is a steady performer. A spiky shape means the branch is great at one thing and weak elsewhere -- often where the operator should focus."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : data.isEmpty ? (
          <div className="h-64 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <Compass className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Branch comparison will show here</p>
            <p className="text-xs">once branches have orders, leads, or quotes attached.</p>
          </div>
        ) : (
          <div aria-label={ariaSummary}>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={data.axes} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "#475569" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip
                  formatter={(value: any, name: string, item: any) => {
                    const score = Math.round(Number(value) || 0);
                    return [`${score} / 100`, name];
                  }}
                  labelFormatter={(label: any, payload: any) => {
                    const desc = payload?.[0]?.payload?.description;
                    return desc ? `${label} -- ${desc}` : label;
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                {data.series.map((s) => (
                  <Radar
                    key={s.id}
                    name={s.name}
                    dataKey={s.id}
                    stroke={s.colour}
                    fill={s.colour}
                    fillOpacity={0.18}
                    strokeWidth={1.5}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>

            {/* Anchor strip: raw numbers per branch so the shape isn't abstract. */}
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px]">
              {data.series.map((s) => {
                const raw = data.rawByBranch[s.id];
                if (!raw) return null;
                return (
                  <div
                    key={s.id}
                    className="rounded border px-2 py-1.5"
                    style={{ borderColor: `${s.colour}40` }}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: s.colour }}
                      />
                      <span className="font-semibold text-slate-700 truncate">{s.name}</span>
                    </div>
                    <div className="text-slate-500">
                      {fmtZAR(raw.revenue)} ·{" "}
                      <span className="text-slate-700">{raw.orderCount}</span> orders ·{" "}
                      <span className="text-slate-700">{(raw.winRate * 100).toFixed(0)}%</span> win
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
