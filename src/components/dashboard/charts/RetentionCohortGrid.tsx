/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 3 chart 2 -- Client retention cohort (quarterly).
 *
 * CSS grid: rows = signup quarter, cols = quarters since signup.
 * Cells coloured by retention ratio (0..100%). Future cells (cohort
 * younger than that age) render as faded/empty.
 *
 * Only renders when there are at least 4 cohort quarters of history.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Repeat } from "lucide-react";
import type { RetentionCohortResult } from "../extractors/aggregateRetentionCohort";

interface Props {
  data: RetentionCohortResult;
  loading?: boolean;
}

const colourFor = (ratio: number): string => {
  if (isNaN(ratio)) return "bg-slate-50";
  if (ratio === 0) return "bg-slate-100";
  if (ratio < 0.1) return "bg-indigo-100";
  if (ratio < 0.25) return "bg-indigo-200";
  if (ratio < 0.5) return "bg-indigo-300";
  if (ratio < 0.75) return "bg-indigo-500";
  return "bg-indigo-700";
};

const textColourFor = (ratio: number): string => {
  if (isNaN(ratio)) return "text-slate-300";
  if (ratio < 0.5) return "text-slate-700";
  return "text-white";
};

export function RetentionCohortGrid({ data, loading }: Props) {
  const ariaSummary = useMemo(() => {
    if (!data.hasEnoughHistory) return "Not enough history to render a cohort grid yet.";
    const lastRow = data.rows[data.rows.length - 1];
    const firstRow = data.rows[0];
    return `Retention cohort grid: ${data.rows.length} cohorts from ${firstRow?.cohortLabel} to ${lastRow?.cohortLabel}, ${data.totalClients} clients in total.`;
  }, [data]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Repeat className="w-4 h-4 text-indigo-600" />
          Client retention cohort
          <InfoTooltip
            content={
              "Each row is a quarter when those clients first signed up. Each column is the number of quarters since they signed up. The cell shows what % of that cohort placed an order in that quarter.\n\n" +
              "A high colour streak running right means clients are coming back. A drop-off in early columns means the second-event hand-off is leaking."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : !data.hasEnoughHistory ? (
          <div className="h-48 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <Repeat className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Cohort retention will show here</p>
            <p className="text-xs">once you have at least four quarters of clients with order history.</p>
          </div>
        ) : (
          <div className="overflow-x-auto" aria-label={ariaSummary}>
            <div
              className="inline-grid gap-[2px] min-w-full"
              style={{
                gridTemplateColumns: `auto auto repeat(${data.ageColumns.length}, minmax(36px, 1fr))`,
              }}
            >
              {/* header row */}
              <div className="text-[10px] text-slate-500 pr-2 self-end">Cohort</div>
              <div className="text-[10px] text-slate-500 pr-2 text-right self-end">Size</div>
              {data.ageColumns.map((age) => (
                <div key={`hdr-${age}`} className="text-[10px] text-slate-500 text-center self-end">
                  Q+{age}
                </div>
              ))}

              {/* body rows */}
              {data.rows.map((row) => (
                <>
                  <div key={`label-${row.cohortKey}`} className="text-[11px] text-slate-700 font-medium pr-2 self-center">
                    {row.cohortLabel}
                  </div>
                  <div key={`size-${row.cohortKey}`} className="text-[11px] text-slate-500 pr-2 text-right self-center tabular-nums">
                    {row.cohortSize}
                  </div>
                  {row.cells.map((cell) => {
                    const isFuture = isNaN(cell.retentionRatio);
                    const pctLabel = isFuture
                      ? ""
                      : cell.retentionRatio === 0
                        ? "-"
                        : `${Math.round(cell.retentionRatio * 100)}%`;
                    const tooltip = isFuture
                      ? "Not yet reached"
                      : `${cell.activeClients}/${cell.cohortSize} active in Q+${cell.ageQuarters}`;
                    return (
                      <div
                        key={`${row.cohortKey}-${cell.ageQuarters}`}
                        title={tooltip}
                        className={`h-7 rounded-sm flex items-center justify-center text-[10px] font-semibold tabular-nums ${colourFor(cell.retentionRatio)} ${textColourFor(cell.retentionRatio)} ${isFuture ? "opacity-30" : ""}`}
                      >
                        {pctLabel}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-end text-[10px] text-slate-500 gap-1">
              <span>0%</span>
              <span className="w-3 h-3 rounded-sm bg-slate-100" />
              <span className="w-3 h-3 rounded-sm bg-indigo-200" />
              <span className="w-3 h-3 rounded-sm bg-indigo-500" />
              <span className="w-3 h-3 rounded-sm bg-indigo-700" />
              <span>100%</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
