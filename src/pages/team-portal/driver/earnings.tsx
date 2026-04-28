/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, Clock, TrendingUp, Calendar, Wallet, CheckCircle2, Truck, Loader2,
} from "lucide-react";
import { DriverNav } from "@/components/navigation/DriverNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface WorkSession {
  id: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number | null;
  total_earnings: number | null;
  payment_status: string | null;
  session_date: string | null;
}

const formatR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);

export default function DriverEarningsPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("staff_work_sessions")
        .select("id, clock_in, clock_out, total_hours, total_earnings, payment_status, session_date")
        .eq("staff_id", user.id)
        .order("clock_in", { ascending: false });
      if (!cancelled) {
        if (error) console.error("Error loading earnings:", error);
        setSessions((data || []) as WorkSession[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthAgo = new Date(now.getTime() - 30 * 86400000);
    const sum = (rows: WorkSession[], picker: (r: WorkSession) => number = (r) => Number(r.total_earnings || 0)) =>
      rows.reduce((s, r) => s + picker(r), 0);
    const paid = sessions.filter((r) => r.payment_status === "paid");
    const unpaid = sessions.filter((r) => r.payment_status !== "paid");
    return {
      total: sum(sessions),
      paid: sum(paid),
      unpaid: sum(unpaid),
      thisWeek: sum(sessions.filter((r) => new Date(r.clock_in) > weekAgo)),
      thisMonth: sum(sessions.filter((r) => new Date(r.clock_in) > monthAgo)),
      totalHours: sum(sessions, (r) => Number(r.total_hours || 0)),
      sessionCount: sessions.length,
      paidCount: paid.length,
      unpaidCount: unpaid.length,
    };
  }, [sessions]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>My Earnings - Driver Portal</title></Head>
      <DriverNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-blue-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-4 py-8 max-w-screen-2xl">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">My Earnings</h1>
                <p className="text-slate-600 mt-1">Track your hours and pay across every shift</p>
              </div>
            </div>
          </div>

          {loading ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 flex items-center justify-center text-slate-500 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading earnings...
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard
                  label="Total earned"
                  value={formatR(stats.total)}
                  icon={DollarSign}
                  accent="from-emerald-500 to-green-600"
                  sublabel={`${stats.totalHours.toFixed(1)} hours over ${stats.sessionCount} shifts`}
                />
                <StatCard
                  label="Already paid"
                  value={formatR(stats.paid)}
                  icon={CheckCircle2}
                  accent="from-blue-500 to-indigo-600"
                  sublabel={`${stats.paidCount} paid shift${stats.paidCount === 1 ? "" : "s"}`}
                />
                <StatCard
                  label="Pending payout"
                  value={formatR(stats.unpaid)}
                  icon={Clock}
                  accent="from-amber-500 to-orange-600"
                  sublabel={`${stats.unpaidCount} shift${stats.unpaidCount === 1 ? "" : "s"} awaiting payment`}
                />
                <StatCard
                  label="Last 30 days"
                  value={formatR(stats.thisMonth)}
                  icon={TrendingUp}
                  accent="from-purple-500 to-pink-600"
                  sublabel={`${formatR(stats.thisWeek)} this week`}
                />
              </div>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    Shift History
                  </CardTitle>
                  <CardDescription>Every shift you've clocked in for, newest first</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="all">
                    <TabsList className="mb-4">
                      <TabsTrigger value="all">All ({stats.sessionCount})</TabsTrigger>
                      <TabsTrigger value="unpaid">Awaiting payment ({stats.unpaidCount})</TabsTrigger>
                      <TabsTrigger value="paid">Paid ({stats.paidCount})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="all">
                      <ShiftTable sessions={sessions} />
                    </TabsContent>
                    <TabsContent value="unpaid">
                      <ShiftTable sessions={sessions.filter((r) => r.payment_status !== "paid")} />
                    </TabsContent>
                    <TabsContent value="paid">
                      <ShiftTable sessions={sessions.filter((r) => r.payment_status === "paid")} />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}

function StatCard({
  label, value, sublabel, icon: Icon, accent,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${accent} flex items-center justify-center`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        </div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {sublabel && <p className="text-xs text-slate-500 mt-1">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}

function ShiftTable({ sessions }: { sessions: WorkSession[] }) {
  if (sessions.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500">
        <Truck className="w-10 h-10 mx-auto text-slate-300 mb-3" />
        No shifts in this view.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Date</th>
            <th className="text-left px-4 py-2 font-medium">Clock in</th>
            <th className="text-left px-4 py-2 font-medium">Clock out</th>
            <th className="text-right px-4 py-2 font-medium">Hours</th>
            <th className="text-right px-4 py-2 font-medium">Earnings</th>
            <th className="text-right px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-700">
                {s.session_date ? new Date(s.session_date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }) : "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {s.clock_in ? new Date(s.clock_in).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {s.clock_out ? new Date(s.clock_out).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : <span className="text-emerald-600 font-medium">Active</span>}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                {Number(s.total_hours || 0).toFixed(1)}h
              </td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                {formatR(Number(s.total_earnings || 0))}
              </td>
              <td className="px-4 py-3 text-right">
                {s.payment_status === "paid" ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Paid</Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">Pending</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
