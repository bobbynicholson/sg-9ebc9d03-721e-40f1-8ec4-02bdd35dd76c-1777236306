/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Truck, MapPin, Calendar, CheckCircle2, Clock, Package, Loader2,
} from "lucide-react";
import { DriverNav } from "@/components/navigation/DriverNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface DriverOrder {
  id: string;
  event_date: string;
  event_time?: string;
  venue_address: string;
  guest_count: number;
  status: string;
  delivery_status?: string | null;
  total_amount: number | null;
  client_name?: string | null;
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    delivered: "bg-emerald-100 text-emerald-700 border-emerald-200",
    completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    in_transit: "bg-blue-100 text-blue-700 border-blue-200",
    ready: "bg-purple-100 text-purple-700 border-purple-200",
    confirmed: "bg-amber-100 text-amber-700 border-amber-200",
    preparing: "bg-orange-100 text-orange-700 border-orange-200",
    cancelled: "bg-red-100 text-red-700 border-red-200",
  };
  return map[status] || "bg-slate-100 text-slate-700 border-slate-200";
};

export default function DriverDeliveriesPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("id, event_date, event_time, venue_address, guest_count, status, delivery_status, total_amount, client_name")
        .or(`assigned_driver_id.eq.${user.id},driver_id.eq.${user.id}`)
        .order("event_date", { ascending: false });
      if (!cancelled) {
        if (error) console.error("Error loading deliveries:", error);
        setOrders((data || []) as DriverOrder[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const stats = useMemo(() => {
    const now = new Date();
    const upcoming = orders.filter((o) => new Date(o.event_date) >= new Date(now.toDateString()) && o.status !== "completed" && o.status !== "delivered" && o.status !== "cancelled");
    const completed = orders.filter((o) => o.status === "completed" || o.status === "delivered");
    const totalGuests = orders.reduce((s, o) => s + (o.guest_count || 0), 0);
    return { total: orders.length, upcoming: upcoming.length, completed: completed.length, totalGuests };
  }, [orders]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>All Deliveries - Driver Portal</title></Head>
      <DriverNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        <div className="container mx-auto px-4 py-8 max-w-screen-2xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">My Deliveries</h1>
              <p className="text-slate-600 mt-1">Every order assigned to you, past and upcoming</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <MiniStat label="All deliveries" value={stats.total} icon={Truck} accent="text-slate-900" />
            <MiniStat label="Upcoming" value={stats.upcoming} icon={Clock} accent="text-amber-600" />
            <MiniStat label="Completed" value={stats.completed} icon={CheckCircle2} accent="text-emerald-600" />
            <MiniStat label="Total guests served" value={stats.totalGuests} icon={Package} accent="text-blue-600" />
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Delivery History</CardTitle>
              <CardDescription>Newest first</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-12 flex items-center justify-center text-slate-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading deliveries...
                </div>
              ) : (
                <Tabs defaultValue="all">
                  <TabsList className="mb-4">
                    <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
                    <TabsTrigger value="upcoming">Upcoming ({stats.upcoming})</TabsTrigger>
                    <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="all">
                    <DeliveryList orders={orders} />
                  </TabsContent>
                  <TabsContent value="upcoming">
                    <DeliveryList orders={orders.filter((o) => new Date(o.event_date) >= new Date(new Date().toDateString()) && !["completed","delivered","cancelled"].includes(o.status))} />
                  </TabsContent>
                  <TabsContent value="completed">
                    <DeliveryList orders={orders.filter((o) => ["completed","delivered"].includes(o.status))} />
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    </>
  );
}

function MiniStat({
  label, value, icon: Icon, accent,
}: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; accent: string }) {
  return (
    <Card className="border-0 shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <Icon className="w-4 h-4 text-slate-400" />
        </div>
        <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function DeliveryList({ orders }: { orders: DriverOrder[] }) {
  if (orders.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500">
        <Truck className="w-10 h-10 mx-auto text-slate-300 mb-3" />
        No deliveries here yet.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div key={o.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-lg border bg-white hover:shadow-md transition-shadow">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge className={`border ${statusBadge(o.status)}`}>{o.status}</Badge>
              <span className="text-sm text-slate-500">
                <Calendar className="inline w-3.5 h-3.5 mr-1" />
                {new Date(o.event_date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                {o.event_time ? ` · ${o.event_time}` : ""}
              </span>
            </div>
            <p className="font-semibold text-slate-900 truncate">{o.client_name || "Order"}</p>
            <p className="text-sm text-slate-600 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span className="truncate">{o.venue_address}</span>
            </p>
          </div>
          <div className="flex md:flex-col items-end gap-3 md:gap-1 md:text-right">
            <span className="text-sm text-slate-500">{o.guest_count} pax</span>
            <span className="font-semibold text-slate-900">
              R{Number(o.total_amount || 0).toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
