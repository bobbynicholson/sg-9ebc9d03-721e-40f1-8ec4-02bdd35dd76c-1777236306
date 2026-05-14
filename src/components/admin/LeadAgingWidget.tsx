/**
 * LeadAgingWidget -- oldest active leads that haven't been
 * actioned in a while.
 *
 * Phase 14 #1. The contacts page surfaces leads but doesn't sort
 * them by neglect. Sales leads with a steady inflow lose the
 * oldest enquiries to the bottom of the list and never circle
 * back -- the lead goes cold, the deal walks.
 *
 * Self-hides when no lead has been waiting more than 3 days.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Inbox, ArrowRight, Mail, Phone } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";

interface LeadRow {
  id: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  source: string | null;
  event_date: string | null;
  created_at: string | null;
}

const daysAgo = (iso: string | null): number => {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
};

export function LeadAgingWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        // Active = not converted, not lost. We treat 'new', 'contacted',
        // 'qualifying' and 'quoted' as still in play. Anything older
        // than 3 days qualifies for the widget.
        const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
        const { data } = await (supabase as any)
          .from("leads")
          .select("id, contact_name, email, phone, status, source, event_date, created_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .is("converted_at", null)
          .not("status", "in", "(\"won\",\"lost\",\"closed\")")
          .lte("created_at", cutoff)
          .order("created_at", { ascending: true })
          .limit(5);
        if (!cancelled) setRows((data || []) as LeadRow[]);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (!companyId) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <Card className="mb-6 border-orange-200 bg-orange-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="w-4 h-4 text-orange-600" />
              Leads needing follow-up
            </CardTitle>
            <CardDescription className="text-xs">
              Active leads sitting more than 3 days without conversion. Oldest first.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/contacts")}>
            <Button variant="ghost" size="sm" className="text-orange-700">
              All contacts <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-orange-100">
            {rows.map((l) => {
              const age = daysAgo(l.created_at);
              const tone = age >= 14
                ? "bg-rose-100 text-rose-800 border-rose-200"
                : age >= 7
                  ? "bg-orange-100 text-orange-800 border-orange-200"
                  : "bg-amber-100 text-amber-800 border-amber-200";
              // Phase 22 #10: deep-link each row into the leads
              // detail. Completes the clickable-rows pattern shared
              // across the overdue invoices / pending refunds /
              // cancelled orders / now leads chase widgets.
              return (
                <li key={l.id}>
                  <Link
                    href={withSlug(`/admin/leads?leadId=${l.id}`)}
                    className="py-2 flex items-center gap-3 hover:bg-orange-50/60 rounded transition"
                  >
                    <Badge className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold ${tone}`}>
                      {age}d
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{l.contact_name || "Unknown"}</p>
                      <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
                        {l.email && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3" /> {l.email}
                          </span>
                        )}
                        {l.phone && (
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Phone className="w-3 h-3" /> {l.phone}
                          </span>
                        )}
                        {l.source && <span className="capitalize">via {l.source}</span>}
                        {l.status && <Badge variant="outline" className="text-[10px] capitalize">{l.status}</Badge>}
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
