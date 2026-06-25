/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 2 chart 3 - Conversion funnel.
 *
 * Five horizontal bars, widths proportional to count. Each bar shows
 * count + value + drop-off % from the stage above + cumulative %
 * vs leads. Renders as plain CSS bars (no Recharts needed for this
 * shape) so the labels can sit cleanly beside each rung.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Filter, ArrowDown } from "lucide-react";
import Link from "next/link";
import type { ConversionFunnelResult } from "../extractors/aggregateConversionFunnel";

const fmtR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n || 0);
const fmtCount = (n: number) => Math.round(n).toLocaleString("en-ZA");
const fmtPct = (n: number | null) => (n === null ? "-" : `${n.toFixed(1)}%`);

const STAGE_HREF: Record<string, string> = {
  leads: "/admin/leads",
  quotes_sent: "/admin/quotes",
  quotes_viewed: "/admin/quotes",
  quotes_accepted: "/admin/quotes",
  orders_completed: "/admin/orders",
};

const STAGE_TONE: Record<string, string> = {
  leads: "bg-blue-500",
  quotes_sent: "bg-indigo-500",
  quotes_viewed: "bg-violet-500",
  quotes_accepted: "bg-brand-primary",
  orders_completed: "bg-brand-primary/90",
};

interface Props {
  data: ConversionFunnelResult;
  loading?: boolean;
}

export function ConversionFunnelChart({ data, loading }: Props) {
  const maxCount = useMemo(() => {
    return Math.max(1, ...data.stages.map((s) => s.count));
  }, [data]);

  const ariaSummary = useMemo(() => {
    if (data.totalLeads === 0) return "No leads in the selected date range.";
    const accepted = data.stages.find((s) => s.key === "quotes_accepted");
    if (!accepted) return `Funnel from ${data.totalLeads} leads.`;
    return `Funnel: ${data.totalLeads} leads in this period, ${accepted.count} accepted (${fmtPct(accepted.vsLeadsPct)}).`;
  }, [data]);

  const isEmpty = data.totalLeads === 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Filter className="w-4 h-4 text-violet-600" />
          Conversion funnel
          <InfoTooltip
            content={
              "Where in the lead -> quote -> order chain are deals dropping off?\n\n" +
              "Each bar's width is proportional to count. The percentage above each bar is conversion vs the leads stage; the percentage below is drop-off from the stage immediately above.\n\n" +
              "Click a bar to drill into that stage's list."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : isEmpty ? (
          <div className="h-56 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <Filter className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Your conversion funnel will show here</p>
            <p className="text-xs">once you have leads in the selected period.</p>
          </div>
        ) : (
          <div className="space-y-2.5" aria-label={ariaSummary}>
            {data.stages.map((stage, i) => {
              const widthPct = (stage.count / maxCount) * 100;
              const tone = STAGE_TONE[stage.key];
              const href = STAGE_HREF[stage.key] || "#";
              return (
                <div key={stage.key}>
                  <div className="flex items-center justify-between mb-0.5 text-[11px]">
                    <span className="text-slate-600 font-medium">{stage.label}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-slate-500">
                        {stage.value > 0 ? fmtR(stage.value) : ""}
                      </span>
                      <span className="text-slate-700 font-semibold">{fmtCount(stage.count)}</span>
                      {stage.vsLeadsPct !== null && i > 0 && (
                        <span className="text-slate-400 tabular-nums w-12 text-right">{fmtPct(stage.vsLeadsPct)}</span>
                      )}
                    </span>
                  </div>
                  <Link
                    href={href}
                    className="block group"
                    aria-label={`${stage.label}: ${stage.count} ${stage.value > 0 ? "(" + fmtR(stage.value) + ")" : ""}`}
                  >
                    <div className="relative h-7 bg-slate-100 rounded overflow-hidden group-hover:bg-slate-200 transition-colors">
                      <div
                        className={`h-full ${tone} transition-all`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </Link>
                  {i < data.stages.length - 1 && stage.dropOffPct !== null && (
                    <div className="flex items-center gap-1 text-[10px] text-rose-600 mt-1 pl-1">
                      <ArrowDown className="w-3 h-3" />
                      <span>
                        {fmtPct(data.stages[i + 1].dropOffPct)} drop-off ({fmtCount(stage.count - data.stages[i + 1].count)} lost)
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Wave 70.50b - "won then churned" sidebar row. Renders
                below the main funnel because it represents a DIFFERENT
                cohort lifecycle (events that DID get accepted -> THEN
                cancelled), not another step in the same drop-off
                chain. Hidden when no churn happened in the window. */}
            {data.churned.count > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-rose-700 font-semibold flex items-center gap-1">
                    <ArrowDown className="w-3 h-3" />
                    Won then churned
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-slate-500">
                      {data.churned.value > 0 ? fmtR(data.churned.value) : ""}
                    </span>
                    <span className="text-rose-700 font-semibold">{fmtCount(data.churned.count)}</span>
                    {data.churned.pctOfAccepted !== null && (
                      <span className="text-rose-500 tabular-nums w-12 text-right">{fmtPct(data.churned.pctOfAccepted)}</span>
                    )}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Accepted-quote events in this window whose order was later cancelled. Real churn - not "never accepted".
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
