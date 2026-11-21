/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 5 chart 3 - Top products by revenue.
 *
 * Pure CSS horizontal bars (matches TopClientsBarChart visual
 * language). The "Other" row gets a softer grey to make it visually
 * distinct from real menu items.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Utensils } from "lucide-react";
import type { TopProductsResult } from "../extractors/aggregateTopProducts";

interface Props {
  data: TopProductsResult;
  loading?: boolean;
}

const fmtZAR = (n: number): string => {
  if (!isFinite(n) || n === 0) return "R 0";
  if (n >= 1_000_000) return `R ${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `R ${(n / 1_000).toFixed(1)}k`;
  return `R ${Math.round(n).toLocaleString("en-ZA")}`;
};

export function TopProductsBarChart({ data, loading }: Props) {
  const isEmpty = data.rows.length === 0 || data.grandTotal === 0;
  const ariaSummary = isEmpty
    ? "No order items recorded in this window."
    : `Top ${data.rows.length} item${data.rows.length === 1 ? "" : "s"} drove ${fmtZAR(data.totalRevenue)} of revenue across ${data.totalDistinctItems} distinct items.`;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Utensils className="w-4 h-4 text-slate-600" />
          Top products
          <InfoTooltip
            content={
              "Menu items are ranked by summed order_items.line_total on reportable committed orders in the selected event-date window. Cancelled, unconfirmed pipeline and automated test orders are excluded. This is booked item value, not cash received.\n\n" +
              "The 'Other' row groups lower-ranked items."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : isEmpty ? (
          <div className="h-56 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <Utensils className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Top products will show here</p>
            <p className="text-xs">once orders have line items recorded.</p>
          </div>
        ) : (
          <div aria-label={ariaSummary}>
            <div className="text-xs text-slate-500 mb-3">
              Top ranks of <span className="font-semibold text-slate-700">{data.totalDistinctItems}</span> distinct item{data.totalDistinctItems === 1 ? "" : "s"} ·{" "}
              total <span className="font-semibold text-slate-800">{fmtZAR(data.grandTotal)}</span>
            </div>
            <ul className="space-y-2">
              {data.rows.map((r) => {
                const pct = Math.max(2, r.share * 100);
                const isOther = r.key === "_other";
                return (
                  <li key={r.key} className="text-xs">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className={`truncate pr-2 ${isOther ? "text-slate-400 italic" : "text-slate-700"}`} title={r.label}>
                        {r.label}
                      </span>
                      <span className="text-slate-500 tabular-nums shrink-0">
                        {r.totalQuantity.toLocaleString("en-ZA")} ·{" "}
                        <span className="font-semibold text-slate-800">{fmtZAR(r.totalRevenue)}</span>
                      </span>
                    </div>
                    <div className="h-2 rounded bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: isOther ? "#cbd5e1" : "#a855f7",
                        }}
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
