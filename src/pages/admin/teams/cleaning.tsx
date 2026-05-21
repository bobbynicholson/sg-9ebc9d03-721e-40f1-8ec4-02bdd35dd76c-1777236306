/**
 * Cleaning team landing - hero + quick stats + tile shortcuts.
 * No first-class cleaning task table yet; we route to /admin/staff with a
 * department filter and let the staff list do the heavy lifting.
 */
import { useEffect, useMemo, useState } from "react";
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
import { toLocalISO } from "@/lib/localDate";import { useTenantHref } from "@/lib/tenantUrl";
import {
  Sparkles, ArrowLeft, Users, ClipboardList, Loader2, Calendar, AlertTriangle, Wrench,
} from "lucide-react";

interface DamageSummary {
  thisWeek: number;
  topCategories: Array<{ category: string; count: number }>;
}

interface LowSupplySummary {
  belowPar: number;
  outOfStock: number;
}

function CleaningTeamPage() {
  const { user, profile } = useAuth() as any;
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const companyId = profile?.company_id || user?.company_id;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ active: 0, jobsToday: 0 });
  // Cleaning persona follow-up (cleaning.md 5.6): admin landing was
  // a sparse tile grid. Add damages-this-week + supplies-below-par
  // summary cards so the admin sees hygiene status without bouncing
  // through three pages to correlate.
  const [damageSummary, setDamageSummary] = useState<DamageSummary>({ thisWeek: 0, topCategories: [] });
  const [supplySummary, setSupplySummary] = useState<LowSupplySummary>({ belowPar: 0, outOfStock: 0 });

  // Pure gradient hero - see kitchen.tsx for rationale.

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!companyId) return;
      setLoading(true);
      try {
        const todayISO = toLocalISO(new Date());
        const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const [staffRes, jobsRes, damagesRes, suppliesRes] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).eq("role", "cleaning_staff"),
          supabase.from("orders").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).is("deleted_at", null)
            .eq("event_date", todayISO)
            .in("status", ["completed", "ready", "in_transit"]),
          // Damages in the last 7 days, grouped by type for the top-3.
          supabase.from("equipment_damages").select("damage_type")
            .eq("company_id", companyId)
            .gte("created_at", weekAgoISO),
          // Cleaning supplies under par. We don't filter by category
          // here because cleaning inventory is sometimes tagged as
          // "Cleaning" and sometimes by keyword; the supplies page
          // does the same loose filter. Counting all below-par on
          // the company is fine as a rough indicator.
          supabase.from("inventory_items")
            .select("current_stock, minimum_stock")
            .eq("company_id", companyId),
        ]);
        if (!cancelled) {
          setStats({
            active: staffRes.count ?? 0,
            jobsToday: jobsRes.count ?? 0,
          });
          // Damages summary.
          const damageRows = (damagesRes.data || []) as Array<{ damage_type: string | null }>;
          const counts = new Map<string, number>();
          for (const r of damageRows) {
            const k = r.damage_type || "other";
            counts.set(k, (counts.get(k) || 0) + 1);
          }
          const top = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([category, count]) => ({ category, count }));
          setDamageSummary({ thisWeek: damageRows.length, topCategories: top });
          // Low-stock summary.
          const inv = (suppliesRes.data || []) as Array<{ current_stock: number | null; minimum_stock: number | null }>;
          let belowPar = 0;
          let outOfStock = 0;
          for (const i of inv) {
            const s = Number(i.current_stock || 0);
            const m = Number(i.minimum_stock || 0);
            if (m > 0 && s <= m) belowPar += 1;
            if (s <= 0) outOfStock += 1;
          }
          setSupplySummary({ belowPar, outOfStock });
        }
      } catch (e) {
        console.error("Cleaning team load failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [companyId]);

  const tiles = [
    { href: "/admin/staff?department=cleaning", icon: Users, label: "Cleaning staff", sub: "Roster and availability", bg: "from-purple-50 to-fuchsia-50", iconColor: "text-purple-600" },
    { href: "/admin/calendar", icon: Calendar, label: "Today's events", sub: "What needs cleaning down", bg: "from-rose-50 to-pink-50", iconColor: "text-rose-600" },
  ];

  return (
    <>
      <NoIndexMeta />
      <Head><title>Cleaning team | CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <Link href={withSlug("/admin/teams")} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 mb-3">
            <ArrowLeft className="w-4 h-4" /> All teams
          </Link>

          <div className="relative h-[200px] rounded-xl overflow-hidden mb-6 bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />
            <div className="relative h-full flex items-end p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl xl:text-4xl font-serif text-white">Cleaning</h1>
                  <p className="text-sm text-white/90 mt-0.5">Wash-up, kit return and venue strike.</p>
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
              {stats.jobsToday} event{stats.jobsToday === 1 ? "" : "s"} today
            </Badge>
          </div>

          {/* Phase 6 follow-up: damages + low-supply summary cards
              so the admin sees hygiene status without bouncing
              through three pages. Each links straight to the
              detailed view. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
            <Link href={withSlug("/team-portal/cleaning/damage")}>
              <Card className={`border-0 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br ${damageSummary.thisWeek > 0 ? "from-rose-50 to-amber-50" : "from-slate-50 to-slate-100"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-6 h-6 ${damageSummary.thisWeek > 0 ? "text-rose-600" : "text-slate-400"} flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {damageSummary.thisWeek === 0 ? "No damages this week" : `${damageSummary.thisWeek} damage${damageSummary.thisWeek === 1 ? "" : "s"} this week`}
                      </p>
                      {damageSummary.topCategories.length > 0 && (
                        <p className="text-xs text-slate-600 mt-0.5 truncate">
                          Top: {damageSummary.topCategories.map((c) => `${c.category} (${c.count})`).join(", ")}
                        </p>
                      )}
                      {damageSummary.thisWeek === 0 && (
                        <p className="text-xs text-slate-500 mt-0.5">Clean week. Tap to view ledger.</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href={withSlug("/team-portal/cleaning/supplies")}>
              <Card className={`border-0 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br ${supplySummary.belowPar > 0 ? "from-amber-50 to-orange-50" : "from-slate-50 to-slate-100"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Wrench className={`w-6 h-6 ${supplySummary.belowPar > 0 ? "text-amber-600" : "text-slate-400"} flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {supplySummary.belowPar === 0 ? "Supplies on par" : `${supplySummary.belowPar} item${supplySummary.belowPar === 1 ? "" : "s"} below par`}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {supplySummary.outOfStock > 0
                          ? `${supplySummary.outOfStock} out of stock - act now`
                          : "Detergent, gloves, cloths. Tap to view."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {tiles.map((t) => (
              <Link key={t.label} href={t.href}>
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

export default function AdminCleaningTeamPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <CleaningTeamPage />
    </ProtectedRoute>
  );
}
