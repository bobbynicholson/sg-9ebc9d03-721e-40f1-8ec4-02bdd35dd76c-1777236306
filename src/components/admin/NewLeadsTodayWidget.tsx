/**
 * NewLeadsTodayWidget - fresh leads from the last 24 hours that
 * haven't had a status change yet.
 *
 * Phase 22 #5. LeadAgingWidget surfaces stale leads older than 3
 * days that need chasing. The opposite side of the funnel - brand-
 * new enquiries that need a first response within hours, not days
 * - had no glance surface. The sales lead opening the dashboard
 * in the morning had to dig into /admin/leads to see if anything
 * came in overnight.
 *
 * Self-hides when nothing landed in the window.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight, Mail, Phone } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";

interface FreshLead {
  id: string;
  contact_name: string | null;
  client_name: string | null;
  email: string | null;
  client_email: string | null;
  phone: string | null;
  client_phone: string | null;
  source: string | null;
  event_date: string | null;
  created_at: string | null;
}

const hoursAgo = (iso: string | null): number => {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
};

export function NewLeadsTodayWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const { reportError, retryNonce } = useReportWidgetError();
  const [rows, setRows] = useState<FreshLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
        const { data, error } = await (supabase as any)
          .from("leads")
          .select("id, contact_name, client_name, email, client_email, phone, client_phone, source, event_date, created_at, status")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["new", "contacted"])
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5);
        if (error) throw error;
        if (!cancelled) {
          setRows(((data || []) as FreshLead[]));
          reportError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          reportError(e?.message || "Could not load fresh leads");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, retryNonce]);

  if (!companyId) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <Card className="mb-6 min-w-0 max-w-full overflow-hidden border-brand-primary/20 bg-brand-primary/5">
      <CardHeader className="min-w-0 px-3 pb-2.5 pt-3 sm:px-6 sm:pb-3 sm:pt-6">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm leading-5 sm:gap-2 sm:text-base">
              <Sparkles className="h-4 w-4 shrink-0 text-brand-primary" />
              <span className="min-w-0">New leads (last 24h)</span>
              {rows.length > 0 && (
                <Badge className="ml-0.5 shrink-0 border-brand-primary/30 bg-brand-primary/15 px-1.5 text-[9px] sm:ml-2 sm:text-[10px]">
                  {rows.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1 max-w-prose text-[10px] leading-4 sm:text-xs">
              Fresh enquiries waiting on a first response.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/leads")} aria-label="View all leads" title="View all leads" className="shrink-0">
            <Button variant="ghost" size="sm" className="h-9 w-9 shrink-0 px-0 text-brand-primary sm:h-8 sm:w-auto sm:px-2">
              <span className="sr-only sm:not-sr-only">All leads</span>
              <ArrowRight className="ml-0 h-3.5 w-3.5 sm:ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-3 pb-3 sm:px-6 sm:pb-6">
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="min-w-0 divide-y divide-brand-primary/15">
            {rows.map((r) => {
              const name = r.contact_name || r.client_name || "Unknown enquiry";
              const email = r.email || r.client_email || "";
              const phone = r.phone || r.client_phone || "";
              const age = hoursAgo(r.created_at);
              // Phase 23 #3: deep-link each row into the lead detail.
              return (
                <li key={r.id}>
                  <Link
                    href={withSlug(`/admin/leads?leadId=${r.id}`)}
                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 rounded px-1.5 py-2 hover:bg-brand-primary/10 sm:gap-x-3 sm:px-2"
                  >
                    <Badge className="mt-0.5 shrink-0 border-brand-primary/20 bg-brand-primary/15 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-brand-primary sm:text-[10px]">
                      {age <= 0 ? "now" : `${age}h ago`}
                    </Badge>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium leading-4 text-slate-900 sm:text-sm">
                        {name}
                        {r.source && (
                          <span className="ml-1 text-[10px] font-normal text-slate-500 sm:ml-2 sm:text-[11px]">
                            via {r.source}
                          </span>
                        )}
                      </p>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] leading-4 text-slate-500 sm:text-[11px]">
                        {email && (
                          <span className="inline-flex min-w-0 basis-full items-center gap-1 sm:basis-auto">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{email}</span>
                          </span>
                        )}
                        {phone && (
                          <span className="inline-flex min-w-0 max-w-full items-center gap-1 whitespace-nowrap">
                            <Phone className="h-3 w-3 shrink-0" />{phone}
                          </span>
                        )}
                        {r.event_date && (
                          <span className="min-w-0 text-slate-600">
                            Event {r.event_date}
                          </span>
                        )}
                      </div>
                    </div>
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
