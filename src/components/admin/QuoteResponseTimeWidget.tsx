/**
 * QuoteResponseTimeWidget -- median time from quote sent to client
 * accepted, plus median time-to-first-view, across the last 90 days.
 *
 * Phase 11 #10. The pipeline kanban + quotes-to-chase widget tell
 * the sales lead WHICH quotes need attention; this card answers
 * 'how long is the average client taking to say yes' so the team
 * can spot pricing / tone problems vs. just 'they're slow'.
 *
 * Reads quotes where sent_at + accepted_at (or sent_at + viewed_at)
 * are both set in the last 90 days. Computes deltas in hours,
 * takes the median, and renders two compact tiles + the underlying
 * sample count.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, CheckCircle, ArrowRight } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";

interface Row {
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
}

const median = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const fmtHours = (h: number): string => {
  if (h <= 0) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
};

export function QuoteResponseTimeWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
        const { data, error } = await (supabase as any)
          .from("quotes")
          .select("sent_at, viewed_at, accepted_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("sent_at", since)
          .not("sent_at", "is", null)
          .limit(2000);
        if (error) {
          console.error("[QuoteResponseTimeWidget] quotes fetch failed:", error);
        }
        if (!cancelled) setRows((data || []) as Row[]);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const stats = useMemo(() => {
    const viewDeltas: number[] = [];
    const acceptDeltas: number[] = [];
    for (const r of rows) {
      if (!r.sent_at) continue;
      const sent = new Date(r.sent_at).getTime();
      if (r.viewed_at) {
        const v = new Date(r.viewed_at).getTime();
        if (v > sent) viewDeltas.push((v - sent) / 3_600_000);
      }
      if (r.accepted_at) {
        const a = new Date(r.accepted_at).getTime();
        if (a > sent) acceptDeltas.push((a - sent) / 3_600_000);
      }
    }
    return {
      medianViewHours: median(viewDeltas),
      medianAcceptHours: median(acceptDeltas),
      viewSample: viewDeltas.length,
      acceptSample: acceptDeltas.length,
    };
  }, [rows]);

  if (!companyId) return null;
  if (!loading && stats.viewSample === 0 && stats.acceptSample === 0) return null;

  return (
    <Card className="mb-6 border-indigo-200 bg-indigo-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Quote response time, last 90 days</CardTitle>
            <CardDescription className="text-xs">
              Median elapsed time from quote sent to first view + to acceptance.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/quotes")}>
            <Button variant="ghost" size="sm" className="text-indigo-700">
              All quotes <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-indigo-200 bg-white p-3">
              <div className="flex items-center gap-2 mb-1">
                <Eye className="w-4 h-4 text-indigo-600" />
                <span className="text-xs text-slate-600 font-medium">Sent → first view</span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                {fmtHours(stats.medianViewHours)}
              </p>
              <p className="text-[11px] text-slate-500 tabular-nums">
                across {stats.viewSample} quote{stats.viewSample === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-white p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-slate-600 font-medium">Sent → accepted</span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                {fmtHours(stats.medianAcceptHours)}
              </p>
              <p className="text-[11px] text-slate-500 tabular-nums">
                across {stats.acceptSample} quote{stats.acceptSample === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
