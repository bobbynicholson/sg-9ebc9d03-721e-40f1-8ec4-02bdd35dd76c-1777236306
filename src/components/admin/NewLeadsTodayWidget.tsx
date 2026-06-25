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
    <Card className="mb-6 border-brand-primary/20 bg-brand-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-brand-primary" />
              New leads (last 24h)
              {rows.length > 0 && (
                <Badge className="ml-2 bg-brand-primary/15 text-brand-primary border-brand-primary/30 text-[10px]">
                  {rows.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Fresh enquiries waiting on first contact. First response wins - the longer they sit the colder they go.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/leads")}>
            <Button variant="ghost" size="sm" className="text-brand-primary">
              All leads <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-brand-primary/15">
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
                    className="py-2 flex items-center gap-3 hover:bg-brand-primary/10 rounded transition"
                  >
                    <Badge className="shrink-0 text-[10px] uppercase tracking-wide font-semibold bg-brand-primary/15 text-brand-primary border-brand-primary/20">
                      {age <= 0 ? "now" : `${age}h ago`}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {name}
                        {r.source && (
                          <span className="ml-2 text-[11px] font-normal text-slate-500">
                            via {r.source}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
                        {email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3" />{email}
                          </span>
                        )}
                        {phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" />{phone}
                          </span>
                        )}
                        {r.event_date && (
                          <span className="text-violet-700">
                            Event {r.event_date}
                          </span>
                        )}
                      </p>
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
