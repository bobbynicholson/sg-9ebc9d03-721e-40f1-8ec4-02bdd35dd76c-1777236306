/**
 * Shopping team landing - the team-level snapshot for procurement.
 * The hub at /admin/teams used to bounce Shopping straight to
 * /admin/shopping (the ops page) which broke the IA pattern - every
 * other team had a snapshot page. TMS-D (task #206, 2026-05-24)
 * gives Shopping the same shape.
 *
 * Pulls: active shopping-staff headcount, today's shopping_lists
 * count, overdue list count, today's spend (finance-gated), top
 * lists by ZAR or alphabetical for quick triage. Routes through
 * /admin/shopping when the operator wants to act.
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { canAccessFinance } from "@/lib/authGuards";
import { captureException } from "@/lib/observability";
import {
  ShoppingBag, ArrowLeft, Users, ClipboardList, AlertTriangle,
  Receipt, Truck, TrendingDown,
} from "lucide-react";
import { PageWorkbench, PortalHeader, PortalShell, StatTile } from "@/components/portal/ui";
import { teamBucketsForUser } from "@/lib/teamRoleBuckets";

interface ShoppingStats {
  active: number;
  listsToday: number;
  overdueLists: number;
  receiptsThisWeek: number;
  spendToday: number;
  topVendorThisMonth: { vendor: string; spend: number } | null;
}

function ShoppingTeamPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { user, profile } = useAuth() as any;
  const { withSlug } = useTenantHref();
  const companyId = profile?.company_id || user?.company_id;
  const userRole = (profile?.active_role || profile?.role) as UserRole | undefined;
  const canSeeFinance = userRole ? canAccessFinance(userRole) : false;
  const tenantCurrency = useTenantCurrency(companyId);

  const [loading, setLoading] = useState(true);
  // Command-centre audit (2026-07-02): visible error state + Retry.
  // captureException alone left the page rendering zeros on failure.
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [stats, setStats] = useState<ShoppingStats>({
    active: 0, listsToday: 0, overdueLists: 0, receiptsThisWeek: 0,
    spendToday: 0, topVendorThisMonth: null,
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!companyId) return;
      setLoading(true);
      setError(null);
      try {
        const todayISO = toLocalISO(new Date());
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthStartISO = toLocalISO(monthStart);
        const weekAgoISO = toLocalISO(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

        const [staffRes, listsTodayRes, overdueRes, receiptsRes, monthReceiptsRes] = await Promise.all([
          // Command-centre audit (2026-07-02): count the shopping team
          // through the same role + active_role + user_departments
          // buckets the hub uses. The old role='shopping_staff' count
          // missed cross-trained staff and disagreed with /admin/teams.
          supabase.from("profiles")
            .select("id, role, active_role, is_active")
            .eq("company_id", companyId),
          supabase.from("shopping_lists")
            .select("id, actual_total, estimated_total")
            .eq("company_id", companyId)
            .eq("list_date", todayISO),
          // Command-centre audit (2026-07-02): overdue = past date and
          // NOT finished. The old .in("status",["pending","draft"])
          // filter missed lists sitting in in_progress / shopping (the
          // exact states the stale-list cron chases), so the overdue
          // count under-reported. "draft" is not a status the app ever
          // writes. Filter now matches CatalogueOperationsStrip +
          // CashflowForecastCard: anything not completed or cancelled.
          supabase.from("shopping_lists")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .lt("list_date", todayISO)
            .not("status", "in", "(completed,cancelled,canceled)"),
          supabase.from("purchase_receipts")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .gte("receipt_date", weekAgoISO),
          // Top vendor this month from purchase_receipts. supplier
          // string field is the cheapest aggregation surface (we
          // also have supplier_id but vendor text is universally
          // present).
          supabase.from("purchase_receipts")
            .select("vendor, total")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .gte("receipt_date", monthStartISO),
        ]);
        if (cancelled) return;
        // Command-centre audit (2026-07-02): surface partial Promise.all
        // failures. A single failed query used to read as empty data.
        for (const res of [staffRes, listsTodayRes, overdueRes, receiptsRes, monthReceiptsRes]) {
          if (res.error) throw new Error(res.error.message || "Query failed");
        }

        // Resolve the shopping bucket the same way the hub does.
        const staffProfileRows = ((staffRes.data || []) as Array<{
          id: string; role: string | null; active_role: string | null; is_active?: boolean | null;
        }>).filter((p) => p.is_active !== false);
        const staffProfileIds = staffProfileRows.map((p) => p.id).filter(Boolean);
        const departmentsRes = staffProfileIds.length > 0
          ? await supabase
              .from("user_departments")
              .select("user_id, department, is_primary")
              .in("user_id", staffProfileIds)
          : { data: [] as Array<{ user_id: string | null; department: string | null; is_primary: boolean | null }>, error: null };
        if (departmentsRes.error) throw new Error(departmentsRes.error.message || "Query failed");
        if (cancelled) return;
        const activeShoppingTeamCount = staffProfileRows.filter((p) =>
          teamBucketsForUser(p, departmentsRes.data || []).has("shopping"),
        ).length;

        const lists = (listsTodayRes.data || []) as Array<{ actual_total: number | null; estimated_total: number | null }>;
        let spendToday = 0;
        for (const l of lists) {
          const a = Number(l.actual_total || 0);
          const e = Number(l.estimated_total || 0);
          spendToday += a > 0 ? a : e;
        }
        // Top vendor rollup.
        const vendorTotals = new Map<string, number>();
        for (const r of (monthReceiptsRes.data || []) as Array<{ vendor: string | null; total: number | null }>) {
          const v = (r.vendor || "Unknown").trim() || "Unknown";
          vendorTotals.set(v, (vendorTotals.get(v) || 0) + Number(r.total || 0));
        }
        // Skip the top-vendor card when nothing has a positive spend -
        // a "top vendor" at R0 is noise.
        const topVendor = Array.from(vendorTotals.entries())
          .sort(([, a], [, b]) => b - a)[0];
        setStats({
          active: activeShoppingTeamCount,
          listsToday: lists.length,
          overdueLists: overdueRes.count ?? 0,
          receiptsThisWeek: receiptsRes.count ?? 0,
          spendToday,
          topVendorThisMonth: topVendor && topVendor[1] > 0
            ? { vendor: topVendor[0], spend: topVendor[1] }
            : null,
        });
      } catch (e) {
        captureException(e, { tags: { route: "/admin/teams/shopping", step: "load", companyId: companyId || "" } });
        if (!cancelled) setError(e instanceof Error ? e.message : "Check your connection and retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [companyId, reloadTick]);

  const tiles = [
    {
      href: "/admin/shopping",
      icon: ClipboardList,
      label: "Buy-now list",
      sub: "Items the kitchen needs today",
      iconColor: "text-brand-primary",
    },
    {
      href: "/admin/shopping?tab=receipts",
      icon: Receipt,
      label: "Receipts log",
      sub: "Snap a slip, log a spend",
      iconColor: "text-brand-primary",
    },
    {
      href: "/admin/suppliers",
      icon: Truck,
      label: "Suppliers",
      sub: "Contacts and price intel",
      iconColor: "text-sky-600",
    },
    {
      href: "/admin/staff?department=shopping",
      icon: Users,
      label: "Shopping staff",
      sub: "Roster and rates",
      iconColor: "text-slate-600",
    },
  ];

  return (
    <>
      <NoIndexMeta />
      <Head><title>Shopping team - CateringMS</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Shopping"
            icon={ShoppingBag}
            subtitle="Procurement, receipts and supplier ops."
            meta={
              !loading && !error ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {stats.listsToday} list{stats.listsToday === 1 ? "" : "s"} today
                  </span>
                  {stats.overdueLists > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                      {stats.overdueLists} overdue
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {stats.receiptsThisWeek} slip{stats.receiptsThisWeek === 1 ? "" : "s"} this week
                  </span>
                </>
              ) : undefined
            }
            actions={
              <Link href={withSlug("/admin/teams")}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> All teams
                </Button>
              </Link>
            }
          />
          <PageWorkbench />

          {/* Command-centre audit (2026-07-02): visible load-failure
              state with Retry. captureException alone left the chips
              rendering zeros. */}
          {!loading && error && (
            <Card className="mb-4 border-rose-200 bg-rose-50 shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 px-4">
                <div className="flex items-center gap-2 text-sm text-rose-800">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Could not load shopping metrics: {error}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReloadTick((n) => n + 1)}
                  className="border-rose-300 text-rose-800 hover:bg-rose-100"
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Command-centre restructure (2026-07-02): the loose Badge
              chip row is now a proper StatTile grid. Loading renders a
              skeleton inside the shell so the rail never disappears. */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200/90 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatTile
                label="Active staff"
                value={stats.active}
                icon={Users}
                hint="Shopping-bucket team members"
              />
              <StatTile
                label="Lists today"
                value={stats.listsToday}
                icon={ClipboardList}
                hint={canSeeFinance && stats.spendToday > 0
                  ? `${tenantCurrency.format(stats.spendToday)} spend logged today`
                  : "Lists dated today"}
              />
              <StatTile
                label="Overdue lists"
                value={stats.overdueLists > 0
                  ? <span className="text-rose-600">{stats.overdueLists}</span>
                  : stats.overdueLists}
                icon={AlertTriangle}
                hint={stats.overdueLists > 0 ? "Past their date, not finished" : "Everything on schedule"}
              />
              <StatTile
                label="Slips this week"
                value={stats.receiptsThisWeek}
                icon={Receipt}
                hint="Receipts logged, last 7 days"
              />
            </div>
          )}

          {/* TMS-D: top-vendor card + overdue callout. Operator's
              two daily questions: who am I spending most with and
              which lists are slipping. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
            {canSeeFinance && stats.topVendorThisMonth && (
              <Link href={withSlug(`/admin/suppliers?q=${encodeURIComponent(stats.topVendorThisMonth.vendor)}`)}>
                <Card className="border border-brand-primary/20 bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 shadow-sm transition-colors hover:border-brand-primary/40">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <TrendingDown className="w-6 h-6 text-brand-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          Top vendor this month: {stats.topVendorThisMonth.vendor}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                          {tenantCurrency.format(stats.topVendorThisMonth.spend)} from logged receipts. Tap to negotiate.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
            {/* Shopping LISTS live on the team-portal orders surface;
                /admin/shopping has no list view and ignored the old
                ?filter=overdue param, so the CTA landed on groceries. */}
            <Link href={withSlug("/team-portal/shopping/orders")}>
              <Card className={`border shadow-sm transition-colors hover:border-slate-300 ${stats.overdueLists > 0 ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-6 h-6 ${stats.overdueLists > 0 ? "text-rose-600" : "text-slate-400"} flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {stats.overdueLists === 0
                          ? "All lists on schedule"
                          : `${stats.overdueLists} overdue list${stats.overdueLists === 1 ? "" : "s"}`}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {stats.overdueLists === 0
                          ? "Yesterday and earlier - nothing pending."
                          : "Past their date, not finished. Tap to chase."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {tiles.map((t) => (
              <Link key={t.label} href={withSlug(t.href)}>
                <Card className="border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <t.icon className={`w-6 h-6 ${t.iconColor} flex-shrink-0`} />
                      <div>
                        <p className="font-semibold text-slate-900">{t.label}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{t.sub}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </PortalShell>
      </div>
    </>
  );
}

export default function AdminShoppingTeamPage() {
  return (
    // TMS-D (task #206, 2026-05-24): OWNER admitted alongside the
    // existing admins so the finance chip is visible to its main
    // consumer. Pattern matches every other team landing post-#204.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN]}>
      <ShoppingTeamPage />
    </ProtectedRoute>
  );
}
