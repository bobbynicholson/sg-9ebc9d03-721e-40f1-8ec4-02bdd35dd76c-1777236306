/**
 * /admin/platform/audit-logs
 *
 * Skylight super-admin viewer for the audit_logs table. Surfaces the
 * append-only trail that every workflow service writes when something
 * meaningful happens (refund processed, driver reassigned, allergen
 * review skipped, etc.) so we can answer "what happened with this
 * order on Tuesday?" without dropping into SQL.
 *
 * Phase 2 #8. Read-only by design - the actions belong on the
 * per-entity pages this links out to.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader } from "@/components/portal/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { ListSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollText, RefreshCw, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";

interface AuditRow {
  id: string;
  created_at: string;
  user_id: string | null;
  company_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  ip_address: string | null;
  details: any;
}

interface CompanyOption {
  id: string;
  company_name: string | null;
}

interface ProfileOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

const PAGE_SIZE = 50;

const fmtTs = (iso: string) => {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

// Map an entity_type + entity_id to the deepest useful admin URL.
// Most of these are super-admin scoped but the rows still belong to a
// specific tenant - linking to the per-tenant admin path opens the
// tenant view (super-admin can read across tenants).
const entityHref = (entityType: string, entityId: string | null): string | null => {
  if (!entityId) return null;
  switch (entityType) {
    case "order":
      return `/order/${entityId}`;
    case "quote":
      return `/admin/quotes/${entityId}`;
    case "payment":
      return `/admin/refunds?paymentId=${entityId}`;
    case "company":
      return `/admin/platform/company-database?companyId=${entityId}`;
    case "user":
      return `/admin/users?userId=${entityId}`;
    default:
      return null;
  }
};

// Tone the row border by action class so eyes parse the stream
// without reading every word. Refund + payment + cancel are the
// expensive failure modes; default tone is neutral.
const toneFor = (action: string): string => {
  if (action.includes("fail") || action.includes("error") || action.includes("crashed")) {
    return "border-l-red-500 bg-red-50/40";
  }
  if (action.includes("refund") || action.includes("cancel")) {
    return "border-l-amber-500 bg-amber-50/40";
  }
  if (action.includes("delete") || action.includes("removed")) {
    return "border-l-rose-400 bg-rose-50/40";
  }
  return "border-l-slate-300 bg-white";
};

function AuditLogsViewer() {
  const { user, loading: authLoading } = useAuth() as any;
  const router = useRouter();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Phase 6 #2: filter state lives in the URL so a deep-link to a
  // specific filtered view (e.g. a Slack message linking 'every
  // refund_auto_failed for this tenant in the last 24h') survives
  // tab reload and is shareable between super-admins. router.query
  // is the source of truth; we hydrate state from it on mount and
  // push changes back via router.replace.
  const q = router.query;
  const [companyId, setCompanyId] = useState<string>(
    typeof q.company === "string" ? q.company : "all",
  );
  const [actionFilter, setActionFilter] = useState<string>(
    typeof q.action === "string" ? q.action : "",
  );
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>(
    typeof q.entityType === "string" ? q.entityType : "all",
  );
  const [entityIdFilter, setEntityIdFilter] = useState<string>(
    typeof q.entityId === "string" ? q.entityId : "",
  );
  const [sinceFilter, setSinceFilter] = useState<string>(
    typeof q.since === "string" ? q.since : "7d",
  );
  // Phase 5 #2: free-text search across details JSON. Casts the
  // jsonb to text on the server and ilike-matches so an operator
  // can find 'reason: late_arrival' without knowing the column key.
  const [detailsSearch, setDetailsSearch] = useState<string>(
    typeof q.q === "string" ? q.q : "",
  );
  const [page, setPage] = useState<number>(
    typeof q.page === "string" && /^\d+$/.test(q.page) ? Number(q.page) : 0,
  );

  // Mirror state -> URL on any filter change. shallow:true so we
  // don't refetch via getServerSideProps (which we don't use anyway).
  // Defaults are stripped so /audit-logs without params stays clean.
  useEffect(() => {
    if (!router.isReady) return;
    const next: Record<string, string> = {};
    if (companyId !== "all") next.company = companyId;
    if (actionFilter.trim()) next.action = actionFilter.trim();
    if (entityTypeFilter !== "all") next.entityType = entityTypeFilter;
    if (entityIdFilter.trim()) next.entityId = entityIdFilter.trim();
    if (sinceFilter !== "7d") next.since = sinceFilter;
    if (detailsSearch.trim()) next.q = detailsSearch.trim();
    if (page > 0) next.page = String(page);
    router.replace({ pathname: router.pathname, query: next }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, actionFilter, entityTypeFilter, entityIdFilter, sinceFilter, detailsSearch, page]);

  // Lookups for label hydration. Worth a single round-trip per page
  // so the operator sees "Spit Braai Delivery" instead of a UUID.
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileOption>>({});
  const [companyMap, setCompanyMap] = useState<Record<string, CompanyOption>>({});

  useEffect(() => {
    if (authLoading || !user) return;
    void loadCompanies();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, companyId, actionFilter, entityTypeFilter, entityIdFilter, sinceFilter, detailsSearch, page]);

  const loadCompanies = async () => {
    try {
      const { data } = await supabase
        .from("companies")
        .select("id, company_name")
        .is("deleted_at", null)
        .order("company_name", { ascending: true });
      const list = (data || []) as CompanyOption[];
      setCompanies(list);
      const map: Record<string, CompanyOption> = {};
      for (const c of list) map[c.id] = c;
      setCompanyMap(map);
    } catch (e) {
      // Filter still works without the dropdown - just no name hydration.
      console.warn("[audit-logs] company list load failed:", e);
    }
  };

  const sinceTimestamp = (): string | null => {
    const now = Date.now();
    switch (sinceFilter) {
      case "1h": return new Date(now - 60 * 60 * 1000).toISOString();
      case "24h": return new Date(now - 24 * 60 * 60 * 1000).toISOString();
      case "7d": return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      case "30d": return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      case "all": return null;
      default: return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("audit_logs")
        .select("id, created_at, user_id, company_id, action, entity_type, entity_id, ip_address, details", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (companyId !== "all") q = q.eq("company_id", companyId);
      if (entityTypeFilter !== "all") q = q.eq("entity_type", entityTypeFilter);
      if (actionFilter.trim()) q = q.ilike("action", `%${actionFilter.trim()}%`);
      if (entityIdFilter.trim()) q = q.eq("entity_id", entityIdFilter.trim());
      // Phase 5 #2: jsonb-as-text contains-match on the details
      // payload. Postgres can ILIKE on a jsonb cast-to-text, no
      // GIN index required for this volume. The same wildcard
      // wraps the term so an operator types 'gateway_revoked' and
      // gets every audit row where details mentions it.
      if (detailsSearch.trim()) {
        q = q.filter("details::text", "ilike", `%${detailsSearch.trim()}%`);
      }
      const since = sinceTimestamp();
      if (since) q = q.gte("created_at", since);

      const { data, error, count } = await q;
      if (error) throw error;

      const list = (data || []) as AuditRow[];
      setRows(list);
      setTotalCount(typeof count === "number" ? count : null);

      // Hydrate user labels for the rows we just pulled. Single IN
      // query, cheap. Skip if we already have everyone we need.
      const userIds = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean) as string[]));
      const missing = userIds.filter((id) => !profileMap[id]);
      if (missing.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", missing);
        if (profiles) {
          const next = { ...profileMap };
          for (const p of profiles as any[]) next[p.id] = p as ProfileOption;
          setProfileMap(next);
        }
      }
    } catch (e: any) {
      console.error("[audit-logs] load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  // The list of entity_types we've actually seen in the loaded page.
  // Beats hard-coding - new producers (e.g. webhook_failed) show up
  // automatically once a row exists.
  const seenEntityTypes = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.entity_type) s.add(r.entity_type);
    return Array.from(s).sort();
  }, [rows]);

  const totalPages = totalCount != null ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : null;

  return (
    <>
      <Head>
        <title>Platform audit logs - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Audit logs"
            subtitle="Append-only trail across every tenant. Read-only view; the action belongs on the entity page each row links to."
            icon={ScrollText}
            actions={
              <Button variant="outline" size="sm" onClick={() => { setPage(0); void load(); }} className="gap-1">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
            }
          />

          <PortalCard className="mb-5">
            <PortalCardHeader title="Filters" />
            <p className="-mt-2 mb-3 text-xs text-slate-500 dark:text-slate-400">
              Combine any of these. Defaults to the last 7 days across every tenant.
            </p>
            <div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div>
                  <Label className="text-xs">Tenant</Label>
                  <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setPage(0); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tenants</SelectItem>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.company_name || c.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Entity type</Label>
                  <Select value={entityTypeFilter} onValueChange={(v) => { setEntityTypeFilter(v); setPage(0); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {/* Common ones plus anything seen in the loaded page */}
                      {Array.from(new Set([
                        "order", "quote", "payment", "company", "user",
                        ...seenEntityTypes,
                      ])).map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Action contains</Label>
                  <Input
                    value={actionFilter}
                    onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
                    placeholder="e.g. refund_auto_failed"
                  />
                </div>
                <div>
                  <Label className="text-xs">Entity id (exact)</Label>
                  <Input
                    value={entityIdFilter}
                    onChange={(e) => { setEntityIdFilter(e.target.value); setPage(0); }}
                    placeholder="UUID"
                  />
                </div>
                <div>
                  <Label className="text-xs">Details contains</Label>
                  <Input
                    value={detailsSearch}
                    onChange={(e) => { setDetailsSearch(e.target.value); setPage(0); }}
                    placeholder="e.g. gateway_revoked, $4123"
                  />
                </div>
                <div>
                  <Label className="text-xs">Since</Label>
                  <Select value={sinceFilter} onValueChange={(v) => { setSinceFilter(v); setPage(0); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">Last hour</SelectItem>
                      <SelectItem value="24h">Last 24 hours</SelectItem>
                      <SelectItem value="7d">Last 7 days</SelectItem>
                      <SelectItem value="30d">Last 30 days</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </PortalCard>

          {loading ? (
            <ListSkeleton rows={8} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No audit rows match the current filters"
              description="Loosen the filters or expand the window if you think something should be here."
            />
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const tone = toneFor(r.action);
                const href = entityHref(r.entity_type, r.entity_id);
                const user = r.user_id ? profileMap[r.user_id] : null;
                const company = r.company_id ? companyMap[r.company_id] : null;
                return (
                  <div
                    key={r.id}
                    className={`border border-slate-200 border-l-4 rounded-md p-3 ${tone}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[11px] text-slate-500">{fmtTs(r.created_at)}</span>
                          <Badge variant="outline" className="text-[10px] font-semibold">
                            {r.action}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] bg-slate-100">
                            {r.entity_type}
                          </Badge>
                          {company?.company_name && (
                            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                              {company.company_name}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-700 flex flex-wrap items-center gap-2">
                          <span>
                            <span className="text-slate-500">by</span>{" "}
                            <span className="font-medium">
                              {user?.full_name || user?.email || (r.user_id ? r.user_id.slice(0, 8) : "system")}
                            </span>
                          </span>
                          {r.entity_id && (
                            <span className="font-mono text-[11px] text-slate-500">
                              {r.entity_id.slice(0, 8)}
                            </span>
                          )}
                          {r.ip_address && (
                            <span className="font-mono text-[11px] text-slate-400">
                              {r.ip_address}
                            </span>
                          )}
                        </div>
                        {r.details && Object.keys(r.details).length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                              details
                            </summary>
                            <pre className="mt-1 text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                              {JSON.stringify(r.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                      {href && (
                        <Link href={href} className="shrink-0 text-xs text-slate-700 hover:text-slate-900 inline-flex items-center gap-1">
                          Open <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Pagination */}
              <div className="flex items-center justify-between pt-3 text-xs text-slate-600">
                <div>
                  Page {page + 1}
                  {totalPages ? ` of ${totalPages}` : ""}
                  {totalCount != null && (
                    <span className="text-slate-400 ml-2">({totalCount.toLocaleString()} total)</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || loading}
                    className="h-7 px-2 gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={rows.length < PAGE_SIZE || loading}
                    className="h-7 px-2 gap-1"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </PortalShell>
      </div>
    </>
  );
}

export default function ProtectedAuditLogs() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <AuditLogsViewer />
    </ProtectedRoute>
  );
}
