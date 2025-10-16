import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { DutyToggleWidget } from "@/components/kitchen/DutyToggleWidget";
import { OnDutyBoard } from "@/components/kitchen/OnDutyBoard";
import { TaskCompletionButtons } from "@/components/kitchen/TaskCompletionButtons";
import { ChefHat, Calendar, Clock, AlertCircle } from "lucide-react";
import { orderService } from "@/services/orderService";
import { useAuth } from "@/contexts/AuthContext";
import { Order } from "@/types";

function Dashboard() {
  const { user } = useAuth();
  const [todaysOrders, setTodaysOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadTodaysOrders();
    }
  }, [user?.id]);

  const loadTodaysOrders = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const orders = await orderService.getOrders({
        filters: {
          event_date: today,
          status: "confirmed",
        },
      });
      setTodaysOrders(orders as any);
    } catch (error) {
      console.error("Error loading today's orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const upcomingOrders = todaysOrders.filter(order => {
    const eventTime = new Date(`${order.event_date}T${order.event_time || "12:00"}`);
    return eventTime > new Date();
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-orange-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm mb-6">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Kitchen Portal</h1>
                <p className="text-sm text-slate-600">Manage kitchen operations and track order progress</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-sm">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </Badge>
              <RoleSwitcher variant="compact" />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 pb-8">
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <ChefHat className="h-8 w-8" />
                Kitchen Dashboard
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage your kitchen operations and track order progress
              </p>
            </div>
            <Badge variant="outline" className="text-lg px-4 py-2">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Badge>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <DutyToggleWidget />

              {loading ? (
                <Card>
                  <CardContent className="py-8">
                    <p className="text-center text-muted-foreground">Loading orders...</p>
                  </CardContent>
                </Card>
              ) : todaysOrders.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-lg font-semibold">No orders for today</p>
                    <p className="text-sm text-muted-foreground">
                      Enjoy your day off!
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Total Orders Today
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">{todaysOrders.length}</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Upcoming
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">{upcomingOrders.length}</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <ChefHat className="h-4 w-4" />
                          Total Guests
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">
                          {todaysOrders.reduce((sum, order) => sum + (order.guest_count || 0), 0)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      Today's Orders - Task Completion
                    </h2>
                    {todaysOrders.map((order) => (
                      <TaskCompletionButtons
                        key={order.id}
                        orderId={order.id}
                        orderNumber={order.order_number || ""}
                        clientName={order.client_name || ""}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-6">
              <OnDutyBoard />

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Tips</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-semibold text-blue-900 mb-1">
                      🎯 Always Start Duty First
                    </p>
                    <p className="text-xs text-blue-700">
                      Click "Start Duty" before completing any tasks so admin can track who did what
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-semibold text-green-900 mb-1">
                      ✅ Mark Tasks as Complete
                    </p>
                    <p className="text-xs text-green-700">
                      Click each task button when ready - this helps drivers know when to collect
                    </p>
                  </div>
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-sm font-semibold text-purple-900 mb-1">
                      👥 Team Accountability
                    </p>
                    <p className="text-xs text-purple-700">
                      Your actions are logged to help improve processes and training
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
