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
import { Badge } from "@/components/ui/badge";
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
  ShoppingBag, ArrowLeft, Users, ClipboardList, Loader2, AlertTriangle,
  Receipt, Truck, Banknote, TrendingDown,
} from "lucide-react";
import { PageWorkbench } from "@/components/portal/ui";

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
  const [stats, setStats] = useState<ShoppingStats>({
    active: 0, listsToday: 0, overdueLists: 0, receiptsThisWeek: 0,
    spendToday: 0, topVendorThisMonth: null,
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!companyId) return;
      setLoading(true);
      try {
        const todayISO = toLocalISO(new Date());
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthStartISO = toLocalISO(monthStart);
        const weekAgoISO = toLocalISO(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

        const [staffRes, listsTodayRes, overdueRes, receiptsRes, monthReceiptsRes] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).eq("role", "shopping_staff"),
          supabase.from("shopping_lists")
            .select("id, actual_total, estimated_total")
            .eq("company_id", companyId)
            .eq("list_date", todayISO),
          supabase.from("shopping_lists")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .lt("list_date", todayISO)
            .in("status", ["pending", "draft"]),
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
        const topVendor = Array.from(vendorTotals.entries())
          .sort(([, a], [, b]) => b - a)[0];
        setStats({
          active: staffRes.count ?? 0,
          listsToday: lists.length,
          overdueLists: overdueRes.count ?? 0,
          receiptsThisWeek: receiptsRes.count ?? 0,
          spendToday,
          topVendorThisMonth: topVendor ? { vendor: topVendor[0], spend: topVendor[1] } : null,
        });
      } catch (e) {
        captureException(e, { tags: { route: "/admin/teams/shopping", step: "load", companyId: companyId || "" } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [companyId]);

  const tiles = [
    {
      href: "/admin/shopping",
      icon: ClipboardList,
      label: "Buy-now list",
      sub: "Items the kitchen needs today",
      bg: "from-orange-50 to-rose-50",
      iconColor: "text-orange-600",
    },
    {
      href: "/admin/shopping?tab=receipts",
      icon: Receipt,
      label: "Receipts log",
      sub: "Snap a slip, log a spend",
      bg: "from-amber-50 to-orange-50",
      iconColor: "text-amber-600",
    },
    {
      href: "/admin/suppliers",
      icon: Truck,
      label: "Suppliers",
      sub: "Contacts and price intel",
      bg: "from-sky-50 to-blue-50",
      iconColor: "text-sky-600",
    },
    {
      href: "/admin/staff?department=shopping",
      icon: Users,
      label: "Shopping staff",
      sub: "Roster and rates",
      bg: "from-slate-50 to-slate-50",
      iconColor: "from-slate-50",
    },
  ];

  return (
    <>
      <NoIndexMeta />
      <Head><title>Shopping team - CateringMS</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-full">
          <PageWorkbench className="mb-5" />

          <Link href={withSlug("/admin/teams")} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 mb-3">
            <ArrowLeft className="w-4 h-4" /> All teams
          </Link>

          <div className="relative h-[200px] rounded-xl overflow-hidden mb-6 bg-gradient-to-br from-brand-primary to-brand-secondary">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />
            <div className="relative h-full flex items-end p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <ShoppingBag className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl xl:text-4xl font-bold text-white">Shopping</h1>
                  <p className="text-sm text-white/90 mt-0.5">Procurement, receipts and supplier ops.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            <Badge variant="secondary" className="px-3 py-1.5 text-sm">
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Users className="w-3 h-3 mr-1" />}
              {stats.active} active
            </Badge>
            <Badge variant="secondary" className="px-3 py-1.5 text-sm">
              <ClipboardList className="w-3 h-3 mr-1" />
              {stats.listsToday} list{stats.listsToday === 1 ? "" : "s"} today
            </Badge>
            {stats.overdueLists > 0 && (
              <Badge variant="destructive" className="px-3 py-1.5 text-sm">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {stats.overdueLists} overdue
              </Badge>
            )}
            <Badge variant="secondary" className="px-3 py-1.5 text-sm">
              <Receipt className="w-3 h-3 mr-1" />
              {stats.receiptsThisWeek} slip{stats.receiptsThisWeek === 1 ? "" : "s"} this week
            </Badge>
            {canSeeFinance && stats.spendToday > 0 && (
              <Badge variant="outline" className="px-3 py-1.5 text-sm border-brand-primary/30 text-brand-primary bg-brand-primary/10 tabular-nums">
                <Banknote className="w-3 h-3 mr-1" />
                {tenantCurrency.format(stats.spendToday)} today
              </Badge>
            )}
          </div>

          {/* TMS-D: top-vendor card + overdue callout. Operator's
              two daily questions: who am I spending most with and
              which lists are slipping. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
            {canSeeFinance && stats.topVendorThisMonth && (
              <Link href={withSlug(`/admin/suppliers?q=${encodeURIComponent(stats.topVendorThisMonth.vendor)}`)}>
                <Card className="border-0 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10">
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
            <Link href={withSlug("/admin/shopping?filter=overdue")}>
              <Card className={`border-0 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br ${stats.overdueLists > 0 ? "from-rose-50 to-amber-50" : "from-slate-50 to-slate-100"}`}>
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
                          : "Pending or draft, list_date past. Tap to chase."}
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
                <Card className={`border-0 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br ${t.bg}`}>
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
        </div>
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
