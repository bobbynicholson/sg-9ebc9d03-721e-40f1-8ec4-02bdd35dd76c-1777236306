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
  Sparkles, ArrowLeft, Users, ClipboardList, Loader2, Calendar,
} from "lucide-react";

function CleaningTeamPage() {
  const { user, profile } = useAuth() as any;
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const companyId = profile?.company_id || user?.company_id;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ active: 0, jobsToday: 0 });

  // Pure gradient hero - see kitchen.tsx for rationale.

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!companyId) return;
      setLoading(true);
      try {
        const todayISO = toLocalISO(new Date());
        const [staffRes, jobsRes] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).eq("role", "cleaning_staff"),
          supabase.from("orders").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).is("deleted_at", null)
            .eq("event_date", todayISO)
            .in("status", ["completed", "ready", "in_transit"]),
        ]);
        if (!cancelled) {
          setStats({
            active: staffRes.count ?? 0,
            jobsToday: jobsRes.count ?? 0,
          });
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
