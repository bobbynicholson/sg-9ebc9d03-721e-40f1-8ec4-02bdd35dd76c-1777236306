/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 2 chart 2 - Capacity load calendar (next 90 days).
 *
 * Stacked bar chart per day. Bottom segment = confirmed orders, top
 * (semi-transparent) = open quotes. Horizontal reference line at the
 * tenant's per-day capacity ceiling (default 3, configurable later).
 * Days at or over the ceiling get a red border on the bar.
 */
import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { CalendarClock, AlertTriangle } from "lucide-react";
import type { CapacityLoadResult } from "../extractors/aggregateCapacityLoad";

interface Props {
  data: CapacityLoadResult;
  capacityCeiling?: number;
  loading?: boolean;
}

export function CapacityLoadCalendar({ data, capacityCeiling = 3, loading }: Props) {
  const { days } = data;

  const ariaSummary = useMemo(() => {
    if (data.totalConfirmed + data.totalOpenQuotes === 0) {
      return "No confirmed orders or open quotes in the next 90 days.";
    }
    const overText = data.daysOverCapacity > 0
      ? ` ${data.daysOverCapacity} day${data.daysOverCapacity === 1 ? "" : "s"} at or over capacity (${capacityCeiling}+).`
      : "";
    return `Next 90 days: ${data.totalConfirmed} confirmed orders + ${data.totalOpenQuotes} open quotes.${overText}`;
  }, [data, capacityCeiling]);

  const isEmpty = data.totalConfirmed === 0 && data.totalOpenQuotes === 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-amber-600" />
          Capacity load (next 90 days)
          <InfoTooltip
            content={
              "Each bar is one upcoming day. Solid = confirmed orders. Lighter = open quotes still awaiting client response.\n\n" +
              `Red dashed line = capacity ceiling (${capacityCeiling}/day). Days at or over the line need attention - consider declining new bookings or borrowing crew from another branch.`
            }
          />
          {data.daysOverCapacity > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              <AlertTriangle className="w-3 h-3" />
              {data.daysOverCapacity} day{data.daysOverCapacity === 1 ? "" : "s"} hot
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : isEmpty ? (
          <div className="h-56 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <CalendarClock className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Capacity load will show here</p>
            <p className="text-xs">once you have confirmed orders or open quotes for upcoming dates.</p>
          </div>
        ) : (
          <div className="w-full" aria-label={ariaSummary}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={days} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9 }}
                  interval={6}
                  height={28}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip
                  formatter={(value: any, name: string) => [
                    Number(value).toLocaleString("en-ZA"),
                    name,
                  ]}
                  labelFormatter={(label: string) => label}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine
                  y={capacityCeiling}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                  label={{ value: `Capacity (${capacityCeiling})`, position: "right", fontSize: 10, fill: "#dc2626" }}
                />
                <Bar dataKey="confirmedOrders" name="Confirmed" stackId="load" fill="#10b981">
                  {days.map((d, i) => (
                    <Cell key={`c-${i}`} stroke={d.overCapacity ? "#dc2626" : undefined} strokeWidth={d.overCapacity ? 1 : 0} />
                  ))}
                </Bar>
                <Bar dataKey="openQuotes" name="Open quotes" stackId="load" fill="#fbbf24" fillOpacity={0.65}>
                  {days.map((d, i) => (
                    <Cell key={`q-${i}`} stroke={d.overCapacity ? "#dc2626" : undefined} strokeWidth={d.overCapacity ? 1 : 0} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 px-2 text-[11px] text-slate-500 flex items-center justify-between">
              <span>{data.totalConfirmed} confirmed + {data.totalOpenQuotes} open</span>
              <span className="text-slate-400">x-axis label every 7 days</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
