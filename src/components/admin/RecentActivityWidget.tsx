/**
 * RecentActivityWidget - last 8 audit_logs entries across the
 * tenant.
 *
 * Phase 14 #7. /admin/audit-logs is the deep-dive surface; this
 * widget surfaces 'what's happening right now' on the dashboard
 * so owners get a quick read on team activity without opening
 * the audit explorer.
 *
 * Self-hides when no audit rows exist.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollText, ArrowRight } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";

interface AuditRow {
  id: string;
  created_at: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
}
interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
}

const fmtRelative = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const entityHref = (entityType: string, entityId: string | null): string | null => {
  if (!entityId) return null;
  switch (entityType) {
    case "order": return `/order/${entityId}`;
    case "quote": return `/admin/quotes?quoteId=${entityId}`;
    case "invoice": return `/admin/invoices?invoiceId=${entityId}`;
    case "driver_shift": return `/admin/driver-settlement`;
    default: return null;
  }
};

export function RecentActivityWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("audit_logs")
          .select("id, created_at, user_id, action, entity_type, entity_id, details")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(8);
        if (error) {
          console.error("[RecentActivityWidget] audit_logs fetch failed:", error);
        }
        if (cancelled) return;
        const list = (data || []) as AuditRow[];
        setRows(list);
        const userIds = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean) as string[]));
        if (userIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", userIds);
          if (profilesError) {
            console.error("[RecentActivityWidget] profiles fetch failed:", profilesError);
          }
          if (cancelled) return;
          const map: Record<string, ProfileLite> = {};
          for (const p of (profiles || []) as ProfileLite[]) map[p.id] = p;
          setProfileMap(map);
        }
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
    <Card className="mb-6 border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="w-4 h-4 text-slate-600" />
              Recent activity
            </CardTitle>
            <CardDescription className="text-xs">
              Last 8 audit_logs entries across the tenant. Newest first.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/audit-logs")}>
            <Button variant="ghost" size="sm" className="text-slate-700">
              All audit logs <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const actor = r.user_id
                ? (profileMap[r.user_id]?.full_name || profileMap[r.user_id]?.email || "Unknown")
                : "system";
              const href = entityHref(r.entity_type, r.entity_id);
              const action = r.action.replace(/_/g, " ");
              return (
                <li key={r.id} className="py-2 flex items-center gap-3">
                  <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                    {r.entity_type.replace(/_/g, " ")}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 truncate">
                      <span className="font-medium">{actor}</span>{" "}
                      <span className="text-slate-600">{action}</span>
                      {href && (
                        <Link href={href} className="text-blue-600 hover:underline ml-1 text-[11px] font-mono">
                          ({r.entity_id?.slice(0, 8)}…)
                        </Link>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">{fmtRelative(r.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
