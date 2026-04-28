import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar,
  Users,
  ChefHat,
  Truck,
  Package,
  TrendingUp,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Header } from "@/components/Header";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { DynamicNav } from "@/components/DynamicNav";

interface JobProgress {
  id: string;
  orderName: string;
  eventDate: string;
  guestCount: number;
  kitchenStatus: "pending" | "preparing" | "ready";
  driverStatus: "pending" | "assigned" | "completed";
  overallProgress: number;
}

export default function StaffJobProgress() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock job data
    const mockJobs: JobProgress[] = [
      {
        id: "JOB-001",
        orderName: "Sarah Johnson Event",
        eventDate: new Date().toISOString().split("T")[0],
        guestCount: 150,
        kitchenStatus: "preparing",
        driverStatus: "assigned",
        overallProgress: 60,
      },
      {
        id: "JOB-002",
        orderName: "Corporate Event",
        eventDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        guestCount: 200,
        kitchenStatus: "ready",
        driverStatus: "pending",
        overallProgress: 75,
      },
      {
        id: "JOB-003",
        orderName: "Wedding Reception",
        eventDate: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
        guestCount: 180,
        kitchenStatus: "pending",
        driverStatus: "pending",
        overallProgress: 25,
      },
    ];

    setJobs(mockJobs);
    setLoading(false);
  }, []);

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
              <h1 className="text-3xl font-bold text-slate-900">Job Progress Overview</h1>
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
                        <CardTitle className="text-xl">{job.orderName}</CardTitle>
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
                        <span className="text-sm font-medium text-slate-700">Overall Progress</span>
                        <span className="text-sm font-bold text-slate-900">{job.overallProgress}%</span>
                      </div>
                      <Progress value={job.overallProgress} className="h-3" />
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 bg-gradient-to-br from-orange-50 to-red-50 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <ChefHat className="w-5 h-5 text-orange-600" />
                            <span className="font-medium text-slate-900">Kitchen Status</span>
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
                            <span className="font-medium text-slate-900">Driver Status</span>
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