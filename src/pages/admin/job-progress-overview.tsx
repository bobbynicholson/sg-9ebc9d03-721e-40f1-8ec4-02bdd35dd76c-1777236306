import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  TrendingUp,
  Package,
  User,
  Calendar,
  ArrowLeft
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { orderService } from "@/services/orderService";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import Head from "next/head";

export default function ProtectedJobProgressOverviewPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <JobProgressOverviewPage />
    </ProtectedRoute>
  );
}

function JobProgressOverviewPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadOrders();
    }
  }, [user]);

  const loadOrders = async () => {
    if (!user?.company_id) return;
    try {
      setLoading(true);
      const data = await orderService.getAllOrders(user.company_id);
      setOrders(data || []);
    } catch (error) {
      console.error("Error loading orders:", error);
      // Fallback to empty array on error
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const getProgressPercentage = (order: any) => {
    const stages = ['confirmed', 'preparing', 'ready', 'in_progress', 'delivered'];
    const currentIndex = stages.indexOf(order.status);
    return ((currentIndex + 1) / stages.length) * 100;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'pending': 'bg-slate-100 text-slate-800',
      'confirmed': 'bg-blue-100 text-blue-800',
      'preparing': 'bg-orange-100 text-orange-800',
      'ready': 'bg-purple-100 text-purple-800',
      'in_progress': 'bg-indigo-100 text-indigo-800',
      'delivered': 'bg-green-100 text-green-800',
      'cancelled': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-slate-100 text-slate-800';
  };

  const activeJobs = orders.filter(o => 
    ['confirmed', 'preparing', 'ready', 'in_progress'].includes(o.status)
  );

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Job Progress Overview | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-64">
        <div className="container mx-auto px-4 py-8 max-w-screen-2xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Job Progress Overview</h1>
            <p className="text-slate-600">Monitor all active jobs and their progress in real-time</p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-slate-600 mt-4">Loading jobs...</p>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <Card className="border-0 shadow-lg">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Active Jobs</p>
                        <p className="text-2xl font-bold text-slate-900">{activeJobs.length}</p>
                      </div>
                      <Package className="w-10 h-10 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Confirmed</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {orders.filter(o => o.status === 'confirmed').length}
                        </p>
                      </div>
                      <Clock className="w-10 h-10 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">In Progress</p>
                        <p className="text-2xl font-bold text-orange-600">
                          {orders.filter(o => ['preparing', 'ready', 'in_progress'].includes(o.status)).length}
                        </p>
                      </div>
                      <AlertCircle className="w-10 h-10 text-orange-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Delivered</p>
                        <p className="text-2xl font-bold text-green-600">
                          {orders.filter(o => o.status === 'delivered').length}
                        </p>
                      </div>
                      <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Active Jobs List */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Active Jobs ({activeJobs.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {activeJobs.length === 0 ? (
                    <div className="text-center py-8 text-slate-600">
                      No active jobs
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activeJobs.map((order) => (
                        <div key={order.id} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-semibold text-slate-900">
                                Order #{order.id.slice(0, 8)}
                              </h3>
                              <p className="text-sm text-slate-600">
                                {order.venue_address}
                              </p>
                              <p className="text-xs text-slate-500">
                                Event: {new Date(order.event_date).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge className={getStatusColor(order.status)}>
                              {order.status}
                            </Badge>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-600">Progress</span>
                              <span className="font-semibold text-slate-900">
                                {getProgressPercentage(order).toFixed(0)}%
                              </span>
                            </div>
                            <Progress value={getProgressPercentage(order)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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