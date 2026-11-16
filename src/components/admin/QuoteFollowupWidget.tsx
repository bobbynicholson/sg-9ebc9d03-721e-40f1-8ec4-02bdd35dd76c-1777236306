/**
 * QuoteFollowupWidget - dashboard card surfacing the 5 oldest
 * still-in-play quotes the team should be chasing.
 *
 * Phase 9 #10. Owners checking /admin/dashboard couldn't tell at
 * a glance which quotes were rotting - they had to open the
 * Quotes page, switch to the 'Stale' bucket and scroll. This
 * widget puts the 5 quotes with the longest 'sent without
 * reply' window right on the dashboard, with a one-click open
 * link to drill into the row.
 *
 * Quotes are eligible if status in (sent, viewed, revised) AND
 * sent_at older than 3 days. Sorted oldest-sent first so the
 * most-likely-to-go-cold quote sits at the top.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, ArrowRight, Mail } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";
import { daysAgoIso, daysSince } from "@/lib/dashboardWindows";
import { formatClock } from "@/lib/portalTime";

interface StaleQuote {
  id: string;
  quote_number: string | null;
  client_name: string | null;
  client_email: string | null;
  total: number | null;
  event_date: string | null;
  event_time: string | null;
  sent_at: string | null;
}

// TIGHTEN I.80: alias to the shared helper instead of duplicating its
// math. daysSince covers the same null-guard + clamp + round.
const daysAgo = (iso: string | null): number => daysSince(iso);

export function QuoteFollowupWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const { reportError, retryNonce } = useReportWidgetError();
  const [quotes, setQuotes] = useState<StaleQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const tenantCurrency = useTenantCurrency(companyId);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const threeDaysAgo = daysAgoIso(3);
        const { data, error } = await (supabase as any)
          .from("quotes")
          .select("id, quote_number, client_name, client_email, total, event_date, event_time, sent_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          // TIGHTEN I.80: only 'sent' counts as awaiting-reply. A
          // draft hasn't gone out the door yet so the follow-up widget
          // shouldn't surface it.
          .in("status", ["sent"])
          .not("sent_at", "is", null)
          .lte("sent_at", threeDaysAgo)
          .order("sent_at", { ascending: true })
          .limit(5);
        if (error) throw error;
        if (!cancelled) {
          setQuotes((data || []) as StaleQuote[]);
          reportError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setQuotes([]);
          reportError(e?.message || "Could not load quote follow-ups");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, retryNonce]);

  if (!companyId) return null;
  if (!loading && quotes.length === 0) return null;

  return (
    <Card collapsible defaultOpen={false} collapseLabel="Quotes to chase" className="mb-6 min-w-0 max-w-full overflow-hidden border-amber-200 bg-amber-50/40">
      <CardHeader className="min-w-0 flex-wrap px-3 py-3 sm:p-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm leading-5 sm:gap-2 sm:text-base">
              <Clock className="h-4 w-4 shrink-0 text-amber-600" />
              Quotes to chase
              {!loading && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700" aria-label={`${quotes.length} items`}>{quotes.length}</span>}
            </CardTitle>
            <CardDescription className="line-clamp-1 text-[10px] leading-4 sm:text-xs">
              In-play quotes sent more than 3 days ago without a reply. Oldest first.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/quotes")} aria-label="View all quotes" title="All quotes" className="shrink-0">
            <Button variant="ghost" size="sm" className="h-9 w-9 shrink-0 px-0 text-amber-700 sm:h-8 sm:w-auto sm:px-2">
              <span className="sr-only sm:not-sr-only">All quotes</span><ArrowRight className="ml-0 h-3.5 w-3.5 sm:ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-3 py-3 sm:p-5">
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-amber-100">
            {quotes.map((q) => {
              const since = daysAgo(q.sent_at);
              return (
                <li key={q.id} className="py-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900 text-sm truncate">
                        {q.client_name || "Unknown client"}
                      </span>
                      {q.quote_number && (
                        <Badge variant="outline" className="text-[10px] font-mono">{q.quote_number}</Badge>
                      )}
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                        {since}d
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 mt-0.5">
                      {q.event_date && (
                        <span>
                          Event: {new Date(q.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                          {q.event_time ? ` at ${formatClock(q.event_time)}` : ""}
                        </span>
                      )}
                      {q.total != null && (
                        <span className="font-semibold text-slate-700 tabular-nums">
                          {tenantCurrency.format(Number(q.total || 0), 0)}
                        </span>
                      )}
                      {q.client_email && (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Mail className="w-3 h-3" />
                          {q.client_email}
                        </span>
                      )}
                    </div>
                  </div>
                  <Link href={withSlug(`/admin/quotes?quoteId=${q.id}`)}>
                    <Button size="sm" variant="outline" className="shrink-0">
                      Open
                    </Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
