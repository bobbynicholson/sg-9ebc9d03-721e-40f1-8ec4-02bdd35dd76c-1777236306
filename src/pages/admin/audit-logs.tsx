/**
 * /admin/audit-logs - company-scoped audit trail viewer.
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
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench, StatTile,
} from "@/components/portal/ui";
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
import { ScrollText, RefreshCw, ExternalLink, ChevronLeft, ChevronRight, Search, Download, Copy, CalendarClock, Users, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

import { staffOrderHref } from "@/lib/orderUrls";

const entityHref = (entityType: string, entityId: string | null): string | null => {
  if (!entityId) return null;
  switch (entityType) {
    case "order":
    case "orders":
      return staffOrderHref(entityId, "admin");
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
  if (action.includes("fail") || action.includes("error")) return "border-l-red-500 bg-rose-50/40";
  if (action.includes("refund") || action.includes("cancel")) return "border-l-amber-500 bg-amber-50/40";
  if (action.includes("delete") || action.includes("removed")) return "border-l-rose-400 bg-rose-50/40";
  return "border-l-slate-300 bg-white";
};

function CompanyAuditLogsViewer() {
  const { user, loading: authLoading } = useAuth() as any;
  const { toast } = useToast();
  // Restructure audit 2026-07-02: entity links must carry the tenant
  // slug. Raw /admin/... hrefs dropped the ?company_slug context and
  // landed the operator on the slugless route.
  const { withSlug } = useTenantHref();
  const companyId = user?.company_id || null;

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileOption>>({});

  const [actionFilter, setActionFilter] = useState<string>("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  // Phase 17 #3: saved-view chips. Compliance + ops repeatedly
  // hit the same audit slices (driver_shift edits last 24h,
  // refund_auto_failed last 7d). Snapshot every filter dimension
  // under a named chip in localStorage.
  interface SavedAuditView {
    id: string;
    name: string;
    actionFilter: string;
    entityTypeFilter: string;
    entityIdFilter: string;
    sinceFilter: string;
    detailsSearch: string;
  }
  const [savedAuditViews, setSavedAuditViews] = useState<SavedAuditView[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("cateringms.adminAuditLogs.savedViews.v1");
      if (raw) setSavedAuditViews(JSON.parse(raw) as SavedAuditView[]);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "cateringms.adminAuditLogs.savedViews.v1",
        JSON.stringify(savedAuditViews),
      );
    } catch { /* storage blocked */ }
  }, [savedAuditViews]);
  const [entityIdFilter, setEntityIdFilter] = useState<string>("");
  const saveCurrentAuditView = () => {
    if (typeof window === "undefined") return;
    const name = window.prompt("Name this view:", "");
    if (!name || !name.trim()) return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setSavedAuditViews((prev) => [
      ...prev.filter((v) => v.name.toLowerCase() !== name.trim().toLowerCase()),
      { id, name: name.trim(), actionFilter, entityTypeFilter, entityIdFilter, sinceFilter, detailsSearch },
    ]);
  };
  const applySavedAuditView = (v: SavedAuditView) => {
    setActionFilter(v.actionFilter);
    setEntityTypeFilter(v.entityTypeFilter);
    setEntityIdFilter(v.entityIdFilter);
    setSinceFilter(v.sinceFilter);
    setDetailsSearch(v.detailsSearch);
    setPage(0);
  };
  const removeSavedAuditView = (id: string) =>
    setSavedAuditViews((prev) => prev.filter((v) => v.id !== id));
  const [sinceFilter, setSinceFilter] = useState<string>("7d");
  const [detailsSearch, setDetailsSearch] = useState<string>("");
  const [page, setPage] = useState<number>(0);

  // Restructure audit 2026-07-02: debounce the three free-text filters.
  // Every keystroke used to fire a fresh count+select against
  // audit_logs; typing "refund" issued six queries and the out-of-order
  // responses could leave a stale page on screen.
  const [debounced, setDebounced] = useState({ action: "", entityId: "", details: "" });
  useEffect(() => {
    const t = setTimeout(
      () =>
        // Identity-preserving update: if nothing actually changed
        // (mount tick, or typing then deleting back), keep the same
        // object so the load effect does not refire for no reason.
        setDebounced((prev) =>
          prev.action === actionFilter && prev.entityId === entityIdFilter && prev.details === detailsSearch
            ? prev
            : { action: actionFilter, entityId: entityIdFilter, details: detailsSearch },
        ),
      400,
    );
    return () => clearTimeout(t);
  }, [actionFilter, entityIdFilter, detailsSearch]);

  // Details-search fallback state: PostgREST cannot ilike a jsonb
  // column (the old `details::text` cast filter always failed with
  // 42883 "operator does not exist: jsonb ~~*", so the "Details
  // contain" box has never returned a row). We now scan the newest
  // DETAILS_SCAN_CAP rows matching the other filters and match the
  // JSON client-side. This flag tells the operator when the scan
  // window was clipped.
  const [detailsScanCapped, setDetailsScanCapped] = useState(false);

  // Phase 18 #6: retention hint. Compliance asks "how far back can
  // we actually go" all the time, and the answer is whatever the
  // earliest row in audit_logs for this company says. One cheap
  // ascending-by-1 query on mount, surfaced as a small hint chip
  // so the operator can size their "All time" filter expectations.
  const [oldestEntryAt, setOldestEntryAt] = useState<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("audit_logs")
          .select("created_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: true })
          .limit(1);
        if (!cancelled && data && data.length > 0) {
          setOldestEntryAt((data[0] as any).created_at);
        }
      } catch { /* non-blocking */ }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

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

  // Client-side scan window for the details search (see the
  // detailsScanCapped comment above for why this is not server-side).
  const DETAILS_SCAN_CAP = 2000;

  const detailsMatches = (details: any, needle: string): boolean => {
    if (details == null) return false;
    try {
      return JSON.stringify(details).toLowerCase().includes(needle);
    } catch {
      return false;
    }
  };

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const detailsNeedle = debounced.details.trim().toLowerCase();
      let q = supabase
        .from("audit_logs")
        .select("id, created_at, user_id, company_id, action, entity_type, entity_id, ip_address, details", { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (entityTypeFilter !== "all") q = q.eq("entity_type", entityTypeFilter);
      if (debounced.action.trim()) q = q.ilike("action", `%${debounced.action.trim()}%`);
      if (debounced.entityId.trim()) q = q.eq("entity_id", debounced.entityId.trim());
      const since = sinceTimestamp();
      if (since) q = q.gte("created_at", since);

      let list: AuditRow[];
      if (detailsNeedle) {
        // Fetch the newest scan window matching the other filters,
        // match the details JSON client-side, paginate the matches.
        const { data, error } = await q.limit(DETAILS_SCAN_CAP);
        if (error) throw error;
        const scanned = (data || []) as AuditRow[];
        const matched = scanned.filter((r) => detailsMatches(r.details, detailsNeedle));
        setDetailsScanCapped(scanned.length >= DETAILS_SCAN_CAP);
        setTotalCount(matched.length);
        list = matched.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
      } else {
        const { data, error, count } = await q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (error) throw error;
        setDetailsScanCapped(false);
        setTotalCount(typeof count === "number" ? count : null);
        list = (data || []) as AuditRow[];
      }
      setRows(list);

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
          // Functional update: two in-flight loads no longer drop each
          // other's hydrated names (the old spread read a stale map).
          setProfileMap((prev) => {
            const next = { ...prev };
            for (const p of profiles as any[]) next[p.id] = p as ProfileOption;
            return next;
          });
        }
      }
    } catch (e: any) {
      console.error("[audit-logs] load failed:", e);
      // Silent-failure audit: an empty table after a failed load read
      // as "no audit activity", which is exactly the wrong signal on
      // a compliance surface. Persistent error card + toast.
      setLoadError(e?.message || "The audit trail couldn't be fetched.");
      toast({
        title: "Could not load audit logs",
        description: e?.message || "The audit trail couldn't be fetched. Refresh to try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!companyId) {
      // Edge case: an authenticated account with no company resolved
      // (mid-onboarding, or a super admin without tenant context) used
      // to sit on the "Loading..." card forever because load() bailed
      // silently. Surface it as a real error state instead.
      setLoading(false);
      setLoadError("No company is linked to your account, so there is no audit trail to show. Sign out and back in, or contact support.");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, companyId, debounced, entityTypeFilter, sinceFilter, page]);

  // Distinct entity_type values we know we write today, so the
  // dropdown surfaces real options without a round-trip to discover
  // them. Anything else still appears in the row label.
  const ENTITY_TYPES = [
    "all", "order", "orders", "quote", "invoice", "payment", "driver_shift",
    "driver_assignment", "lead", "client", "company", "user", "menu_item", "equipment",
  ];

  const totalPages = totalCount != null ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : 1;

  // Live aggregates for the StatTile band. Computed from the loaded
  // page plus the exact server count - never hardcoded.
  const pageStats = useMemo(() => {
    const actors = new Set<string>();
    let flagged = 0;
    for (const r of rows) {
      actors.add(r.user_id || "system");
      if (/fail|error|refund|cancel|delete|removed/.test(r.action)) flagged += 1;
    }
    return { actors: actors.size, flagged };
  }, [rows]);
  const historyDays = oldestEntryAt
    ? Math.max(0, Math.floor((Date.now() - new Date(oldestEntryAt).getTime()) / (24 * 60 * 60 * 1000)))
    : null;

  // Phase 9 #9: CSV export of the currently filtered audit set.
  // Re-runs the same query without the page range so the export
  // covers EVERY matching row, not just the visible page. Capped
  // at 5000 to keep the browser comfortable + avoid hammering the
  // RLS check; if the count is higher the operator gets a heads-up
  // and the export proceeds against the first 5k rows.
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!companyId) return;
    setExporting(true);
    try {
      const HARD_CAP = 5000;
      let q = (supabase as any)
        .from("audit_logs")
        .select("id, created_at, user_id, company_id, action, entity_type, entity_id, ip_address, details")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(HARD_CAP);
      if (entityTypeFilter !== "all") q = q.eq("entity_type", entityTypeFilter);
      if (actionFilter.trim()) q = q.ilike("action", `%${actionFilter.trim()}%`);
      if (entityIdFilter.trim()) q = q.eq("entity_id", entityIdFilter.trim());
      const since = sinceTimestamp();
      if (since) q = q.gte("created_at", since);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data || []) as AuditRow[];
      // Details search matches client-side (PostgREST cannot ilike a
      // jsonb column - the old cast filter made every detail-filtered
      // export fail outright).
      const needle = detailsSearch.trim().toLowerCase();
      if (needle) rows = rows.filter((r) => detailsMatches(r.details, needle));
      if (rows.length === 0) {
        // The button used to stop spinning with no file and no reason.
        toast({ title: "Nothing to export", description: "No rows match the current filters." });
        return;
      }
      // The heads-up the HARD_CAP comment promised: tell the operator
      // when the filtered set exceeds what landed in the file.
      if (totalCount != null && totalCount > HARD_CAP) {
        toast({
          title: "Export capped at 5000 rows",
          description: `${totalCount.toLocaleString()} rows match; the newest ${HARD_CAP.toLocaleString()} were exported. Narrow the filters for full coverage.`,
        });
      }
      const headers = ["timestamp", "actor", "action", "entity_type", "entity_id", "ip_address", "details"];
      const esc = (v: any) => {
        if (v == null) return "";
        const s = typeof v === "string" ? v : JSON.stringify(v);
        const cleaned = s.replace(/"/g, '""');
        return /[",\n]/.test(cleaned) ? `"${cleaned}"` : cleaned;
      };
      const lines = [headers.join(",")];
      for (const r of rows) {
        const actor = r.user_id
          ? (profileMap[r.user_id]?.full_name || profileMap[r.user_id]?.email || r.user_id)
          : "system";
        lines.push([
          esc(r.created_at),
          esc(actor),
          esc(r.action),
          esc(r.entity_type),
          esc(r.entity_id),
          esc(r.ip_address),
          esc(r.details),
        ].join(","));
      }
      // UTF-8 BOM so Excel-ZA opens the file as UTF-8 instead of
      // Latin-1 (same fix as the financial snapshot / calendar exports).
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = toLocalISO(new Date());
      a.download = `audit_logs_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("[audit-logs] export failed:", e);
      // Silent-failure audit: the button just stopped spinning with
      // no file and no explanation.
      toast({
        title: "Export failed",
        description: e?.message || "The CSV couldn't be generated. Try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Head><title>Audit logs - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Audit logs"
            icon={ScrollText}
            subtitle="Append-only trail of meaningful actions across orders, quotes, payments, shifts and more. Read-only - mutations belong on the per-entity pages."
            meta={
              <>
                {!loading && !loadError && totalCount != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {totalCount.toLocaleString()} matching row{totalCount === 1 ? "" : "s"}
                  </span>
                )}
                {oldestEntryAt && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90">
                    {Math.max(0, Math.floor((Date.now() - new Date(oldestEntryAt).getTime()) / (24 * 60 * 60 * 1000)))} days of history
                  </span>
                )}
              </>
            }
            actions={
            <>
              <Button
                onClick={exportCsv}
                variant="outline"
                size="sm"
                disabled={exporting || loading || (totalCount ?? 0) === 0}
                title="Export the currently filtered set as CSV (capped at 5000 rows)"
              >
                <Download className="w-4 h-4 mr-2" />
                {exporting ? "Exporting..." : "Export CSV"}
              </Button>
              <Button
                onClick={() => {
                  // If we're already on page 1 the effect won't refire,
                  // so call load() directly. When paging back, setPage
                  // alone triggers the reload - calling load() as well
                  // used to race a stale-page query against the fresh one.
                  if (page === 0) void load();
                  else setPage(0);
                }}
                variant="outline"
                size="sm"
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </>
            }
          />
          <PageWorkbench />

          {/* Command-centre stat band: exact filtered count from the
              server plus page-level aggregates. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatTile
              label="Matching rows"
              icon={ScrollText}
              value={loading ? "..." : (totalCount != null ? totalCount.toLocaleString() : "0")}
              hint="Rows matching the current filters"
            />
            <StatTile
              label="History retained"
              icon={CalendarClock}
              value={historyDays != null ? `${historyDays}d` : "..."}
              hint={oldestEntryAt ? `Earliest entry ${fmtTs(oldestEntryAt)}` : "No entries on file yet"}
            />
            <StatTile
              label="Actors on page"
              icon={Users}
              value={loading ? "..." : pageStats.actors}
              hint="Distinct users behind the rows shown"
            />
            <StatTile
              label="Flagged on page"
              icon={AlertTriangle}
              value={loading ? "..." : pageStats.flagged}
              hint="Failures, refunds, cancellations, deletions"
            />
          </div>

          <div className="space-y-6">
            {loadError && (
              <div className="rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-bold text-rose-900 mb-1">Could not load audit logs</h2>
                <p className="text-sm text-slate-600 mb-3">{loadError}</p>
                <Button onClick={() => void load()} size="sm" className="bg-brand-primary hover:bg-brand-primary/90">
                  <RefreshCw className="w-4 h-4 mr-2" /> Retry
                </Button>
              </div>
            )}
            {detailsScanCapped && !loading && !loadError && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
                <p>
                  Details search scanned the newest {DETAILS_SCAN_CAP.toLocaleString()} rows matching your
                  other filters. Older matches may be missing - narrow the time window or add an action or
                  entity filter for full coverage.
                </p>
              </div>
            )}

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
                {/* Phase 18 #9: quick entity-type chips. The dropdown
                    still owns the long tail; these chips give one-tap
                    access to the entity types operators reach for
                    repeatedly (order/quote/payment/refund). */}
                {/* Wave 67.6 - POPIA quick filter. POPIA Section 11 +
                    Subject Access Request (SAR) replies need the
                    operator to surface "every read of this data
                    subject's PII" on demand. One click pre-fills
                    action=pii_access and clears the entity filter
                    so the operator can scope-by-entity from there
                    using the existing filter. */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500 mr-1">POPIA:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActionFilter("pii_access");
                      setEntityTypeFilter("all");
                      setPage(0);
                    }}
                    className={`inline-flex items-center rounded-full text-xs px-2.5 py-0.5 border transition ${
                      actionFilter === "pii_access"
                        ? "border-slate-700 bg-slate-900 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400 hover:text-slate-900"
                    }`}
                    title="Filter to PII access events - who viewed contact details, financial info, etc. Required for POPIA Subject Access Requests."
                  >
                    PII access only
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500 mr-1">Quick filter:</span>
                  {([
                    { v: "all", label: "All" },
                    { v: "order", label: "Orders" },
                    { v: "orders", label: "Order batches" },
                    { v: "quote", label: "Quotes" },
                    { v: "invoice", label: "Invoices" },
                    { v: "payment", label: "Payments" },
                    { v: "driver_shift", label: "Driver shifts" },
                  ] as const).map((c) => {
                    const active = entityTypeFilter === c.v;
                    return (
                      <button
                        key={c.v}
                        type="button"
                        onClick={() => { setEntityTypeFilter(c.v); setPage(0); }}
                        className={`inline-flex items-center rounded-full text-xs px-2.5 py-0.5 border transition ${
                          active
                            ? "border-slate-700 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setEntityTypeFilter("payment");
                      setActionFilter("refund");
                      setPage(0);
                    }}
                    className={`inline-flex items-center rounded-full text-xs px-2.5 py-0.5 border transition ${
                      entityTypeFilter === "payment" && actionFilter === "refund"
                        ? "border-slate-700 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                    }`}
                    title="Show refund-related payment audit rows"
                  >
                    Refunds
                  </button>
                </div>
                {/* Phase 17 #3: saved-view chips for compliance +
                    ops slices that recur. */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {savedAuditViews.map((v) => (
                    <span key={v.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700 text-xs">
                      <button
                        type="button"
                        onClick={() => applySavedAuditView(v)}
                        className="px-2.5 py-0.5 hover:underline"
                        title={`Apply: since=${v.sinceFilter}, entity=${v.entityTypeFilter}${v.actionFilter ? `, action=${v.actionFilter}` : ""}`}
                      >
                        {v.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSavedAuditView(v.id)}
                        className="pr-1.5 text-slate-500 hover:text-slate-800"
                        title="Remove this view"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={saveCurrentAuditView}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 text-slate-500 text-xs px-2.5 py-0.5 hover:border-slate-300 hover:text-slate-700"
                    title="Save the current filter combination as a named view"
                  >
                    + Save view
                  </button>
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
                  // Skeleton keeps the shell + rail in place while rows load.
                  <div className="space-y-2 py-2" aria-busy="true" aria-label="Loading audit rows">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-16 animate-pulse rounded-md border border-slate-200 bg-slate-100/80 dark:border-slate-800 dark:bg-slate-800/50"
                      />
                    ))}
                  </div>
                ) : loadError ? (
                  <div className="text-center py-16 text-slate-500 text-sm">
                    The audit trail could not be fetched. Use Retry above.
                  </div>
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
                              <button
                                type="button"
                                onClick={async () => {
                                  // Phase 21 #5: click-to-copy full
                                  // entity_id. Support and DB
                                  // debugging regularly want the full
                                  // UUID, not the truncated preview.
                                  const id = String(r.entity_id);
                                  try {
                                    await navigator.clipboard.writeText(id);
                                    toast({ title: "Copied", description: `${id.slice(0, 8)}... on clipboard.` });
                                  } catch {
                                    toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
                                  }
                                }}
                                className="inline-flex items-center gap-1 font-mono hover:text-slate-900 hover:underline"
                                title={`Copy full ID: ${r.entity_id}`}
                              >
                                <Copy className="w-3 h-3 opacity-60" />
                                {r.entity_id.slice(0, 8)}...
                              </button>
                            )}
                            {href && (
                              <Link href={withSlug(href)} className="text-brand-primary hover:underline inline-flex items-center gap-1">
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
        </PortalShell>
        <Footer />
      </div>
    </>
  );
}

export default function AdminAuditLogsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <CompanyAuditLogsViewer />
    </ProtectedRoute>
  );
}
