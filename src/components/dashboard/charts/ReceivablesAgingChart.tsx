/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 5 chart 2 - Receivables aging.
 *
 * Recharts BarChart with each bucket as a column. Y-axis is rand
 * balance, not count - a single huge invoice 90 days late is the
 * thing the owner needs to chase. Bars get progressively redder as
 * they age.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Receipt } from "lucide-react";
import type { ReceivablesAgingResult } from "../extractors/aggregateReceivablesAging";

interface Props {
  data: ReceivablesAgingResult;
  loading?: boolean;
}

const fmtZAR = (n: number): string => {
  if (!isFinite(n) || n === 0) return "R 0";
  if (n >= 1_000_000) return `R ${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `R ${(n / 1_000).toFixed(1)}k`;
  return `R ${Math.round(n).toLocaleString("en-ZA")}`;
};

const COLOURS: Record<string, string> = {
  not_due: "#10b981",
  d_0_30: "#fbbf24",
  d_31_60: "#fb923c",
  d_61_90: "#f87171",
  d_90_plus: "#dc2626",
};

export function ReceivablesAgingChart({ data, loading }: Props) {
  const isEmpty = data.totalOutstanding === 0;
  const ariaSummary = isEmpty
    ? "No outstanding invoices."
    : `${data.totalInvoices} outstanding invoice${data.totalInvoices === 1 ? "" : "s"} totalling ${fmtZAR(data.totalOutstanding)}. Overdue: ${fmtZAR(data.overdueBalance)} across ${data.overdueCount} invoice${data.overdueCount === 1 ? "" : "s"}.`;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Receipt className="w-4 h-4 text-orange-600" />
          Receivables aging
          <InfoTooltip
            content={
              "Money owed to you, sliced by how late it is. Green = not yet due. Anything from yellow rightwards is overdue.\n\n" +
              "Tall red bars on the right are old debts - the longer they sit, the less likely you are to collect. Chase 60+ days hardest."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : isEmpty ? (
          <div className="h-56 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <Receipt className="w-10 h-10 text-slate-200" />
            <p className="text-sm">No outstanding invoices</p>
            <p className="text-xs">All invoiced amounts are paid up. Nice work.</p>
          </div>
        ) : (
          <div aria-label={ariaSummary}>
            <div className="flex items-baseline justify-between mb-2 px-1">
              <div className="text-xs text-slate-500">
                Total outstanding:{" "}
                <span className="font-semibold text-slate-800">{fmtZAR(data.totalOutstanding)}</span>
              </div>
              <div className="text-[11px] text-rose-700">
                Overdue: <span className="font-semibold">{fmtZAR(data.overdueBalance)}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.buckets} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="shortLabel" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  width={48}
                  tickFormatter={(v: any) => fmtZAR(Number(v))}
                />
                <Tooltip
                  formatter={(value: any, _name: string, item: any) => [
                    fmtZAR(Number(value)),
                    item?.payload?.label || "",
                  ]}
                  labelFormatter={() => ""}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="balance" radius={[4, 4, 0, 0]}>
                  {data.buckets.map((b) => (
                    <Cell key={`b-${b.key}`} fill={COLOURS[b.key] || "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {data.worstSingle && (
              <p className="mt-2 text-[11px] text-slate-500 px-1">
                Largest overdue invoice: {fmtZAR(data.worstSingle.balance)},{" "}
                <span className="text-rose-700">{data.worstSingle.daysOverdue} days late</span>.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
