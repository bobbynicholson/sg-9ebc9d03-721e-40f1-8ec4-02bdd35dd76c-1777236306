/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 3 chart 3 - New vs repeat revenue split (current period).
 *
 * Donut chart with the rand split + a centre label showing total
 * revenue and the new-share percentage. Below the chart, a two-row
 * legend with R + count + unique-client count for each bucket.
 */
import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Users2 } from "lucide-react";
import type { NewVsRepeatResult } from "../extractors/aggregateNewVsRepeat";

const fmtR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n || 0);

interface Props {
  data: NewVsRepeatResult;
  loading?: boolean;
}

export function NewVsRepeatDonut({ data, loading }: Props) {
  const chartData = useMemo(
    () => [
      { name: "New", value: data.newClients.revenue, fill: "#10b981" },
      { name: "Repeat", value: data.repeatClients.revenue, fill: "#6366f1" },
    ],
    [data],
  );

  const ariaSummary = useMemo(() => {
    if (data.totalRevenue === 0) return "No revenue in the selected date range.";
    const newPct = (data.newShare * 100).toFixed(1);
    return `Revenue split: ${newPct}% new clients (${fmtR(data.newClients.revenue)}), ${(100 - data.newShare * 100).toFixed(1)}% repeat (${fmtR(data.repeatClients.revenue)}).`;
  }, [data]);

  const isEmpty = data.totalRevenue === 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Users2 className="w-4 h-4 text-indigo-600" />
          New vs repeat revenue
          <InfoTooltip
            content={
              "Money in this period split by whether the client is brand new (their first-ever order with you falls inside this period) or returning.\n\n" +
              "Healthy mix usually shows a meaningful repeat share - if you're 95%+ new, you're working too hard for every rand."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : isEmpty ? (
          <div className="h-56 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <Users2 className="w-10 h-10 text-slate-200" />
            <p className="text-sm">New vs repeat split will show here</p>
            <p className="text-xs">once you have orders in the selected period.</p>
          </div>
        ) : (
          <div aria-label={ariaSummary}>
            <div className="relative">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={`c-${i}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [fmtR(Number(value)), ""]}
                    contentStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-[10px] text-slate-500">Total</div>
                <div className="text-base font-bold text-slate-900">{fmtR(data.totalRevenue)}</div>
                <div className="text-[10px] text-emerald-700 font-medium">
                  {(data.newShare * 100).toFixed(1)}% new
                </div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-start gap-2 p-2 rounded bg-emerald-50 border border-emerald-100">
                <span className="w-2 h-2 mt-1 rounded-full bg-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-emerald-900">New</div>
                  <div className="text-emerald-800">{fmtR(data.newClients.revenue)}</div>
                  <div className="text-emerald-700/70">{data.newClients.uniqueClients} client{data.newClients.uniqueClients === 1 ? "" : "s"}, {data.newClients.orderCount} order{data.newClients.orderCount === 1 ? "" : "s"}</div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded bg-indigo-50 border border-indigo-100">
                <span className="w-2 h-2 mt-1 rounded-full bg-indigo-500 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-indigo-900">Repeat</div>
                  <div className="text-indigo-800">{fmtR(data.repeatClients.revenue)}</div>
                  <div className="text-indigo-700/70">{data.repeatClients.uniqueClients} client{data.repeatClients.uniqueClients === 1 ? "" : "s"}, {data.repeatClients.orderCount} order{data.repeatClients.orderCount === 1 ? "" : "s"}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
