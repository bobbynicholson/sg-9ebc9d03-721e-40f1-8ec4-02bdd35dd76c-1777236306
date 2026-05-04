/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 2 chart 1 -- Seasonality heatmap.
 *
 * Pure CSS-grid heatmap (no Recharts). Rows = days of week (Mon..Sun).
 * Columns = ISO weeks across the last 12 months. Cell colour scales
 * with the chosen metric (events count by default, revenue when
 * toggled). Tooltip on hover gives exact figures.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Calendar, ToggleLeft, ToggleRight } from "lucide-react";
import type { SeasonalityCell, SeasonalityResult } from "../extractors/aggregateSeasonalityHeatmap";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmtR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n || 0);

interface Props {
  data: SeasonalityResult;
  loading?: boolean;
}

export function SeasonalityHeatmap({ data, loading }: Props) {
  const [metric, setMetric] = useState<"count" | "revenue">("count");

  const { weekKeys, cellsByPosition, maxValue, ariaSummary } = useMemo(() => {
    const weekKeys = data.weekKeys;
    // 7 rows (dow 0..6) x weekKeys.length cols
    const cellsByPosition = new Map<string, SeasonalityCell>();
    let maxValue = 0;
    for (const c of data.cells) {
      cellsByPosition.set(`${c.dow}|${c.weekKey}`, c);
      const v = metric === "count" ? c.count : c.revenue;
      if (v > maxValue) maxValue = v;
    }
    const headline = metric === "count"
      ? `${data.totalEvents} events in the last 12 months`
      : `${fmtR(data.totalRevenue)} revenue in the last 12 months`;
    const peak = data.peakDay
      ? `Peak day ${data.peakDay.isoDate} with ${data.peakDay.count} event${data.peakDay.count === 1 ? "" : "s"}`
      : "";
    return {
      weekKeys,
      cellsByPosition,
      maxValue,
      ariaSummary: peak ? `${headline}. ${peak}.` : headline,
    };
  }, [data, metric]);

  const colourFor = (value: number): string => {
    if (maxValue === 0 || value === 0) return "bg-slate-100";
    const ratio = value / maxValue;
    if (ratio < 0.2) return "bg-emerald-100";
    if (ratio < 0.4) return "bg-emerald-200";
    if (ratio < 0.6) return "bg-emerald-300";
    if (ratio < 0.8) return "bg-emerald-500";
    return "bg-emerald-700";
  };

  const isEmpty = data.totalEvents === 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-600" />
          Seasonality (last 12 months)
          <InfoTooltip
            content={
              "Each cell is one day. Rows are days of the week, columns are ISO weeks across the last 12 months.\n\n" +
              "Toggle the metric between event count and revenue to see which days of the week pull the heaviest weight in your business."
            }
          />
          <button
            type="button"
            onClick={() => setMetric((m) => (m === "count" ? "revenue" : "count"))}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900"
            aria-pressed={metric === "revenue"}
            aria-label="Toggle heatmap metric between count and revenue"
          >
            {metric === "count" ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4 text-emerald-600" />}
            {metric === "count" ? "Events" : "Revenue"}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : isEmpty ? (
          <div className="h-48 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <Calendar className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Your seasonality grid will show here</p>
            <p className="text-xs">once you have events with confirmed dates.</p>
          </div>
        ) : (
          <div className="overflow-x-auto" aria-label={ariaSummary}>
            <div
              className="inline-grid gap-[2px] min-w-full"
              style={{
                gridTemplateColumns: `auto repeat(${weekKeys.length}, minmax(10px, 1fr))`,
                gridTemplateRows: `auto repeat(7, 16px)`,
              }}
            >
              {/* top-left empty corner */}
              <div />
              {/* week-of-month markers across the top -- show start month only */}
              {weekKeys.map((wk, i) => {
                const monthCell = cellsByPosition.get(`0|${wk}`); // Monday of the week
                const showLabel = monthCell && (i === 0 || (() => {
                  const prevWk = weekKeys[i - 1];
                  const prevCell = cellsByPosition.get(`0|${prevWk}`);
                  return prevCell ? prevCell.isoDate.slice(5, 7) !== monthCell.isoDate.slice(5, 7) : true;
                })());
                return (
                  <div key={`hdr-${wk}`} className="text-[9px] text-slate-400 text-center leading-none">
                    {showLabel && monthCell ? new Date(monthCell.isoDate).toLocaleDateString("en-ZA", { month: "short" }) : ""}
                  </div>
                );
              })}

              {/* 7 rows -- one per day of week */}
              {DAY_LABELS.map((dayLabel, dow) => (
                <>
                  <div key={`dow-${dow}`} className="text-[9px] text-slate-500 pr-1 text-right leading-none self-center">
                    {dayLabel}
                  </div>
                  {weekKeys.map((wk) => {
                    const cell = cellsByPosition.get(`${dow}|${wk}`);
                    if (!cell) return <div key={`empty-${wk}-${dow}`} />;
                    const value = metric === "count" ? cell.count : cell.revenue;
                    const tooltip = `${cell.isoDate}: ${cell.count} event${cell.count === 1 ? "" : "s"}, ${fmtR(cell.revenue)}`;
                    return (
                      <div
                        key={`${wk}-${dow}`}
                        title={tooltip}
                        className={`h-4 w-full rounded-sm ${colourFor(value)} ${cell.outOfWindow ? "opacity-30" : ""}`}
                      />
                    );
                  })}
                </>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
              <div>
                {metric === "count"
                  ? `Total events: ${data.totalEvents}`
                  : `Total revenue: ${fmtR(data.totalRevenue)}`}
                {data.peakDay && (
                  <span className="ml-3">
                    Peak: <span className="font-semibold text-emerald-700">{data.peakDay.isoDate}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span>Less</span>
                <span className="w-3 h-3 rounded-sm bg-slate-100" />
                <span className="w-3 h-3 rounded-sm bg-emerald-200" />
                <span className="w-3 h-3 rounded-sm bg-emerald-500" />
                <span className="w-3 h-3 rounded-sm bg-emerald-700" />
                <span>More</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
