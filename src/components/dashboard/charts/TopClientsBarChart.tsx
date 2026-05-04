/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 3 chart 1 -- Top 10 clients by lifetime value.
 *
 * Horizontal bars rendered as plain CSS (Recharts overcomplicates this
 * shape). Each bar is two-tone: solid emerald = paid so far, lighter
 * amber tail = outstanding. Clicking the bar drills into the client.
 */
import { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Crown } from "lucide-react";
import type { TopClientRow } from "../extractors/aggregateTopClients";

const fmtR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n || 0);

interface Props {
  data: TopClientRow[];
  loading?: boolean;
}

export function TopClientsBarChart({ data, loading }: Props) {
  const { maxValue, ariaSummary } = useMemo(() => {
    const maxValue = Math.max(1, ...data.map((d) => d.lifetimeRevenue));
    if (data.length === 0) {
      return { maxValue, ariaSummary: "No client revenue history yet." };
    }
    const top = data[0];
    return {
      maxValue,
      ariaSummary: `Top client by lifetime value: ${top.name}, ${fmtR(top.lifetimeRevenue)} across ${top.orderCount} orders.`,
    };
  }, [data]);

  const isEmpty = data.length === 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-600" />
          Top 10 clients (lifetime value)
          <InfoTooltip
            content={
              "Sum of total order value per client (cancelled orders excluded). The solid green segment is paid so far; the lighter amber tail is what's still outstanding.\n\n" +
              "Use this to spot your most valuable clients and any large outstanding balances. Click a bar to open the client."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : isEmpty ? (
          <div className="h-56 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <Crown className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Your top clients will show here</p>
            <p className="text-xs">once you have completed orders linked to clients.</p>
          </div>
        ) : (
          <div className="space-y-1.5" aria-label={ariaSummary}>
            {data.map((row) => {
              const totalPct = (row.lifetimeRevenue / maxValue) * 100;
              const paidPct = row.lifetimeRevenue > 0 ? (row.paid / row.lifetimeRevenue) * 100 : 0;
              return (
                <Link
                  key={row.clientId}
                  href={`/admin/clients?clientId=${row.clientId}`}
                  className="block group"
                  aria-label={`${row.name}: ${fmtR(row.lifetimeRevenue)} lifetime, ${row.orderCount} orders`}
                >
                  <div className="flex items-center gap-2 mb-0.5 text-[11px]">
                    <span className="flex-1 truncate text-slate-700 group-hover:text-slate-900 font-medium">{row.name}</span>
                    <span className="text-slate-400 tabular-nums">{row.orderCount} order{row.orderCount === 1 ? "" : "s"}</span>
                    <span className="text-slate-700 font-semibold tabular-nums">{fmtR(row.lifetimeRevenue)}</span>
                  </div>
                  <div className="relative h-5 bg-slate-100 rounded overflow-hidden group-hover:bg-slate-200 transition-colors">
                    <div className="absolute inset-y-0 left-0 flex" style={{ width: `${totalPct}%` }}>
                      <div className="h-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
                      <div className="h-full bg-amber-400/70 flex-1" />
                    </div>
                  </div>
                  {row.outstanding > 0 && (
                    <div className="mt-0.5 text-[10px] text-amber-700 pl-1">
                      Outstanding: <span className="font-semibold">{fmtR(row.outstanding)}</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
