import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock, CheckCircle, AlertCircle, Calendar, Users, ChefHat, Truck, Package } from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Header } from "@/components/Header";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { DynamicNav } from "@/components/DynamicNav";
import { supabase } from "@/integrations/supabase/client";

interface JobProgress {
  id: string;
  orderName: string;
  eventDate: string;
  guestCount: number;
  kitchenStatus: "pending" | "preparing" | "ready";
  driverStatus: "pending" | "assigned" | "completed";
  overallProgress: number;
}

// Map orders.status -> per-team status surfaces. Kitchen marches
// pending -> preparing -> ready (matches orderWorkflow). Driver
// stays pending until assigned, flips to completed on delivery.
function deriveStatuses(orderStatus: string, hasDriver: boolean): {
  kitchenStatus: JobProgress["kitchenStatus"];
  driverStatus: JobProgress["driverStatus"];
  overallProgress: number;
} {
  switch (orderStatus) {
    case "confirmed":
      return { kitchenStatus: "pending", driverStatus: hasDriver ? "assigned" : "pending", overallProgress: hasDriver ? 25 : 15 };
    case "preparing":
      return { kitchenStatus: "preparing", driverStatus: hasDriver ? "assigned" : "pending", overallProgress: 50 };
    case "ready":
      return { kitchenStatus: "ready", driverStatus: hasDriver ? "assigned" : "pending", overallProgress: 70 };
    case "in_transit":
      return { kitchenStatus: "ready", driverStatus: "assigned", overallProgress: 85 };
    case "delivered":
    case "completed":
      return { kitchenStatus: "ready", driverStatus: "completed", overallProgress: 100 };
    default:
      return { kitchenStatus: "pending", driverStatus: "pending", overallProgress: 0 };
  }
}

export default function StaffJobProgress() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAhead = new Date(today);
      weekAhead.setDate(today.getDate() + 7);
      const fromISO = today.toISOString().split("T")[0];
      const toISO = weekAhead.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, client_name, event_date, guest_count, status, assigned_driver_id, driver_id")
        .eq("company_id", user.company_id)
        .gte("event_date", fromISO)
        .lte("event_date", toISO)
        .in("status", ["confirmed", "preparing", "ready", "in_transit", "delivered", "completed"])
        .order("event_date", { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error("[job-progress] load failed", error);
        setJobs([]);
      } else {
        setJobs((data || []).map((o: any) => {
          const hasDriver = !!(o.assigned_driver_id || o.driver_id);
          const { kitchenStatus, driverStatus, overallProgress } = deriveStatuses(o.status, hasDriver);
          return {
            id: o.id,
            orderName: o.client_name || o.order_number || "Order",
            eventDate: o.event_date,
            guestCount: Number(o.guest_count || 0),
            kitchenStatus,
            driverStatus,
            overallProgress,
          };
        }));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.company_id]);

  const getStatusColor = (status: string) => {
    const colors = {
      pending: "bg-slate-100 text-slate-800",
      preparing: "bg-orange-100 text-orange-800",
      assigned: "bg-blue-100 text-blue-800",
      ready: "bg-green-100 text-green-800",
      completed: "bg-green-100 text-green-800",
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 75) return "bg-green-500";
    if (progress >= 50) return "bg-blue-500";
    if (progress >= 25) return "bg-orange-500";
    return "bg-slate-300";
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Job Progress - CateringMS</title>
      </Head>

      {user && <DynamicNav userRole={user.role} />}

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 pt-20">
        <div className="px-4 py-6 md:py-8 lg:py-12 max-w-full">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                Job Progress Overview
                <InfoTooltip content="Live view of every active job with kitchen and driver progress in one place. Pulls every order in the next seven days that is confirmed or further along." />
              </h1>
              <p className="text-slate-600">Monitor all active jobs and their progress in real-time</p>
            </div>
          </div>

          <div className="grid gap-6">
            {loading ? (
              <div className="text-center py-12 text-slate-600">Loading jobs...</div>
            ) : jobs.length === 0 ? (
              <Card className="border-0 shadow-lg">
                <CardContent className="py-12 text-center">
                  <Package className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-600 font-medium">No active jobs</p>
                  <p className="text-sm text-slate-500 mt-1">Jobs will appear here when orders are confirmed</p>
                </CardContent>
              </Card>
            ) : (
              jobs.map((job) => (
                <Card key={job.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                          {job.orderName}
                          <InfoTooltip content="The client and event this job is for." />
                        </CardTitle>
                        <p className="text-sm text-slate-600 mt-1">
                          <Calendar className="w-4 h-4 inline mr-1" />
                          {new Date(job.eventDate).toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                      <Badge className="bg-blue-100 text-blue-800">
                        <Users className="w-3 h-3 mr-1" />
                        {job.guestCount} guests
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
                          Overall Progress
                          <InfoTooltip content="Overall progress for this job, blending kitchen prep and driver delivery." />
                        </span>
                        <span className="text-sm font-bold text-slate-900">{job.overallProgress}%</span>
                      </div>
                      <Progress value={job.overallProgress} className="h-3" />
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 bg-gradient-to-br from-orange-50 to-red-50 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <ChefHat className="w-5 h-5 text-orange-600" />
                            <span className="font-medium text-slate-900 flex items-center gap-1">
                              Kitchen Status
                              <InfoTooltip content="Where the kitchen is with prep: pending, preparing, or ready to go." />
                            </span>
                          </div>
                          <Badge className={getStatusColor(job.kitchenStatus)}>
                            {job.kitchenStatus}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            {job.kitchenStatus === "ready" ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : job.kitchenStatus === "preparing" ? (
                              <Clock className="w-4 h-4 text-orange-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-slate-400" />
                            )}
                            <span>
                              {job.kitchenStatus === "ready"
                                ? "Food preparation complete"
                                : job.kitchenStatus === "preparing"
                                ? "Currently preparing order"
                                : "Waiting to start preparation"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Truck className="w-5 h-5 text-blue-600" />
                            <span className="font-medium text-slate-900 flex items-center gap-1">
                              Driver Status
                              <InfoTooltip content="Where the delivery is at: pending, assigned to a driver, or completed." />
                            </span>
                          </div>
                          <Badge className={getStatusColor(job.driverStatus)}>
                            {job.driverStatus}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            {job.driverStatus === "completed" ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : job.driverStatus === "assigned" ? (
                              <Clock className="w-4 h-4 text-blue-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-slate-400" />
                            )}
                            <span>
                              {job.driverStatus === "completed"
                                ? "Delivery completed"
                                : job.driverStatus === "assigned"
                                ? "Driver assigned and ready"
                                : "Waiting for driver assignment"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button variant="outline" size="sm">
                        View Full Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        <Footer />
      </div>

      <ChatBot userRole="staff" companyId={user?.user_metadata?.company_id} />
    </>
  );
}