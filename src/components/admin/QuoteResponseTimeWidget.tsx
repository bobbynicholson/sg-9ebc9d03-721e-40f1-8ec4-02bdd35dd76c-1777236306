/**
 * QuoteResponseTimeWidget - median time from quote sent to client
 * accepted, plus median time-to-first-view, across the last 90 days.
 *
 * Automated E2E quotes are excluded so test acceptances do not make
 * real client response time look like 0 minutes.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, CheckCircle, ArrowRight } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";
import { daysAgoIso } from "@/lib/dashboardWindows";
import { isAutomatedTestQuote } from "@/lib/testDataDetection";

interface Row {
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  quote_number: string | null;
  quote_name: string | null;
  client_name: string | null;
  notes: string | null;
}

const median = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const fmtHours = (h: number, sample: number): string => {
  if (sample <= 0) return "-";
  if (h < 1 / 60) return "<1m";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
};

export function QuoteResponseTimeWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const { reportError, retryNonce } = useReportWidgetError();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = daysAgoIso(90);
        const { data, error } = await (supabase as any)
          .from("quotes")
          .select("sent_at, viewed_at, accepted_at, quote_number, quote_name, client_name, notes")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("sent_at", since)
          .not("sent_at", "is", null)
          .limit(2000);
        if (error) throw error;
        if (!cancelled) {
          setRows((data || []) as Row[]);
          reportError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          reportError(e?.message || "Could not load quote response time");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, retryNonce]);

  const stats = useMemo(() => {
    const liveRows = rows.filter((r) => !isAutomatedTestQuote(r));
    const viewDeltas: number[] = [];
    const acceptDeltas: number[] = [];
    for (const r of liveRows) {
      if (!r.sent_at) continue;
      const sent = new Date(r.sent_at).getTime();
      if (!Number.isFinite(sent)) continue;
      if (r.viewed_at) {
        const v = new Date(r.viewed_at).getTime();
        if (Number.isFinite(v) && v >= sent) viewDeltas.push((v - sent) / 3_600_000);
      }
      if (r.accepted_at) {
        const a = new Date(r.accepted_at).getTime();
        if (Number.isFinite(a) && a >= sent) acceptDeltas.push((a - sent) / 3_600_000);
      }
    }
    return {
      medianViewHours: median(viewDeltas),
      medianAcceptHours: median(acceptDeltas),
      viewSample: viewDeltas.length,
      acceptSample: acceptDeltas.length,
      liveRows: liveRows.length,
      excludedTestRows: rows.length - liveRows.length,
    };
  }, [rows]);

  if (!companyId) return null;
  if (!loading && rows.length === 0 && stats.excludedTestRows === 0) return null;

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Quote response time, last 90 days</CardTitle>
            <CardDescription className="text-xs">
              Median elapsed time from quote sent to first view and acceptance. Automated E2E quotes are excluded.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/quotes")}>
            <Button variant="ghost" size="sm" className="text-blue-700">
              All quotes <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-blue-200 bg-white p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-slate-600 font-medium">Sent -&gt; first view</span>
                </div>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {fmtHours(stats.medianViewHours, stats.viewSample)}
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  across {stats.viewSample} real quote{stats.viewSample === 1 ? "" : "s"}
                </p>
                {stats.viewSample === 0 && (
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    No first-view samples yet; this starts once a public quote link stamps viewed_at.
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-brand-primary/20 bg-white p-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-brand-primary" />
                  <span className="text-xs text-slate-600 font-medium">Sent -&gt; accepted</span>
                </div>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {fmtHours(stats.medianAcceptHours, stats.acceptSample)}
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  across {stats.acceptSample} real quote{stats.acceptSample === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            {stats.excludedTestRows > 0 && (
              <p className="mt-3 text-[11px] leading-4 text-blue-800">
                Excluded {stats.excludedTestRows} automated E2E quote{stats.excludedTestRows === 1 ? "" : "s"} from this median so instant test accepts do not show as 0m client response time.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
