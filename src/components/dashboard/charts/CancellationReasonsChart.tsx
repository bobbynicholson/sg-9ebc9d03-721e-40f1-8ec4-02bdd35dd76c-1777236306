/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 5 chart 1 -- Cancellation reasons (horizontal bar by revenue lost).
 *
 * Pure CSS bars (consistent with TopClientsBarChart). Each row shows
 * the reason label, a bar sized by share of cancelled revenue, the
 * count, and the rand value lost.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { XCircle } from "lucide-react";
import type { CancellationReasonsResult } from "../extractors/aggregateCancellationReasons";

interface Props {
  data: CancellationReasonsResult;
  loading?: boolean;
}

const fmtZAR = (n: number): string => {
  if (!isFinite(n) || n === 0) return "R 0";
  if (n >= 1_000_000) return `R ${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `R ${(n / 1_000).toFixed(1)}k`;
  return `R ${Math.round(n).toLocaleString("en-ZA")}`;
};

const BAR_COLOURS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#a3a3a3", "#94a3b8", "#cbd5e1",
];

export function CancellationReasonsChart({ data, loading }: Props) {
  const isEmpty = data.totalCancelled === 0;
  const ariaSummary = isEmpty
    ? "No cancellations recorded in the window."
    : `${data.totalCancelled} cancellations totalling ${fmtZAR(data.totalRevenueLost)} in lost revenue. Cancellation rate ${(data.cancellationRate * 100).toFixed(1)}%.`;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-500" />
          Cancellation reasons
          <InfoTooltip
            content={
              "Why orders fall away. Bars sized by revenue lost, not just count -- one big cancelled wedding hurts more than five lost lunches.\n\n" +
              "Look for patterns: if 'venue conflict' keeps showing up, your booking flow probably needs a clearer date-hold step."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : isEmpty ? (
          <div className="h-56 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <XCircle className="w-10 h-10 text-slate-200" />
            <p className="text-sm">No cancellations in this window</p>
            <p className="text-xs">Once an order gets cancelled with a reason, it will land here.</p>
          </div>
        ) : (
          <div aria-label={ariaSummary}>
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{data.totalCancelled}</span> cancellation{data.totalCancelled === 1 ? "" : "s"} ·{" "}
                <span className="font-semibold text-red-600">{fmtZAR(data.totalRevenueLost)}</span> lost
              </div>
              <div className="text-[11px] text-slate-500">
                Rate: <span className="font-semibold text-slate-700">{(data.cancellationRate * 100).toFixed(1)}%</span>
              </div>
            </div>
            <ul className="space-y-2">
              {data.rows.map((r, i) => {
                const pct = Math.max(2, r.share * 100);
                const colour = BAR_COLOURS[i % BAR_COLOURS.length];
                return (
                  <li key={r.key} className="text-xs">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-slate-700 truncate pr-2" title={r.label}>{r.label}</span>
                      <span className="text-slate-500 tabular-nums shrink-0">
                        {r.count} · <span className="text-red-700 font-semibold">{fmtZAR(r.revenueLost)}</span>
                      </span>
                    </div>
                    <div className="h-2 rounded bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded transition-all"
                        style={{ width: `${pct}%`, backgroundColor: colour }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
