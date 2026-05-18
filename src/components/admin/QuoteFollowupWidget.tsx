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

interface StaleQuote {
  id: string;
  quote_number: string | null;
  client_name: string | null;
  client_email: string | null;
  total: number | null;
  event_date: string | null;
  sent_at: string | null;
}

const daysAgo = (iso: string | null): number => {
  if (!iso) return 0;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(diff / 86_400_000));
};

export function QuoteFollowupWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const [quotes, setQuotes] = useState<StaleQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const tenantCurrency = useTenantCurrency(companyId);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
        const { data, error } = await (supabase as any)
          .from("quotes")
          .select("id, quote_number, client_name, client_email, total, event_date, sent_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["sent", "viewed", "revised"])
          .not("sent_at", "is", null)
          .lte("sent_at", threeDaysAgo)
          .order("sent_at", { ascending: true })
          .limit(5);
        if (error) {
          console.error("[QuoteFollowupWidget] quotes fetch failed:", error);
        }
        if (!cancelled) setQuotes((data || []) as StaleQuote[]);
      } catch {
        if (!cancelled) setQuotes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (!companyId) return null;
  if (!loading && quotes.length === 0) return null;

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4 text-amber-600" />
              Quotes to chase
            </CardTitle>
            <CardDescription className="text-xs">
              In-play quotes sent more than 3 days ago without a reply. Oldest first.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/quotes")}>
            <Button variant="ghost" size="sm" className="text-amber-700">
              All quotes <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
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
                        <span>Event: {new Date(q.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>
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
