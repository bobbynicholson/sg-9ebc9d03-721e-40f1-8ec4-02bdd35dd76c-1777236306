/**
 * Kitchen team landing -- hero + quick stats + tile shortcuts.
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
import {
  ChefHat, ArrowLeft, Users, Clock, ClipboardList, BookOpen, Loader2,
} from "lucide-react";

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function KitchenTeamPage() {
  const { user, profile } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ active: 0, hoursWeek: 0, jobsToday: 0 });

  // Pure gradient hero -- intentionally no /images/teams/kitchen.jpg.
  // Keeping the look simple and shippable rather than chasing a stock
  // photo that has to clear licensing and brand fit. If a tenant wants
  // a real banner, we'll add a per-company override later.

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!companyId) return;
      setLoading(true);
      try {
        const todayISO = new Date().toISOString().slice(0, 10);
        const weekStartISO = startOfWeek().toISOString();

        // Hours-this-week reads kitchen_staff_shifts (the canonical wage
        // record with standard / overtime / sunday-holiday breakdowns)
        // so the number agrees with what /admin/wages reports for the
        // same period. The duty-board table (kitchen_duty_shifts) is a
        // live-now signal, not a payroll source.
        const [staffRes, shiftsRes, jobsRes] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).eq("role", "kitchen_staff"),
          supabase.from("kitchen_staff_shifts")
            .select("standard_min, overtime_min, sunday_holiday_min")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .gte("shift_start", weekStartISO),
          supabase.from("orders").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).is("deleted_at", null)
            .eq("event_date", todayISO)
            .not("status", "in", "(cancelled,completed)"),
        ]);

        let hours = 0;
        for (const s of (shiftsRes.data || []) as any[]) {
          const mins =
            Number(s.standard_min || 0) +
            Number(s.overtime_min || 0) +
            Number(s.sunday_holiday_min || 0);
          if (mins > 0) hours += mins / 60;
        }
        if (!cancelled) {
          setStats({
            active: staffRes.count ?? 0,
            hoursWeek: Math.round(hours),
            jobsToday: jobsRes.count ?? 0,
          });
        }
      } catch (e) {
        console.error("Kitchen team load failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [companyId]);

  const tiles = [
    { href: "/admin/kitchen-staff", icon: Users, label: "Kitchen staff", sub: "Roster, rates, departments", bg: "from-amber-50 to-orange-50", iconColor: "text-amber-600" },
    { href: "/admin/kitchen-duty-tracking", icon: ClipboardList, label: "Duty tracking", sub: "Active shifts and clock-ins", bg: "from-rose-50 to-pink-50", iconColor: "text-rose-600" },
    { href: "/admin/inventory-recipes", icon: BookOpen, label: "Recipes & inventory", sub: "Link recipes to stock", bg: "from-emerald-50 to-teal-50", iconColor: "text-emerald-600" },
  ];

  return (
    <>
      <NoIndexMeta />
      <Head><title>Kitchen team | CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <Link href="/admin/teams" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 mb-3">
            <ArrowLeft className="w-4 h-4" /> All teams
          </Link>

          {/* Hero -- gradient fallback if no /public/images/teams/kitchen.jpg */}
          <div className="relative h-[200px] rounded-xl overflow-hidden mb-6 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />
            <div className="relative h-full flex items-end p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <ChefHat className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl xl:text-4xl font-serif text-white">Kitchen</h1>
                  <p className="text-sm text-white/90 mt-0.5">Prep, plating and pass-through.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Badge variant="secondary" className="px-3 py-1.5 text-sm">
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Users className="w-3 h-3 mr-1" />}
              {stats.active} active
            </Badge>
            <Badge variant="secondary" className="px-3 py-1.5 text-sm">
              <Clock className="w-3 h-3 mr-1" />
              {stats.hoursWeek}h this week
            </Badge>
            <Badge variant="secondary" className="px-3 py-1.5 text-sm">
              <ClipboardList className="w-3 h-3 mr-1" />
              {stats.jobsToday} job{stats.jobsToday === 1 ? "" : "s"} today
            </Badge>
          </div>

          {/* Tile shortcuts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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

export default function AdminKitchenTeamPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <KitchenTeamPage />
    </ProtectedRoute>
  );
}
