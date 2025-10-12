import { useState } from "react";
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
  ClipboardList,
} from "lucide-react";
import { regionManagement } from "@/lib/regionManagement";
import { mockOrders } from "@/lib/mockData";
import { Footer } from "@/components/Footer";

export default function OrderAssignmentsPage() {
  const [orders] = useState(mockOrders);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Load assignments from localStorage on mount
  useState(() => {
    const stored = localStorage.getItem("order_assignments");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAssignments(parsed);
      } catch (e) {
        // If parsing fails, use defaults
        setAssignments(regionManagement.orderAssignments);
        localStorage.setItem("order_assignments", JSON.stringify(regionManagement.orderAssignments));
      }
    } else {
      // Initialize with defaults if nothing in localStorage
      setAssignments(regionManagement.orderAssignments);
      localStorage.setItem("order_assignments", JSON.stringify(regionManagement.orderAssignments));
    }
  });

  const regions = regionManagement.regions.filter(r => r.status === "active");

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

  const handleAssignOrder = () => {
    if (selectedOrder && selectedRegion) {
      // Assign via regionManagement
      regionManagement.assignOrderToRegion(
        selectedOrder.id,
        selectedRegion,
        "hq_admin_001",
        assignmentNotes
      );
      
      // Store assignments in localStorage for other components to access
      localStorage.setItem("order_assignments", JSON.stringify(regionManagement.orderAssignments));
      
      setAssignments([...regionManagement.orderAssignments]);
      setIsAssignDialogOpen(false);
      setSelectedOrder(null);
      setSelectedRegion("");
      setAssignmentNotes("");
    }
  };

  const handleStatusUpdate = (orderId: string, status: any) => {
    regionManagement.updateAssignmentStatus(orderId, status);
    
    // Save to localStorage so other pages can see the updated status
    localStorage.setItem("order_assignments", JSON.stringify(regionManagement.orderAssignments));
    
    setAssignments([...regionManagement.orderAssignments]);
    
    // Show success message
    if (status === "accepted") {
      alert("Order accepted! This order is now available for drivers to claim in the Driver Portal.");
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

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.id.toLowerCase().includes(searchTerm.toLowerCase());
    const assignment = getAssignmentForOrder(order.id);
    const matchesFilter = filterStatus === "all" ||
                         (filterStatus === "unassigned" && !assignment) ||
                         (assignment && assignment.status === filterStatus);
    return matchesSearch && matchesFilter;
  });

  const unassignedCount = orders.filter(o => !getAssignmentForOrder(o.id)).length;
  const pendingCount = assignments.filter(a => a.status === "pending").length;
  const activeCount = assignments.filter(a => a.status === "in_progress").length;

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Order Assignments - CaterOS Admin</title>
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
          {/* Header - Mobile Optimized */}
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col gap-4 mb-4 md:mb-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-900 mb-1 md:mb-2">Order Assignment Hub</h1>
                  <p className="text-sm md:text-base text-slate-600">Assign orders to regional operations for fulfillment</p>
                </div>
                <Link href="/admin/regions" className="w-full md:w-auto">
                  <Button variant="outline" className="w-full md:w-auto" size="sm">
                    <Building2 className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                    Manage Regions
                  </Button>
                </Link>
              </div>
            </div>

            {/* Stats Cards - Mobile Optimized Grid */}
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

            {/* Search and Filter - Mobile Stacked */}
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

          {/* Orders List - Mobile Optimized Cards */}
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
                
                return (
                  <Card key={order.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                    <CardContent className="p-4 md:p-6">
                      <div className="space-y-3 md:space-y-4">
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-mono font-semibold text-xs md:text-sm text-slate-600 mb-1">{order.id}</div>
                            <h3 className="font-bold text-base md:text-lg text-slate-900 truncate">{order.client}</h3>
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

                        {/* Order Details Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 text-xs md:text-sm">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Calendar className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                            <span className="truncate">{order.date}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-600">
                            <MapPin className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                            <span className="truncate">{order.location}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-600">
                            <DollarSign className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                            <span className="font-semibold">R{order.total.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-600">
                            {region ? (
                              <>
                                <Building2 className="w-3 h-3 md:w-4 md:h-4 text-purple-500 flex-shrink-0" />
                                <span className="font-semibold truncate">{region.name}</span>
                              </>
                            ) : (
                              <>
                                <Building2 className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                                <span className="text-slate-400">Not Assigned</span>
                              </>
                            )}
                          </div>
                        </div>

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
                                  Accept
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
                                Update
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

          {/* No Regions Alert */}
          {regions.length === 0 && (
            <Card className="border-0 shadow-lg mt-6 bg-amber-50 border-l-4 border-l-amber-500">
              <CardContent className="py-4 md:py-6 px-4 md:px-6">
                <div className="flex flex-col md:flex-row items-start gap-3 md:gap-4">
                  <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-amber-600 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm md:text-base text-amber-900 mb-2">No Active Regions</h3>
                    <p className="text-xs md:text-sm text-amber-800 mb-3 md:mb-4">
                      You need to create regional operations before you can assign orders. Set up your first region to get started.
                    </p>
                    <Link href="/admin/regions" className="inline-block">
                      <Button className="bg-amber-600 hover:bg-amber-700 text-white w-full sm:w-auto" size="sm">
                        <Building2 className="w-4 h-4 mr-2" />
                        Create First Region
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Assignment Dialog - Mobile Optimized */}
        <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="text-lg md:text-xl">Assign Order to Region</DialogTitle>
              <DialogDescription className="text-sm">
                Select which regional operation will fulfill this order
              </DialogDescription>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-3 md:space-y-4 py-2 overflow-y-auto flex-1">
                <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Order ID:</span>
                    <span className="font-mono font-semibold text-xs">{selectedOrder.id}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Client:</span>
                    <span className="font-semibold truncate ml-2 max-w-[60%] text-right">{selectedOrder.client}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Event Date:</span>
                    <span className="font-semibold">{selectedOrder.date}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Location:</span>
                    <span className="font-semibold truncate ml-2 max-w-[60%] text-right">{selectedOrder.location}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Value:</span>
                    <span className="font-semibold text-green-600">R{selectedOrder.total.toLocaleString()}</span>
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

                <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 flex-shrink-0">
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

        <Footer />
      </div>
    </>
  );
}
