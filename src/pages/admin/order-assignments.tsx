import { useState, useEffect, useMemo, FC } from "react";
import React from "react";
import Link from "next/link";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MapPin,
  Calendar,
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  Search,
  Filter,
  Building2,
  AlertCircle,
  TrendingUp,
  Package,
  ChefHat,
  ShoppingCart,
  Truck,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { regionManagement } from "@/lib/regionManagement";
import { mockOrders } from "@/lib/mockData";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { userManagementService } from "@/services/userManagementService";
import { useToast } from "@/hooks/use-toast";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

interface StaffAssignment {
  orderId: string;
  kitchen?: string;
  shopping?: string;
  driver?: string;
  cleaning?: string;
}

function OrderAssignmentsContent() {
  const [orders] = useState(mockOrders);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [staffAssignments, setStaffAssignments] = useState<Record<string, StaffAssignment>>({});
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<"kitchen" | "shopping" | "driver" | "cleaning" | null>(null);
  const [selectedStaffMember, setSelectedStaffMember] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [availableStaff, setAvailableStaff] = useState<any[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  const regions = regionManagement.regions.filter(r => r.status === "active");

  // Load assignments from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("order_assignments");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAssignments(parsed);
      } catch (e) {
        console.error("Error parsing stored assignments:", e);
        setAssignments(regionManagement.orderAssignments);
        localStorage.setItem("order_assignments", JSON.stringify(regionManagement.orderAssignments));
      }
    } else {
      setAssignments(regionManagement.orderAssignments);
      localStorage.setItem("order_assignments", JSON.stringify(regionManagement.orderAssignments));
    }

    // Load staff assignments
    const staffAssigned = localStorage.getItem("staff_assignments");
    if (staffAssigned) {
      try {
        setStaffAssignments(JSON.parse(staffAssigned));
      } catch (e) {
        console.error("Error parsing staff assignments:", e);
      }
    }
  }, []);

  // Load available staff when dialog opens
  useEffect(() => {
    if (isStaffDialogOpen && selectedDepartment && user?.id) {
      loadAvailableStaff(selectedDepartment);
    }
  }, [isStaffDialogOpen, selectedDepartment, user?.id]);

  const loadAvailableStaff = async (department: string) => {
    if (!user?.id) return;
    
    try {
      const staff = await userManagementService.getUsersByDepartment(department as any);
      setAvailableStaff(staff);
    } catch (error) {
      console.error("Error loading staff:", error);
      toast({
        title: "Error",
        description: "Failed to load available staff",
        variant: "destructive",
      });
    }
  };

  const getAssignmentForOrder = (orderId: string) => {
    return assignments.find(a => a.orderId === orderId);
  };

  const getRegionForOrder = (orderId: string) => {
    const assignment = getAssignmentForOrder(orderId);
    if (assignment) {
      return regions.find(r => r.id === assignment.regionId);
    }
    return null;
  };

  const getStaffAssignmentForOrder = (orderId: string) => {
    return staffAssignments[orderId] || {};
  };

  const handleAssignOrder = () => {
    if (selectedOrder && selectedRegion) {
      regionManagement.assignOrderToRegion(
        selectedOrder.id,
        selectedRegion,
        "hq_admin_001",
        assignmentNotes
      );
      
      localStorage.setItem("order_assignments", JSON.stringify(regionManagement.orderAssignments));
      setAssignments([...regionManagement.orderAssignments]);
      setIsAssignDialogOpen(false);
      setSelectedOrder(null);
      setSelectedRegion("");
      setAssignmentNotes("");
      
      toast({
        title: "Order Assigned",
        description: `Order ${selectedOrder.id} has been assigned to ${regions.find(r => r.id === selectedRegion)?.name}`,
      });
    }
  };

  const handleOpenStaffDialog = (order: any, department: "kitchen" | "shopping" | "driver" | "cleaning") => {
    setSelectedOrder(order);
    setSelectedDepartment(department);
    setIsStaffDialogOpen(true);
  };

  const handleAssignStaff = () => {
    if (!selectedOrder || !selectedDepartment || !selectedStaffMember) return;

    const updatedAssignments = {
      ...staffAssignments,
      [selectedOrder.id]: {
        ...staffAssignments[selectedOrder.id],
        [selectedDepartment]: selectedStaffMember,
      }
    };

    setStaffAssignments(updatedAssignments);
    localStorage.setItem("staff_assignments", JSON.stringify(updatedAssignments));
    
    const staffMember = availableStaff.find(s => s.id === selectedStaffMember);
    toast({
      title: "Staff Assigned",
      description: `${staffMember?.full_name} has been assigned to ${selectedDepartment} for order ${selectedOrder.id}`,
    });

    setIsStaffDialogOpen(false);
    setSelectedOrder(null);
    setSelectedDepartment(null);
    setSelectedStaffMember("");
  };

  const handleStatusUpdate = (orderId: string, status: any) => {
    const currentAssignments = JSON.parse(localStorage.getItem("order_assignments") || "[]");
    const updatedAssignments = currentAssignments.map((a: any) => {
      if (a.orderId === orderId) {
        return { ...a, status };
      }
      return a;
    });
    
    localStorage.setItem("order_assignments", JSON.stringify(updatedAssignments));
    setAssignments(updatedAssignments);
    
    if (status === "accepted") {
      toast({
        title: "Order Accepted",
        description: "Order is now available for staff assignment",
      });
    }
  };

  const getDepartmentIcon = (dept: string) => {
    switch (dept) {
      case "kitchen": return ChefHat;
      case "shopping": return ShoppingCart;
      case "driver": return Truck;
      case "cleaning": return Sparkles;
      default: return Users;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted":
        return "bg-green-100 text-green-700 border-green-200";
      case "in_progress":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "completed":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "rejected":
        return "bg-red-100 text-red-700 border-red-200";
      case "pending":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "accepted":
      case "in_progress":
      case "completed":
        return <CheckCircle className="w-3 h-3 md:w-4 md:h-4" />;
      case "rejected":
        return <XCircle className="w-3 h-3 md:w-4 md:h-4" />;
      case "pending":
        return <Clock className="w-3 h-3 md:w-4 md:h-4" />;
      default:
        return null;
    }
  };

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (filterStatus === "unassigned") {
      result = orders.filter((order) => !getAssignmentForOrder(order.id));
    } else if (filterStatus !== "all") {
      const assignedOrders = assignments
        .filter(a => a.status === filterStatus)
        .map(a => a.orderId);
      result = orders.filter((order) => assignedOrders.includes(order.id));
    }

    if (searchTerm) {
      result = result.filter(
        (order) =>
          order.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return result;
  }, [orders, assignments, filterStatus, searchTerm]);

  const unassignedCount = orders.filter(o => !getAssignmentForOrder(o.id)).length;
  const pendingCount = assignments.filter(a => a.status === "pending").length;
  const activeCount = assignments.filter(a => a.status === "in_progress").length;

  const departments = [
    { key: "kitchen" as const, label: "Kitchen", icon: ChefHat, color: "orange" },
    { key: "shopping" as const, label: "Shopping", icon: ShoppingCart, color: "green" },
    { key: "driver" as const, label: "Driver", icon: Truck, color: "blue" },
    { key: "cleaning" as const, label: "Cleaning", icon: Sparkles, color: "cyan" }
  ];

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Order Assignments | CateringMS Admin</title>
      </Head>
      
      <AdminNav />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-64">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header */}
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col gap-4 mb-4 md:mb-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-900 mb-1 md:mb-2">Order Assignment Hub</h1>
                  <p className="text-sm md:text-base text-slate-600">Assign orders to regions and staff members</p>
                </div>
                <Link href="/admin/regions" className="w-full md:w-auto">
                  <Button variant="outline" className="w-full md:w-auto" size="sm">
                    <Building2 className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                    Manage Regions
                  </Button>
                </Link>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6 mb-6 md:mb-8">
              <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
                <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <AlertCircle className="w-6 h-6 md:w-8 md:h-8" />
                      <div className="text-2xl md:text-3xl font-bold">{unassignedCount}</div>
                    </div>
                    <div className="text-amber-100 text-xs md:text-sm">Unassigned Orders</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Clock className="w-6 h-6 md:w-8 md:h-8 text-yellow-500" />
                      <div className="text-2xl md:text-3xl font-bold text-slate-900">{pendingCount}</div>
                    </div>
                    <div className="text-slate-600 text-xs md:text-sm">Pending Accept</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-blue-500" />
                      <div className="text-2xl md:text-3xl font-bold text-slate-900">{activeCount}</div>
                    </div>
                    <div className="text-slate-600 text-xs md:text-sm">In Progress</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Building2 className="w-6 h-6 md:w-8 md:h-8 text-purple-500" />
                      <div className="text-2xl md:text-3xl font-bold text-slate-900">{regions.length}</div>
                    </div>
                    <div className="text-slate-600 text-xs md:text-sm">Active Regions</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search and Filter */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-400" />
                <Input
                  placeholder="Search by client or order ID..."
                  className="pl-9 md:pl-10 text-sm md:text-base"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Orders List */}
          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <Card className="border-0 shadow-lg">
                <CardContent className="py-12 md:py-16 text-center px-4">
                  <Package className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-slate-300" />
                  <h3 className="text-lg md:text-xl font-semibold text-slate-900 mb-2">No orders found</h3>
                  <p className="text-sm md:text-base text-slate-600">Try adjusting your search or filters</p>
                </CardContent>
              </Card>
            ) : (
              filteredOrders.map((order) => {
                const assignment = getAssignmentForOrder(order.id);
                const region = getRegionForOrder(order.id);
                const staffAssignment = getStaffAssignmentForOrder(order.id);
                
                return (
                  <Card key={order.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                    <CardContent className="p-4 md:p-6">
                      <div className="space-y-4">
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-mono font-semibold text-xs md:text-sm text-slate-600 mb-1">{order.id}</div>
                            <h3 className="font-bold text-base md:text-lg text-slate-900 truncate">{order.client_name}</h3>
                            <p className="text-xs md:text-sm text-slate-600 mt-1">
                              {new Date(order.event_date).toLocaleDateString()} • {order.venue_address}
                            </p>
                          </div>
                          {assignment ? (
                            <Badge className={`${getStatusColor(assignment.status)} text-xs flex-shrink-0`}>
                              {getStatusIcon(assignment.status)}
                              <span className="ml-1 capitalize">{assignment.status.replace("_", " ")}</span>
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs flex-shrink-0">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Unassigned
                            </Badge>
                          )}
                        </div>

                        {/* Region Assignment */}
                        {region && (
                          <div className="flex items-center gap-2 text-xs md:text-sm text-slate-600 bg-purple-50 p-2 rounded-lg">
                            <Building2 className="w-4 h-4 text-purple-500" />
                            <span className="font-semibold">Region: {region.name}</span>
                          </div>
                        )}

                        {/* Staff Assignment Section */}
                        {assignment && assignment.status === "accepted" && (
                          <div className="border-t pt-4">
                            <h4 className="text-sm font-semibold text-slate-700 mb-3">Staff Assignments</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                              {departments.map((dept) => {
                                const Icon = dept.icon;
                                const assignedStaff = staffAssignment[dept.key];
                                const staffMember = assignedStaff ? availableStaff.find(s => s.id === assignedStaff) : null;
                                
                                return (
                                  <div key={dept.key} className={`border-2 rounded-lg p-3 ${assignedStaff ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Icon className={`w-4 h-4 text-${dept.color}-600`} />
                                      <span className="text-xs font-semibold text-slate-700">{dept.label}</span>
                                    </div>
                                    {assignedStaff ? (
                                      <div className="space-y-1">
                                        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                                          <CheckCircle className="w-3 h-3 mr-1" />
                                          Assigned
                                        </Badge>
                                        <p className="text-xs text-slate-600 truncate">
                                          {staffMember?.full_name || "Unknown"}
                                        </p>
                                      </div>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleOpenStaffDialog(order, dept.key)}
                                        className="w-full text-xs"
                                      >
                                        <UserPlus className="w-3 h-3 mr-1" />
                                        Assign
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-col sm:flex-row gap-2 pt-2">
                          {!assignment || assignment.status === "rejected" ? (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedOrder(order);
                                setIsAssignDialogOpen(true);
                              }}
                              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white w-full sm:w-auto text-xs md:text-sm"
                            >
                              <Send className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                              Assign Region
                            </Button>
                          ) : (
                            <div className="flex flex-col sm:flex-row gap-2 w-full">
                              {assignment.status === "pending" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStatusUpdate(order.id, "accepted")}
                                  className="w-full sm:w-auto text-xs md:text-sm"
                                >
                                  <CheckCircle className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                                  Accept Order
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setSelectedRegion(region?.id || "");
                                  setIsAssignDialogOpen(true);
                                }}
                                className="w-full sm:w-auto text-xs md:text-sm"
                              >
                                Update Region
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        {/* Region Assignment Dialog */}
        <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg md:text-xl">Assign Order to Region</DialogTitle>
              <DialogDescription className="text-sm">
                Select which regional operation will fulfill this order
              </DialogDescription>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-3 md:space-y-4 py-2">
                <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Order ID:</span>
                    <span className="font-mono font-semibold text-xs">{selectedOrder.id}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Client:</span>
                    <span className="font-semibold truncate ml-2 max-w-[60%] text-right">{selectedOrder.client_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Event Date:</span>
                    <span className="font-semibold">{new Date(selectedOrder.event_date).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Value:</span>
                    <span className="font-semibold text-green-600">R{selectedOrder.total?.toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <Label htmlFor="region" className="text-sm mb-1.5 block">Assign to Region</Label>
                  <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                    <SelectTrigger id="region" className="h-9">
                      <SelectValue placeholder="Select a region" />
                    </SelectTrigger>
                    <SelectContent>
                      {regions.map((region) => (
                        <SelectItem key={region.id} value={region.id}>
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            {region.name} ({region.code})
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes" className="text-sm mb-1.5 block">Assignment Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Add any special instructions..."
                    value={assignmentNotes}
                    onChange={(e) => setAssignmentNotes(e.target.value)}
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)} className="w-full sm:w-auto h-9" size="sm">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAssignOrder}
                    disabled={!selectedRegion}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 text-white w-full sm:w-auto h-9"
                    size="sm"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Assign Order
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Staff Assignment Dialog */}
        <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg md:text-xl flex items-center gap-2">
                {selectedDepartment && (
                  <>
                    {React.createElement(getDepartmentIcon(selectedDepartment), { className: "w-5 h-5" })}
                    Assign {selectedDepartment ? departments.find(d => d.key === selectedDepartment)?.label : ""} Staff
                  </>
                )}
              </DialogTitle>
              <DialogDescription className="text-sm">
                Select a staff member for this department
              </DialogDescription>
            </DialogHeader>
            {selectedOrder && selectedDepartment && (
              <div className="space-y-3 md:space-y-4 py-2">
                <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Order:</span>
                    <span className="font-mono font-semibold text-xs">{selectedOrder.id}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Department:</span>
                    <span className="font-semibold">{departments.find(d => d.key === selectedDepartment)?.label}</span>
                  </div>
                </div>

                <div>
                  <Label htmlFor="staff" className="text-sm mb-1.5 block">Select Staff Member</Label>
                  <Select value={selectedStaffMember} onValueChange={setSelectedStaffMember}>
                    <SelectTrigger id="staff" className="h-9">
                      <SelectValue placeholder="Select a staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStaff.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No staff available for this department
                        </SelectItem>
                      ) : (
                        availableStaff.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              {staff.full_name} ({staff.email})
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsStaffDialogOpen(false)} className="w-full sm:w-auto h-9" size="sm">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAssignStaff}
                    disabled={!selectedStaffMember || availableStaff.length === 0}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 text-white w-full sm:w-auto h-9"
                    size="sm"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Assign Staff
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Footer />
      </div>
    </>
  );
}

export default function ProtectedOrderAssignmentsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <OrderAssignmentsContent />
    </ProtectedRoute>
  );
}