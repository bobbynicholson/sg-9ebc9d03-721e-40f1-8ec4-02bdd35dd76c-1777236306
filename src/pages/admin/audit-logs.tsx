/**
 * /admin/audit-logs -- company-scoped audit trail viewer.
 *
 * Phase 8 #5. The platform-level page at /admin/platform/audit-logs
 * is super-admin only and pivots across every tenant. Company
 * admins needed their own version that:
 *   - shows only their own company's rows (RLS already enforces
 *     this, the SELECT just doesn't fight it),
 *   - opens to a sensible default (last 7 days, newest first),
 *   - lets them search the action label + free-text details,
 *   - links each row out to the relevant entity page when
 *     entity_type maps to a known admin URL.
 *
 * Read-only. Mutations belong on the per-entity pages.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Footer } from "@/components/Footer";
import { ScrollText, RefreshCw, ExternalLink, ChevronLeft, ChevronRight, Search } from "lucide-react";

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

interface ProfileOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

const PAGE_SIZE = 50;

const fmtTs = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

const entityHref = (entityType: string, entityId: string | null): string | null => {
  if (!entityId) return null;
  switch (entityType) {
    case "order":
      return `/admin/orders?orderId=${entityId}`;
    case "quote":
      return `/admin/quotes/${entityId}`;
    case "driver_shift":
      return `/admin/driver-settlement`;
    case "invoice":
      return `/admin/invoices?invoiceId=${entityId}`;
    case "payment":
      return `/admin/refunds?paymentId=${entityId}`;
    default:
      return null;
  }
};

// Tone the row border by action class so eyes parse the stream
// without reading every word.
const toneFor = (action: string): string => {
  if (action.includes("fail") || action.includes("error")) return "border-l-red-500 bg-red-50/40";
  if (action.includes("refund") || action.includes("cancel")) return "border-l-amber-500 bg-amber-50/40";
  if (action.includes("delete") || action.includes("removed")) return "border-l-rose-400 bg-rose-50/40";
  return "border-l-slate-300 bg-white";
};

function CompanyAuditLogsViewer() {
  const { user, loading: authLoading } = useAuth() as any;
  const companyId = user?.company_id || null;

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileOption>>({});

  const [actionFilter, setActionFilter] = useState<string>("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [entityIdFilter, setEntityIdFilter] = useState<string>("");
  const [sinceFilter, setSinceFilter] = useState<string>("7d");
  const [detailsSearch, setDetailsSearch] = useState<string>("");
  const [page, setPage] = useState<number>(0);

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
    if (!companyId) return;
    setLoading(true);
    try {
      let q = supabase
        .from("audit_logs")
        .select("id, created_at, user_id, company_id, action, entity_type, entity_id, ip_address, details", { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (entityTypeFilter !== "all") q = q.eq("entity_type", entityTypeFilter);
      if (actionFilter.trim()) q = q.ilike("action", `%${actionFilter.trim()}%`);
      if (entityIdFilter.trim()) q = q.eq("entity_id", entityIdFilter.trim());
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
      // query so the operator sees a name instead of a UUID.
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

  useEffect(() => {
    if (authLoading || !companyId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, companyId, actionFilter, entityTypeFilter, entityIdFilter, sinceFilter, detailsSearch, page]);

  // Distinct entity_type values we know we write today, so the
  // dropdown surfaces real options without a round-trip to discover
  // them. Anything else still appears in the row label.
  const ENTITY_TYPES = [
    "all", "order", "quote", "invoice", "payment", "driver_shift",
    "driver_assignment", "lead", "client", "company", "user", "menu_item", "equipment",
  ];

  const totalPages = totalCount != null ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : 1;

  return (
    <>
      <Head><title>Audit logs - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 lg:pl-72 xl:pl-80">
        <div className="px-4 pt-20 lg:pt-6 pb-12 max-w-full">
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-lg">
                  <ScrollText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
                    Audit logs
                  </h1>
                  <p className="text-slate-600 mt-1 text-sm">
                    Append-only trail of meaningful actions across orders, quotes, payments, shifts and more. Read-only -- mutations belong on the per-entity pages.
                  </p>
                </div>
              </div>
              <Button onClick={() => { setPage(0); void load(); }} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Filters</CardTitle>
                <CardDescription className="text-xs">Combine to narrow the stream. Filters reset paging to page 1.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div>
                    <Label className="text-xs">Since</Label>
                    <Select value={sinceFilter} onValueChange={(v) => { setSinceFilter(v); setPage(0); }}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1h">Last hour</SelectItem>
                        <SelectItem value="24h">Last 24 hours</SelectItem>
                        <SelectItem value="7d">Last 7 days</SelectItem>
                        <SelectItem value="30d">Last 30 days</SelectItem>
                        <SelectItem value="all">All time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Entity type</Label>
                    <Select value={entityTypeFilter} onValueChange={(v) => { setEntityTypeFilter(v); setPage(0); }}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ENTITY_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t === "all" ? "All entity types" : t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Action contains</Label>
                    <Input
                      placeholder="e.g. refund, deleted"
                      value={actionFilter}
                      onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Entity ID</Label>
                    <Input
                      placeholder="UUID"
                      value={entityIdFilter}
                      onChange={(e) => { setEntityIdFilter(e.target.value); setPage(0); }}
                      className="mt-1 h-9 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Details contain</Label>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-slate-400" />
                      <Input
                        placeholder="free text"
                        value={detailsSearch}
                        onChange={(e) => { setDetailsSearch(e.target.value); setPage(0); }}
                        className="mt-1 h-9 pl-7"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    {totalCount != null ? `${totalCount.toLocaleString()} matching rows` : "Loading..."}
                  </CardTitle>
                  <CardDescription className="text-xs">Newest first. 50 per page.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm" variant="outline" disabled={page === 0 || loading}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-slate-600 tabular-nums">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    size="sm" variant="outline" disabled={page + 1 >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-16 text-slate-500 text-sm">Loading audit rows...</div>
                ) : rows.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 text-sm">
                    <ScrollText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    No matching audit rows.
                    <p className="text-xs mt-1">Try widening the time window or clearing filters.</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {rows.map((r) => {
                      const href = entityHref(r.entity_type, r.entity_id);
                      const actor = r.user_id ? profileMap[r.user_id] : null;
                      const actorLabel = actor?.full_name || actor?.email || (r.user_id ? `${r.user_id.slice(0, 8)}...` : "system");
                      return (
                        <li
                          key={r.id}
                          className={`border-l-4 ${toneFor(r.action)} rounded-md border border-slate-200 p-3 text-sm`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs font-mono">{r.entity_type}</Badge>
                              <span className="font-semibold text-slate-900">{r.action}</span>
                            </div>
                            <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                              {fmtTs(r.created_at)}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>by <span className="font-medium text-slate-800">{actorLabel}</span></span>
                            {r.entity_id && (
                              <span className="font-mono">{r.entity_id.slice(0, 8)}...</span>
                            )}
                            {href && (
                              <Link href={href} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                                Open <ExternalLink className="w-3 h-3" />
                              </Link>
                            )}
                          </div>
                          {r.details && Object.keys(r.details).length > 0 && (
                            <details className="mt-2">
                              <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-700">Details</summary>
                              <pre className="mt-1 text-[11px] bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words text-slate-700">
                                {JSON.stringify(r.details, null, 2)}
                              </pre>
                            </details>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}

export default function AdminAuditLogsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <CompanyAuditLogsViewer />
    </ProtectedRoute>
  );
}
