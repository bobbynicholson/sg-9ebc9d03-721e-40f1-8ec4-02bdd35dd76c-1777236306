import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  LayoutGrid,
  List,
  ArrowRight,
  Plus,
  Trash2,
  Save,
  X,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { ChatBot } from "@/components/ChatBot";
import { orderService } from "@/services/orderService";
import type { AppOrder, MenuItem, EquipmentItem } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { useToast } from "@/hooks/use-toast";
import { ClientLinkButton } from "@/components/admin/ClientLinkButton";
import { InfoTooltip } from "@/components/ui/info-tooltip";

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

// Workflow stages for timeline view
const WORKFLOW_STAGES = [
  { key: "pending", label: "Pending", order: 0 },
  { key: "confirmed", label: "Confirmed", order: 1 },
  { key: "preparing", label: "In Prep", order: 2 },
  { key: "ready", label: "Ready", order: 3 },
  { key: "in_transit", label: "In Transit", order: 4 },
  { key: "delivered", label: "Delivered", order: 5 },
  { key: "completed", label: "Completed", order: 6 },
];

// Get stage status (completed, current, critical, upcoming)
const getStageStatus = (order: AppOrder, stageKey: string): "completed" | "current" | "critical" | "upcoming" => {
  const currentStageOrder = WORKFLOW_STAGES.find(s => s.key === order.status)?.order ?? 0;
  const thisStageOrder = WORKFLOW_STAGES.find(s => s.key === stageKey)?.order ?? 0;
  
  if (thisStageOrder < currentStageOrder) {
    return "completed";
  } else if (thisStageOrder === currentStageOrder) {
    // Check if critical (event date is today or past and not completed)
    const eventDate = new Date(order.event_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (eventDate <= today && order.status !== "completed" && order.status !== "cancelled") {
      return "critical";
    }
    return "current";
  }
  return "upcoming";
};

// Get next stage
const getNextStage = (order: AppOrder): string | null => {
  const currentStageOrder = WORKFLOW_STAGES.find(s => s.key === order.status)?.order ?? 0;
  const nextStage = WORKFLOW_STAGES.find(s => s.order === currentStageOrder + 1);
  return nextStage ? nextStage.label : null;
};

function OrderProcessDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"kanban" | "timeline">("kanban");
  const [selectedOrder, setSelectedOrder] = useState<AppOrder | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
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

  // Stats follow the filters -- revenue / counts always reflect what's
  // visible on the page so "This Month" actually means this month.
  useEffect(() => {
    calculateStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, dateFilter, statusFilter, searchTerm]);

  const loadOrders = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const allOrders = await orderService.getAllOrders(user.company_id);
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

    // Stats reflect what the user is filtering for -- if they pick
    // "This Month", revenue is this month's events, not lifetime.
    const visible = getFilteredOrders();

    visible.forEach((order) => {
      byStatus[order.status] = (byStatus[order.status] || 0) + 1;

      const orderTotal = Number(order.total_amount) || 0;
      // Cancelled orders don't count toward revenue
      if (order.status === "cancelled") return;
      totalRevenue += orderTotal;

      if (order.payment_status === "paid") paidRevenue += orderTotal;
      else pendingRevenue += orderTotal;

      const eventDate = new Date(order.event_date);
      if (eventDate >= today && !["completed", "cancelled"].includes(order.status)) {
        upcoming++;
      }
      if (["confirmed", "preparing", "ready", "in_transit", "delivered"].includes(order.status)) {
        inProgress++;
      }
    });

    setStats({
      total: visible.length,
      byStatus,
      revenue: { total: totalRevenue, pending: pendingRevenue, paid: paidRevenue },
      upcoming,
      inProgress,
    });
  };

  // Apply non-search filters (status + date window) first so the fuzzy
  // matcher only ranks the orders the user has narrowed to. Memoised so the
  // fuzzy hook doesn't get a fresh array on every render.
  const statusDateFilteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;

      // Date filter -- preset windows on the order's event_date
      let matchesDate = true;
      if (dateFilter !== "all") {
        const eventDate = new Date(order.event_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === "today") {
          matchesDate = eventDate.toDateString() === today.toDateString();
        } else if (dateFilter === "week") {
          // This calendar week (Mon-Sun)
          const day = today.getDay() === 0 ? 7 : today.getDay();
          const monday = new Date(today);
          monday.setDate(today.getDate() - (day - 1));
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          sunday.setHours(23, 59, 59, 999);
          matchesDate = eventDate >= monday && eventDate <= sunday;
        } else if (dateFilter === "month") {
          // This calendar month (1st through last)
          const first = new Date(today.getFullYear(), today.getMonth(), 1);
          const last  = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          last.setHours(23, 59, 59, 999);
          matchesDate = eventDate >= first && eventDate <= last;
        } else if (dateFilter === "next30") {
          const thirty = new Date(today);
          thirty.setDate(today.getDate() + 30);
          matchesDate = eventDate >= today && eventDate <= thirty;
        } else if (dateFilter === "past") {
          matchesDate = eventDate < today;
        }
      }

      return matchesStatus && matchesDate;
    });
  }, [orders, statusFilter, dateFilter]);

  // Smart fuzzy search across client name, order id, venue and event name.
  // client name is weighted highest because that's what staff almost always
  // type to find an order.
  const fuzzyOrders = useFuzzyItems(
    statusDateFilteredOrders,
    searchTerm,
    [
      { key: "client_name" as any, weight: 3 },
      { key: "id" as any, weight: 2 },
      { key: "venue_address" as any, weight: 1 },
      { key: "event_name" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  const getFilteredOrders = () => fuzzyOrders;

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
                R{Number(order.total_amount || 0).toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <ClientLinkButton orderId={order.id} companyId={(order as any).company_id} compact />
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    setSelectedOrder(order);
                    setIsModalOpen(true);
                  }}
                >
                  <Eye className="w-3 h-3" />
                  View
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const TimelineRow = ({ order }: { order: AppOrder }) => {
    const eventDate = new Date(order.event_date);
    const isToday = eventDate.toDateString() === new Date().toDateString();
    const isPast = eventDate < new Date();
    const nextStage = getNextStage(order);

    return (
      <Card 
        className="hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => {
          setSelectedOrder(order);
          setIsModalOpen(true);
        }}
      >
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Order Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="font-semibold text-slate-900 text-lg">{order.client_name}</h4>
                  {isToday && (
                    <Badge className="bg-blue-500">Today</Badge>
                  )}
                  {isPast && order.status !== "completed" && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Overdue
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-600">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>{eventDate.toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    <span className="truncate max-w-xs">{order.venue_address}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{order.guest_count} guests</span>
                  </div>
                  <div className="flex items-center gap-1 font-semibold text-slate-900">
                    <DollarSign className="w-4 h-4" />
                    <span>R{Number(order.total_amount || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Progress</span>
                {nextStage && (
                  <div className="flex items-center gap-1 text-orange-600 font-medium">
                    <ArrowRight className="w-3 h-3" />
                    Next: {nextStage}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {WORKFLOW_STAGES.map((stage, index) => {
                  const status = getStageStatus(order, stage.key);
                  const isLast = index === WORKFLOW_STAGES.length - 1;

                  return (
                    <div key={stage.key} className="flex items-center flex-1">
                      {/* Stage Dot */}
                      <div className="relative group">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                            status === "completed"
                              ? "bg-green-500 text-white scale-100"
                              : status === "current"
                              ? "bg-orange-500 text-white scale-110 ring-4 ring-orange-100 animate-pulse"
                              : status === "critical"
                              ? "bg-red-500 text-white scale-110 ring-4 ring-red-100 animate-pulse"
                              : "bg-slate-200 text-slate-400 scale-90"
                          }`}
                        >
                          {status === "completed" && <CheckCircle2 className="w-4 h-4" />}
                          {status === "current" && <Clock className="w-4 h-4" />}
                          {status === "critical" && <AlertCircle className="w-4 h-4" />}
                          {status === "upcoming" && <div className="w-2 h-2 rounded-full bg-slate-400" />}
                        </div>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                          {stage.label}
                        </div>
                      </div>

                      {/* Connector Line */}
                      {!isLast && (
                        <div className="flex-1 h-1 mx-1">
                          <div
                            className={`h-full rounded transition-all ${
                              status === "completed"
                                ? "bg-green-500"
                                : status === "current"
                                ? "bg-gradient-to-r from-orange-500 to-slate-200"
                                : status === "critical"
                                ? "bg-gradient-to-r from-red-500 to-slate-200"
                                : "bg-slate-200"
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Stage Labels */}
              <div className="flex items-center gap-2 text-[10px]">
                {WORKFLOW_STAGES.map((stage) => (
                  <div key={stage.key} className="flex-1 text-center text-slate-500 truncate">
                    {stage.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const OrderHistoryTimeline = ({ orderId }: { orderId: string }) => {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const fetchHistory = async () => {
        setLoading(true);
        const result = await orderService.getOrderStatusHistory(orderId);
        if (result.success && result.data) {
          setHistory(result.data);
        }
        setLoading(false);
      };

      fetchHistory();
    }, [orderId]);

    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      );
    }

    if (history.length === 0) {
      return (
        <div className="text-center py-12 text-slate-400">
          <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No status changes recorded yet</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />

          {/* History Items */}
          <div className="space-y-6">
            {history.map((item, index) => {
              const config = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
              const Icon = config.icon;
              const timestamp = new Date(item.created_at);
              const isFirst = index === 0;

              return (
                <div key={item.id} className="relative flex gap-4">
                  {/* Timeline Dot */}
                  <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isFirst ? config.dotColor : "bg-slate-300"
                  } ${isFirst ? "ring-4 ring-offset-2 " + config.dotColor.replace('bg-', 'ring-').replace('-500', '-300') : ""}`}>
                    <Icon className={`w-4 h-4 ${isFirst ? "text-white" : "text-slate-500"}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-6">
                    <Card className={`border-l-4 ${isFirst ? "shadow-md" : ""}`} style={{ borderLeftColor: config.dotColor.replace('bg-', '#') }}>
                      <CardContent className="pt-4">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <Badge variant="outline" className={`${config.color} border mb-2`}>
                                {config.label}
                              </Badge>
                              <p className="text-sm font-medium text-slate-900">
                                Status changed to {config.label}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-500">
                                {timestamp.toLocaleDateString()}
                              </p>
                              <p className="text-xs text-slate-400">
                                {timestamp.toLocaleTimeString()}
                              </p>
                            </div>
                          </div>

                          {item.notes && (
                            <p className="text-sm text-slate-600 bg-slate-50 rounded p-2 mt-2">
                              {item.notes}
                            </p>
                          )}

                          {item.changed_by_profile && (
                            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
                                {item.changed_by_profile.full_name?.charAt(0) || item.changed_by_profile.email?.charAt(0) || "?"}
                              </div>
                              <div className="text-xs text-slate-600">
                                <span className="font-medium">{item.changed_by_profile.full_name || "User"}</span>
                                {item.changed_by_profile.email && (
                                  <span className="text-slate-400"> • {item.changed_by_profile.email}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const OrderDetailsModal = () => {
    const [editedOrder, setEditedOrder] = useState<AppOrder | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      if (selectedOrder) {
        setEditedOrder(selectedOrder);
      }
    }, [selectedOrder]);

    if (!selectedOrder || !editedOrder) return null;

    const handleSave = async () => {
      setSaving(true);
      try {
        await orderService.updateOrder(editedOrder.id, {
          client_name: editedOrder.client_name,
          venue_address: editedOrder.venue_address,
          guest_count: editedOrder.guest_count,
          event_date: editedOrder.event_date,
          status: editedOrder.status,
          menu_items: editedOrder.menu_items,
          equipment_items: editedOrder.equipment_items,
          notes: editedOrder.notes,
        });
        
        toast({
          title: "Order Updated",
          description: "Changes have been saved successfully.",
        });
        
        setEditMode(false);
        loadOrders(); // Refresh orders list
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to update order. Please try again.",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    };

    const addMenuItem = () => {
      const newItem: MenuItem = {
        id: `new-${Date.now()}`,
        name: "",
        category: "main",
        pricePerPerson: 0,
        quantity: editedOrder.guest_count || 0,
        ingredients: [],
      };
      setEditedOrder({
        ...editedOrder,
        menu_items: [...(editedOrder.menu_items || []), newItem],
      });
    };

    const removeMenuItem = (index: number) => {
      const updated = [...(editedOrder.menu_items || [])];
      updated.splice(index, 1);
      setEditedOrder({ ...editedOrder, menu_items: updated });
    };

    const updateMenuItem = (index: number, field: keyof MenuItem, value: any) => {
      const updated = [...(editedOrder.menu_items || [])];
      updated[index] = { ...updated[index], [field]: value };
      setEditedOrder({ ...editedOrder, menu_items: updated });
    };

    return (
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl">Order Details</DialogTitle>
                <DialogDescription className="mt-1">
                  {editMode ? "Edit order information" : "View order details"}
                </DialogDescription>
              </div>
              {!editMode ? (
                <Button onClick={() => setEditMode(true)} variant="outline" size="sm">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button 
                    onClick={() => {
                      setEditedOrder(selectedOrder);
                      setEditMode(false);
                    }} 
                    variant="outline" 
                    size="sm"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving} size="sm">
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          <Tabs defaultValue="details" className="mt-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="menu">Menu Items</TabsTrigger>
              <TabsTrigger value="equipment">Equipment</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client Name</Label>
                  <Input
                    value={editedOrder.client_name}
                    onChange={(e) => setEditedOrder({ ...editedOrder, client_name: e.target.value })}
                    disabled={!editMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editedOrder.status}
                    onValueChange={(value) => setEditedOrder({ ...editedOrder, status: value as any })}
                    disabled={!editMode}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="preparing">In Prep</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                      <SelectItem value="in_transit">In Transit</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 col-span-2">
                  <Label>Venue Address</Label>
                  <Input
                    value={editedOrder.venue_address || ""}
                    onChange={(e) => setEditedOrder({ ...editedOrder, venue_address: e.target.value })}
                    disabled={!editMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Event Date</Label>
                  <Input
                    type="date"
                    value={editedOrder.event_date}
                    onChange={(e) => setEditedOrder({ ...editedOrder, event_date: e.target.value })}
                    disabled={!editMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Guest Count</Label>
                  <Input
                    type="number"
                    value={editedOrder.guest_count}
                    onChange={(e) => setEditedOrder({ ...editedOrder, guest_count: parseInt(e.target.value) || 0 })}
                    disabled={!editMode}
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={editedOrder.notes || ""}
                    onChange={(e) => setEditedOrder({ ...editedOrder, notes: e.target.value })}
                    disabled={!editMode}
                    rows={3}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="menu" className="space-y-4 mt-4">
              {editMode && (
                <Button onClick={addMenuItem} variant="outline" size="sm" className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Menu Item
                </Button>
              )}

              <div className="space-y-3">
                {(editedOrder.menu_items || []).map((item, index) => (
                  <Card key={index}>
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-5 space-y-2">
                          <Label className="text-xs">Item Name</Label>
                          <Input
                            value={item.name}
                            onChange={(e) => updateMenuItem(index, "name", e.target.value)}
                            disabled={!editMode}
                            placeholder="e.g., Grilled Chicken"
                          />
                        </div>

                        <div className="col-span-3 space-y-2">
                          <Label className="text-xs">Category</Label>
                          <Select
                            value={item.category}
                            onValueChange={(value) => updateMenuItem(index, "category", value)}
                            disabled={!editMode}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="appetizer">Appetizer</SelectItem>
                              <SelectItem value="main">Main</SelectItem>
                              <SelectItem value="side">Side</SelectItem>
                              <SelectItem value="dessert">Dessert</SelectItem>
                              <SelectItem value="beverage">Beverage</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="col-span-2 space-y-2">
                          <Label className="text-xs">Price/Person</Label>
                          <Input
                            type="number"
                            value={item.pricePerPerson}
                            onChange={(e) => updateMenuItem(index, "pricePerPerson", parseFloat(e.target.value) || 0)}
                            disabled={!editMode}
                          />
                        </div>

                        {editMode && (
                          <div className="col-span-2 flex items-end">
                            <Button
                              onClick={() => removeMenuItem(index)}
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {(!editedOrder.menu_items || editedOrder.menu_items.length === 0) && (
                  <div className="text-center py-8 text-slate-400">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No menu items added yet</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="equipment" className="space-y-4 mt-4">
              <div className="space-y-3">
                {(editedOrder.equipment_items || []).map((item, index) => (
                  <Card key={index}>
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Equipment Name</Label>
                          <p className="text-sm font-medium mt-1">{item.name}</p>
                        </div>
                        <div>
                          <Label className="text-xs">Quantity</Label>
                          <p className="text-sm font-medium mt-1">{item.quantity}</p>
                        </div>
                        <div>
                          <Label className="text-xs">Rental Price</Label>
                          <p className="text-sm font-medium mt-1">R{item.rentalPrice}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {(!editedOrder.equipment_items || editedOrder.equipment_items.length === 0) && (
                  <div className="text-center py-8 text-slate-400">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No equipment items added yet</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="space-y-4 mt-4">
              <OrderHistoryTimeline orderId={editedOrder.id} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
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

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-6 md:py-8 lg:py-12 max-w-full">
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
              <div className="flex gap-2">
                <div className="flex border rounded-lg overflow-hidden">
                  <Button
                    variant={viewMode === "kanban" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("kanban")}
                    className="rounded-none"
                  >
                    <LayoutGrid className="w-4 h-4 mr-2" />
                    Kanban
                  </Button>
                  <Button
                    variant={viewMode === "timeline" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("timeline")}
                    className="rounded-none"
                  >
                    <List className="w-4 h-4 mr-2" />
                    Timeline
                  </Button>
                </div>
                <Link href="/admin/order-assignments">
                  <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    New Order
                  </Button>
                </Link>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-700 mb-1 flex items-center gap-1.5">Total Orders <InfoTooltip content={"Number of orders that match your current search, status and date filters."} /></p>
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
                      <p className="text-sm text-green-700 mb-1 flex items-center gap-1.5">Revenue <InfoTooltip content={"Total value of the orders shown above.\n\nCancelled orders are not counted."} /></p>
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
                      <p className="text-sm text-purple-700 mb-1 flex items-center gap-1.5">In Progress <InfoTooltip content={"Orders the team is actively working on, anywhere from confirmed through to delivered."} /></p>
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
                      <p className="text-sm text-orange-700 mb-1 flex items-center gap-1.5">Upcoming <InfoTooltip content={"Orders in the current view dated today or later that are still open."} /></p>
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
                      <p className="text-sm text-yellow-700 mb-1 flex items-center gap-1.5">Pending <InfoTooltip content={"Orders waiting for you to confirm them."} /></p>
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
                      <p className="text-sm text-indigo-700 mb-1 flex items-center gap-1.5">In Transit <InfoTooltip content={"Orders that are out on the road being delivered right now."} /></p>
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
                      placeholder="Search by client, order ID, venue or event..."
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
                      <SelectItem value="next30">Next 30 days</SelectItem>
                      <SelectItem value="past">Past events</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" className="gap-2">
                    <Download className="w-4 h-4" />
                    Export
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Kanban Board / Timeline View */}
            {loading ? (
              <Card className="border-0 shadow-lg">
                <CardContent className="py-24">
                  <div className="text-center">
                    <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-slate-600">Loading orders...</p>
                  </div>
                </CardContent>
              </Card>
            ) : viewMode === "kanban" ? (
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
            ) : (
              <div className="space-y-3">
                {getFilteredOrders().length === 0 ? (
                  <Card className="border-0 shadow-lg">
                    <CardContent className="py-24">
                      <div className="text-center text-slate-400">
                        <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-medium">No orders found</p>
                        <p className="text-sm mt-1">Try adjusting your filters</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  getFilteredOrders()
                    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
                    .map((order) => <TimelineRow key={order.id} order={order} />)
                )}
              </div>
            )}

            {/* Order Details Modal */}
            <OrderDetailsModal />
          </div>
        </div>

        <Footer />

        <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
      </div>
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