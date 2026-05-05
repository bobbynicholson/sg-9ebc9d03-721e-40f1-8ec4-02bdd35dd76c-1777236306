/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Drivers team landing -- hero + quick stats + tile shortcuts.
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
  Truck, ArrowLeft, Users, Clock, ClipboardList, Loader2,
  Receipt, Map, Car,
} from "lucide-react";

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function DriversTeamPage() {
  const { user, profile } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ active: 0, hoursWeek: 0, jobsToday: 0 });

  const heroBg = useMemo(
    () => "bg-[url('/images/teams/drivers.jpg')] bg-cover bg-center",
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!companyId) return;
      setLoading(true);
      try {
        const todayISO = new Date().toISOString().slice(0, 10);
        const weekStartISO = startOfWeek().toISOString();

        const [staffRes, weekRes, todayRes] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).eq("role", "driver"),
          supabase.from("driver_assignments").select("assigned_at, completed_at")
            .eq("company_id", companyId).gte("assigned_at", weekStartISO),
          supabase.from("driver_assignments")
            .select("id, orders!inner(event_date, company_id, deleted_at)", { count: "exact", head: true })
            .eq("company_id", companyId)
            .is("orders.deleted_at", null)
            .eq("orders.event_date", todayISO),
        ]);

        let hours = 0;
        for (const a of (weekRes.data || []) as any[]) {
          const s = a.assigned_at ? new Date(a.assigned_at).getTime() : 0;
          const e = a.completed_at ? new Date(a.completed_at).getTime() : 0;
          if (s && e && e > s) hours += (e - s) / 3600000;
        }
        if (!cancelled) {
          setStats({
            active: staffRes.count ?? 0,
            hoursWeek: Math.round(hours),
            jobsToday: todayRes.count ?? 0,
          });
        }
      } catch (e) {
        console.error("Drivers team load failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [companyId]);

  const tiles = [
    { href: "/admin/driver-management", icon: Users, label: "Driver management", sub: "Roster, availability, ratings", bg: "from-sky-50 to-blue-50", iconColor: "text-sky-600" },
    { href: "/admin/driver-settlement", icon: Receipt, label: "Settlement", sub: "Pay out shifts and tips", bg: "from-emerald-50 to-teal-50", iconColor: "text-emerald-600" },
    { href: "/admin/route-planning", icon: Map, label: "Route planning", sub: "Daily delivery sequencing", bg: "from-indigo-50 to-violet-50", iconColor: "text-indigo-600" },
    { href: "/admin/vehicles", icon: Car, label: "Vehicles", sub: "Fleet, services, fuel", bg: "from-slate-100 to-slate-50", iconColor: "text-slate-600" },
  ];

  return (
    <>
      <NoIndexMeta />
      <Head><title>Drivers team -- CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <Link href="/admin/teams" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 mb-3">
            <ArrowLeft className="w-4 h-4" /> All teams
          </Link>

          <div className={`relative h-[200px] rounded-xl overflow-hidden mb-6 bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600 ${heroBg}`}>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />
            <div className="relative h-full flex items-end p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl xl:text-4xl font-serif text-white">Drivers</h1>
                  <p className="text-sm text-white/90 mt-0.5">Logistics, deliveries and on-site setup.</p>
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
              <Clock className="w-3 h-3 mr-1" />
              {stats.hoursWeek}h this week
            </Badge>
            <Badge variant="secondary" className="px-3 py-1.5 text-sm">
              <ClipboardList className="w-3 h-3 mr-1" />
              {stats.jobsToday} job{stats.jobsToday === 1 ? "" : "s"} today
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

export default function AdminDriversTeamPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <DriversTeamPage />
    </ProtectedRoute>
  );
}
