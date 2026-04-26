import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShoppingCart,
  Calendar,
  TrendingUp,
  Users,
  DollarSign,
  Search,
  Filter,
  Download,
  Eye,
  Edit,
  ChevronRight,
  Clock,
  CheckCircle2,
  Package,
  Truck,
  MapPin,
  AlertCircle,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalLayout } from "@/components/Layout";
import { orderService } from "@/services/orderService";
import type { AppOrder } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";

interface OrderStats {
  total: number;
  byStatus: Record<string, number>;
  revenue: {
    total: number;
    pending: number;
    paid: number;
  };
  upcoming: number;
  inProgress: number;
}

const STATUS_CONFIG = {
  pending: { 
    label: "Pending", 
    icon: Clock, 
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    dotColor: "bg-yellow-500"
  },
  confirmed: { 
    label: "Confirmed", 
    icon: CheckCircle2, 
    color: "bg-blue-100 text-blue-800 border-blue-200",
    dotColor: "bg-blue-500"
  },
  preparing: { 
    label: "In Prep", 
    icon: Package, 
    color: "bg-purple-100 text-purple-800 border-purple-200",
    dotColor: "bg-purple-500"
  },
  ready: { 
    label: "Ready", 
    icon: CheckCircle2, 
    color: "bg-green-100 text-green-800 border-green-200",
    dotColor: "bg-green-500"
  },
  in_transit: { 
    label: "In Transit", 
    icon: Truck, 
    color: "bg-indigo-100 text-indigo-800 border-indigo-200",
    dotColor: "bg-indigo-500"
  },
  delivered: { 
    label: "Delivered", 
    icon: MapPin, 
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dotColor: "bg-emerald-500"
  },
  completed: { 
    label: "Completed", 
    icon: CheckCircle2, 
    color: "bg-slate-100 text-slate-800 border-slate-200",
    dotColor: "bg-slate-500"
  },
  cancelled: { 
    label: "Cancelled", 
    icon: AlertCircle, 
    color: "bg-red-100 text-red-800 border-red-200",
    dotColor: "bg-red-500"
  },
};

function OrderProcessDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [stats, setStats] = useState<OrderStats>({
    total: 0,
    byStatus: {},
    revenue: { total: 0, pending: 0, paid: 0 },
    upcoming: 0,
    inProgress: 0,
  });

  useEffect(() => {
    if (user) {
      loadOrders();
    }
  }, [user]);

  useEffect(() => {
    calculateStats();
  }, [orders]);

  const loadOrders = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const companyId = user.user_metadata?.company_id || user.id;
      const allOrders = await orderService.getAllOrders(companyId);
      setOrders(allOrders as unknown as AppOrder[]);
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const byStatus: Record<string, number> = {};
    let totalRevenue = 0;
    let pendingRevenue = 0;
    let paidRevenue = 0;
    let upcoming = 0;
    let inProgress = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    orders.forEach((order) => {
      // Count by status
      byStatus[order.status] = (byStatus[order.status] || 0) + 1;

      // Revenue calculations
      const orderTotal = order.total || 0;
      totalRevenue += orderTotal;
      
      if (order.payment_status === "paid") {
        paidRevenue += orderTotal;
      } else {
        pendingRevenue += orderTotal;
      }

      // Upcoming orders (future events)
      const eventDate = new Date(order.event_date);
      if (eventDate >= today && !["completed", "cancelled"].includes(order.status)) {
        upcoming++;
      }

      // In progress (confirmed through delivered)
      if (["confirmed", "preparing", "ready", "in_transit", "delivered"].includes(order.status)) {
        inProgress++;
      }
    });

    setStats({
      total: orders.length,
      byStatus,
      revenue: { total: totalRevenue, pending: pendingRevenue, paid: paidRevenue },
      upcoming,
      inProgress,
    });
  };

  const getFilteredOrders = () => {
    return orders.filter((order) => {
      // Search filter
      const matchesSearch = 
        searchTerm === "" ||
        order.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.venue_address?.toLowerCase().includes(searchTerm.toLowerCase());

      // Status filter
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;

      // Date filter
      let matchesDate = true;
      if (dateFilter !== "all") {
        const eventDate = new Date(order.event_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === "today") {
          matchesDate = eventDate.toDateString() === today.toDateString();
        } else if (dateFilter === "week") {
          const weekFromNow = new Date(today);
          weekFromNow.setDate(today.getDate() + 7);
          matchesDate = eventDate >= today && eventDate <= weekFromNow;
        } else if (dateFilter === "month") {
          const monthFromNow = new Date(today);
          monthFromNow.setMonth(today.getMonth() + 1);
          matchesDate = eventDate >= today && eventDate <= monthFromNow;
        }
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  };

  const getOrdersByStatus = (status: string) => {
    return getFilteredOrders().filter((order) => order.status === status);
  };

  const OrderCard = ({ order }: { order: AppOrder }) => {
    const config = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
    const Icon = config.icon;
    const eventDate = new Date(order.event_date);
    const isToday = eventDate.toDateString() === new Date().toDateString();
    const isPast = eventDate < new Date();

    return (
      <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4" style={{ borderLeftColor: config.dotColor.replace('bg-', '#') }}>
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-semibold text-slate-900 mb-1">{order.client_name}</h4>
                <p className="text-sm text-slate-600 truncate">{order.venue_address}</p>
              </div>
              <Badge variant="outline" className={`${config.color} border`}>
                {config.label}
              </Badge>
            </div>

            {/* Event Details */}
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span className={isToday ? "font-semibold text-blue-600" : ""}>
                  {eventDate.toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{order.guest_count} guests</span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="font-semibold text-slate-900">
                R{order.total?.toLocaleString() || 0}
              </span>
              <Link href={`/admin/order-assignments?id=${order.id}`}>
                <Button variant="ghost" size="sm" className="gap-1">
                  <Eye className="w-3 h-3" />
                  View
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const KanbanColumn = ({ status, title }: { status: string; title: string }) => {
    const ordersInStatus = getOrdersByStatus(status);
    const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];

    return (
      <div className="flex flex-col min-w-[320px] max-w-[320px]">
        <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-slate-200">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${config.dotColor}`} />
            <h3 className="font-semibold text-slate-900">{title}</h3>
          </div>
          <Badge variant="secondary" className="font-semibold">
            {ordersInStatus.length}
          </Badge>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto max-h-[600px] pr-2">
          {ordersInStatus.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No orders</p>
            </div>
          ) : (
            ordersInStatus.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Order Process Dashboard - CateringMS</title>
      </Head>

      <PortalLayout maxWidth="full">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Order Process Dashboard
                </h1>
                <p className="text-slate-600 mt-1">Track all orders through your workflow</p>
              </div>
            </div>
            <Link href="/admin/order-assignments">
              <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                <ShoppingCart className="w-4 h-4 mr-2" />
                New Order
              </Button>
            </Link>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-700 mb-1">Total Orders</p>
                    <p className="text-3xl font-bold text-blue-900">{stats.total}</p>
                  </div>
                  <ShoppingCart className="w-8 h-8 text-blue-600 opacity-30" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-100">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700 mb-1">Revenue</p>
                    <p className="text-2xl font-bold text-green-900">R{(stats.revenue.total / 1000).toFixed(0)}k</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-600 opacity-30" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-purple-100">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-700 mb-1">In Progress</p>
                    <p className="text-3xl font-bold text-purple-900">{stats.inProgress}</p>
                  </div>
                  <Package className="w-8 h-8 text-purple-600 opacity-30" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-50 to-orange-100">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-orange-700 mb-1">Upcoming</p>
                    <p className="text-3xl font-bold text-orange-900">{stats.upcoming}</p>
                  </div>
                  <Calendar className="w-8 h-8 text-orange-600 opacity-30" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-yellow-50 to-yellow-100">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-yellow-700 mb-1">Pending</p>
                    <p className="text-3xl font-bold text-yellow-900">{stats.byStatus.pending || 0}</p>
                  </div>
                  <Clock className="w-8 h-8 text-yellow-600 opacity-30" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-indigo-100">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-indigo-700 mb-1">In Transit</p>
                    <p className="text-3xl font-bold text-indigo-900">{stats.byStatus.in_transit || 0}</p>
                  </div>
                  <Truck className="w-8 h-8 text-indigo-600 opacity-30" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    placeholder="Search by client, order ID, or venue..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="preparing">In Prep</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="in_transit">In Transit</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="All Dates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Dates</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Kanban Board */}
          {loading ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-24">
                <div className="text-center">
                  <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-slate-600">Loading orders...</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-6 min-w-max px-1">
                <KanbanColumn status="pending" title="Pending" />
                <KanbanColumn status="confirmed" title="Confirmed" />
                <KanbanColumn status="preparing" title="In Prep" />
                <KanbanColumn status="ready" title="Ready" />
                <KanbanColumn status="in_transit" title="In Transit" />
                <KanbanColumn status="delivered" title="Delivered" />
                <KanbanColumn status="completed" title="Completed" />
              </div>
            </div>
          )}
        </div>
      </PortalLayout>
    </>
  );
}

export default function AdminOrders() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <OrderProcessDashboard />
    </ProtectedRoute>
  );
}