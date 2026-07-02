/**
 * CleaningEventBoard - Wave 70.24 (Commit 3)
 *
 * Event-grouped cleaning queue. Replaces the flat by-item view as
 * the primary cleaning portal surface. Three swimlanes:
 *
 *   Expected today  - handovers whose orders are still in transit
 *                      (status='expected'). Tells the cleaner what's
 *                      coming back so they can pre-stage racks.
 *   In progress     - equipment is back, cleaning team working
 *                      through it. Sorted by oldest first (longest-
 *                      waiting handover at the top).
 *   Done today      - handovers completed today. Confirmation +
 *                      summary so the cleaner sees their throughput.
 *
 * Each card is the per-event handover. Click opens the detail view
 * with the flat cleaning_jobs list inside.
 *
 * The legacy flat-by-item queue (CleaningJobsQueue) stays mounted
 * underneath as a power-user fallback for cleaners who prefer
 * grinding through items individually.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Calendar, Clock, MapPin, Package, CheckCircle2, Loader2, ChevronRight, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { orderDisplayName } from "@/lib/orderDisplayName";
import { supabase } from "@/integrations/supabase/client";
import {
  listHandoversForCompany,
  type HandoverWithOrderMeta,
} from "@/services/cleaningHandoverService";

function fmtTime(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--";
  return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDateDay(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function HandoverCard({ h }: { h: HandoverWithOrderMeta }) {
  const { withSlug } = useTenantHref();
  const eventLabel = orderDisplayName(h);
  const venueShort = h.venue_address ? String(h.venue_address).split(",")[0] : null;
  const expectedTime = h.expected_at
    ? fmtTime(h.expected_at)
    : h.event_time
      ? String(h.event_time).slice(0, 5)
      : null;

  return (
    <Link
      href={withSlug(`/team-portal/cleaning/handovers/${h.id}`)}
      className="block bg-white rounded-lg border border-slate-200 hover:border-brand-primary/40 hover:shadow-md transition-all p-3"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-slate-900 truncate">
            {eventLabel}
          </p>
          {h.client_name && eventLabel !== h.client_name && (
            <p className="text-[11px] text-slate-500 truncate">
              for {h.client_name}
            </p>
          )}
        </div>
        {h.order_number && (
          <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
            {h.order_number}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 mb-1">
        <span className="inline-flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {fmtDateDay(h.event_date)}
          {expectedTime && (
            <>
              <Clock className="w-3 h-3 ml-1" />
              <span className="tabular-nums">{expectedTime}</span>
            </>
          )}
        </span>
        <span className="inline-flex items-center gap-1">
          <Package className="w-3 h-3" />
          {h.total_items_expected} item{h.total_items_expected === 1 ? "" : "s"}
        </span>
      </div>
      {venueShort && (
        <p className="text-[10px] text-slate-400 truncate mb-1">
          📍 {venueShort}
        </p>
      )}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <span className="text-[11px] text-brand-primary font-medium inline-flex items-center gap-1">
          Open <ChevronRight className="w-3 h-3" />
        </span>
        {h.status === "complete" && (
          <CheckCircle2 className="w-3.5 h-3.5 text-brand-primary" />
        )}
      </div>
    </Link>
  );
}

export function CleaningEventBoard() {
  const { user } = useAuth();
  const companyId = (user as any)?.company_id as string | undefined;
  const [loading, setLoading] = useState(true);
  const [expected, setExpected] = useState<HandoverWithOrderMeta[]>([]);
  const [inProgress, setInProgress] = useState<HandoverWithOrderMeta[]>([]);
  const [doneToday, setDoneToday] = useState<HandoverWithOrderMeta[]>([]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Expected: only those expected back within 48h so the
        // board doesn't fill with wedding-in-4-weeks rows.
        const [exp, ip, done] = await Promise.all([
          listHandoversForCompany(supabase as any, companyId, {
            status: ["expected"],
            horizonHours: 48,
          }),
          listHandoversForCompany(supabase as any, companyId, {
            status: ["in_progress"],
          }),
          listHandoversForCompany(supabase as any, companyId, {
            status: ["complete"],
          }),
        ]);
        if (cancelled) return;
        // Done filter: only today's completions (to keep the column tight)
        const todayIso = new Date().toISOString().slice(0, 10);
        const doneTodayOnly = done.filter((h) =>
          (h.completed_at || "").slice(0, 10) === todayIso,
        );
        setExpected(exp);
        setInProgress(ip);
        setDoneToday(doneTodayOnly);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    // Refresh every 60s + on tab focus so the board updates without
    // the cleaner having to refresh.
    const interval = setInterval(load, 60_000);
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [companyId]);

  if (loading) {
    return (
      <Card className="border-0 shadow-lg mb-6">
        <CardContent className="py-8 text-center text-sm text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading event handovers...
        </CardContent>
      </Card>
    );
  }

  const allEmpty = expected.length === 0 && inProgress.length === 0 && doneToday.length === 0;

  return (
    <Card className="border-0 shadow-lg mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-4 h-4 text-brand-primary" />
          Cleaning handovers by event
          <span className="ml-2 text-xs font-normal text-slate-500">
            {expected.length + inProgress.length} active
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {allEmpty ? (
          <div className="text-center py-10">
            <Sparkles className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-medium text-slate-700">No events to track right now.</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              When an order moves to <span className="font-mono text-[11px]">confirmed</span>, a handover row lands in <span className="font-semibold">Expected</span>. When the equipment comes back, it flips to <span className="font-semibold">In progress</span>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Expected */}
            <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/5 overflow-hidden">
              <div className="px-3 py-2 border-b border-brand-primary/20 bg-brand-primary/10 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-primary">
                  Expected
                </p>
                <Badge variant="outline" className="text-[10px] tabular-nums bg-white">
                  {expected.length}
                </Badge>
              </div>
              <div className="p-2 space-y-2 min-h-[120px]">
                {expected.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic text-center py-3">
                    Nothing coming back in the next 48h.
                  </p>
                ) : (
                  expected.map((h) => <HandoverCard key={h.id} h={h} />)
                )}
              </div>
            </div>

            {/* In progress */}
            <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/5 overflow-hidden">
              <div className="px-3 py-2 border-b border-brand-primary/20 bg-brand-primary/10 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-primary">
                  In progress
                </p>
                <Badge variant="outline" className="text-[10px] tabular-nums bg-white">
                  {inProgress.length}
                </Badge>
              </div>
              <div className="p-2 space-y-2 min-h-[120px]">
                {inProgress.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic text-center py-3">
                    Nothing being cleaned right now.
                  </p>
                ) : (
                  inProgress.map((h) => <HandoverCard key={h.id} h={h} />)
                )}
              </div>
            </div>

            {/* Done today */}
            <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/10 overflow-hidden">
              <div className="px-3 py-2 border-b border-brand-primary/20 bg-brand-primary/10 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-primary">
                  Done today
                </p>
                <Badge variant="outline" className="text-[10px] tabular-nums bg-white">
                  {doneToday.length}
                </Badge>
              </div>
              <div className="p-2 space-y-2 min-h-[120px]">
                {doneToday.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic text-center py-3">
                    Nothing completed yet today.
                  </p>
                ) : (
                  doneToday.map((h) => <HandoverCard key={h.id} h={h} />)
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
