import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChefHat,
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar,
  Users,
  Package,
  TrendingUp,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";

interface Order {
  id: string;
  client_name: string;
  guest_count: number;
  event_date: string;
  status: string;
  menu_items?: string[];
}

export default function KitchenDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock orders data
    const mockOrders: Order[] = [
      {
        id: "ORD-001",
        client_name: "Sarah Johnson",
        guest_count: 150,
        event_date: new Date().toISOString().split("T")[0],
        status: "preparing",
        menu_items: ["Beef Wellington", "Roasted Chicken", "Vegetarian Pasta"],
      },
      {
        id: "ORD-002",
        client_name: "Corporate Event",
        guest_count: 200,
        event_date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        status: "confirmed",
        menu_items: ["BBQ Platter", "Greek Salad", "Dessert Selection"],
      },
      {
        id: "ORD-003",
        client_name: "Wedding Reception",
        guest_count: 180,
        event_date: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
        status: "confirmed",
        menu_items: ["3-Course Meal", "Canapés", "Wedding Cake"],
      },
    ];

    setOrders(mockOrders);
    setLoading(false);
  }, []);

  const todayOrders = orders.filter(
    (o) => o.event_date === new Date().toISOString().split("T")[0]
  );

  const getStatusColor = (status: string) => {
    const colors = {
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-orange-100 text-orange-800",
      ready: "bg-green-100 text-green-800",
      completed: "bg-slate-100 text-slate-800",
    };
    return colors[status as keyof typeof colors] || colors.confirmed;
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Kitchen Dashboard - CateringMS</title>
      </Head>

      <KitchenNav />

      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-6 md:py-8 lg:py-12 max-w-7xl">
          {/* Header - Mobile Optimized */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-8">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <ChefHat className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Kitchen Dashboard</h1>
              <p className="text-sm md:text-base text-slate-600">Manage orders and prep schedules</p>
            </div>
          </div>

          {/* Today's Production Priority - NEW */}
          {todayOrders.length > 0 && (
            <Card className="border-0 shadow-lg bg-gradient-to-r from-orange-50 to-red-50 mb-8">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-orange-600" />
                  Today's Production Priority
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {todayOrders.slice(0, 3).map((order, index) => {
                    const hoursUntilEvent = Math.floor(
                      (new Date(order.event_date).getTime() - new Date().getTime()) / (1000 * 60 * 60)
                    );
                    const urgency = hoursUntilEvent < 4 ? 'high' : hoursUntilEvent < 8 ? 'medium' : 'low';
                    const urgencyColors = {
                      high: 'border-red-500 bg-red-50',
                      medium: 'border-orange-500 bg-orange-50',
                      low: 'border-green-500 bg-green-50'
                    };

                    return (
                      <div key={order.id} className={`flex items-center justify-between p-3 rounded-lg border-l-4 ${urgencyColors[urgency]}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{order.client_name}</p>
                            <p className="text-xs text-slate-600">{order.guest_count} guests • {hoursUntilEvent}h until event</p>
                          </div>
                        </div>
                        <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Prep Progress Tracker - NEW */}
          <Card className="border-0 shadow-lg mb-8">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Today's Prep Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">Orders Ready</span>
                    <span className="text-sm font-bold text-slate-900">
                      {orders.filter(o => o.status === 'ready').length} / {todayOrders.length}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3">
                    <div 
                      className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all"
                      style={{ 
                        width: `${todayOrders.length > 0 ? (orders.filter(o => o.status === 'ready').length / todayOrders.length * 100) : 0}%` 
                      }}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600">
                      {orders.filter(o => o.status === 'preparing').length}
                    </p>
                    <p className="text-xs text-slate-600">In Progress</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">
                      {orders.filter(o => o.status === 'ready').length}
                    </p>
                    <p className="text-xs text-slate-600">Ready</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">
                      {orders.filter(o => o.status === 'confirmed').length}
                    </p>
                    <p className="text-xs text-slate-600">Pending</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Today's Orders</p>
                    <p className="text-xl md:text-2xl font-bold text-slate-900">{todayOrders.length}</p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-orange-100 flex items-center justify-center self-end md:self-auto">
                    <Calendar className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Total Guests</p>
                    <p className="text-xl md:text-2xl font-bold text-slate-900">
                      {todayOrders.reduce((sum, o) => sum + o.guest_count, 0)}
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-blue-100 flex items-center justify-center self-end md:self-auto">
                    <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">In Progress</p>
                    <p className="text-xl md:text-2xl font-bold text-orange-600">
                      {orders.filter(o => o.status === 'preparing').length}
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-orange-100 flex items-center justify-center self-end md:self-auto">
                    <Clock className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Completed</p>
                    <p className="text-xl md:text-2xl font-bold text-green-600">
                      {orders.filter(o => o.status === 'ready').length}
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-green-100 flex items-center justify-center self-end md:self-auto">
                    <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Orders List */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="px-4 md:px-6">
              <CardTitle className="text-lg md:text-xl">Active Orders</CardTitle>
            </CardHeader>
            <CardContent className="px-4 md:px-6">
              <div className="space-y-3">
                {loading ? (
                  <div className="text-center py-8 text-slate-600">Loading orders...</div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-8 text-slate-600">No active orders</div>
                ) : (
                  orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 md:p-4 rounded-lg border-2 border-slate-200 hover:border-orange-300 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h4 className="font-semibold text-sm md:text-base text-slate-900">
                            {order.client_name}
                          </h4>
                          <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                        </div>
                        <div className="space-y-1 text-xs md:text-sm text-slate-600">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{order.guest_count} guests</span>
                            <span className="hidden sm:inline">•</span>
                            <span>Event: {new Date(order.event_date).toLocaleDateString()}</span>
                          </div>
                          {order.menu_items && (
                            <p className="text-xs text-slate-500 italic">
                              {order.menu_items.join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex sm:flex-col gap-2 self-end sm:self-center">
                        <Button size="sm" variant="outline" className="flex-1 sm:flex-none">
                          View Details
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      {/* AI Chatbot */}
      <ChatBot userRole="kitchen" companyId={user?.user_metadata?.company_id} />
    </>
  );
}