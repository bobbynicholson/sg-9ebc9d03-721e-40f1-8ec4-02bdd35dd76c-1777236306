/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 6 chart 2 -- Inter-branch capacity heatmap.
 *
 * CSS grid: rows are branches, columns are upcoming ISO weeks. Each
 * cell's saturation tracks order count vs the busiest cell. A small
 * footer line calls out the busiest + slowest branch in the window so
 * the operator gets the "rebalance" insight without having to read
 * the grid.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { LayoutGrid } from "lucide-react";
import type { BranchCapacityGridResult } from "../extractors/aggregateBranchCapacityGrid";

interface Props {
  data: BranchCapacityGridResult;
  loading?: boolean;
}

const cellColour = (intensity: number, count: number): string => {
  if (count === 0) return "#f1f5f9"; // empty slot
  // Sky-blue ramp -> deep red as intensity climbs past 0.7.
  if (intensity < 0.34) return `rgba(59, 130, 246, ${0.15 + intensity})`;     // blue
  if (intensity < 0.7) return `rgba(245, 158, 11, ${0.5 + intensity * 0.4})`; // amber
  return `rgba(239, 68, 68, ${0.7 + intensity * 0.3})`;                        // red
};

export function BranchCapacityHeatmap({ data, loading }: Props) {
  const cellByKey = useMemo(() => {
    const m = new Map<string, { count: number; intensity: number }>();
    for (const c of data.cells) {
      m.set(`${c.branchId}-${c.weekIdx}`, { count: c.count, intensity: c.intensity });
    }
    return m;
  }, [data.cells]);

  const busiestBranchName = data.busiestBranchId
    ? data.branches.find((b) => b.id === data.busiestBranchId)?.name
    : null;
  const slowestBranchName = data.slowestBranchId
    ? data.branches.find((b) => b.id === data.slowestBranchId)?.name
    : null;

  const ariaSummary = data.isEmpty
    ? "No upcoming orders to compare across branches."
    : `${data.totalOrders} upcoming orders across ${data.branches.length} branches over the next ${data.weeks.length} weeks.`;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-rose-600" />
          Inter-branch capacity
          <InfoTooltip
            content={
              "Each row is a branch, each column an upcoming week. Darker cells = more booked orders. Use this to spot when one branch is slammed while another has open slots -- a good signal to rebalance prep teams or push marketing where it's needed.\n\n" +
              "Cancelled orders aren't counted; only live event bookings."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : data.isEmpty ? (
          <div className="h-56 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <LayoutGrid className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Capacity grid will show here</p>
            <p className="text-xs">once branches have upcoming bookings.</p>
          </div>
        ) : (
          <div aria-label={ariaSummary}>
            <div className="overflow-x-auto">
              <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th className="text-left text-[10px] uppercase tracking-wide text-slate-500 font-medium pr-2"></th>
                    {data.weeks.map((w) => (
                      <th
                        key={w.idx}
                        className="text-[10px] text-slate-500 font-medium px-1 py-1 text-center"
                        title={w.longLabel}
                      >
                        {w.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.branches.map((b) => (
                    <tr key={b.id}>
                      <td
                        className="text-xs text-slate-700 font-medium pr-2 truncate max-w-[120px]"
                        title={b.name}
                      >
                        {b.name}
                      </td>
                      {data.weeks.map((w) => {
                        const cell = cellByKey.get(`${b.id}-${w.idx}`);
                        const count = cell?.count ?? 0;
                        const intensity = cell?.intensity ?? 0;
                        return (
                          <td
                            key={w.idx}
                            className="text-center"
                            style={{
                              backgroundColor: cellColour(intensity, count),
                              borderRadius: 3,
                              minWidth: 32,
                              height: 28,
                              fontSize: 11,
                              color: intensity > 0.55 ? "#fff" : "#475569",
                              fontWeight: count > 0 ? 600 : 400,
                            }}
                            title={`${b.name} -- ${w.longLabel}: ${count} order${count === 1 ? "" : "s"}`}
                          >
                            {count > 0 ? count : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(busiestBranchName || slowestBranchName) && (
              <div className="mt-2 px-1 text-[11px] text-slate-500">
                {busiestBranchName && (
                  <>
                    Busiest:{" "}
                    <span className="font-semibold text-rose-700">{busiestBranchName}</span>.
                  </>
                )}
                {busiestBranchName && slowestBranchName && " "}
                {slowestBranchName && (
                  <>
                    Most capacity free:{" "}
                    <span className="font-semibold text-emerald-700">{slowestBranchName}</span>.
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
