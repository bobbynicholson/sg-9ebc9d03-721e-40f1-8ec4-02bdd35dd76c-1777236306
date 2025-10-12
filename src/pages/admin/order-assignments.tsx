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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowRight,
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
  Users,
  Package
} from "lucide-react";
import { regionManagement } from "@/lib/regionManagement";
import { mockOrders } from "@/lib/mockData";
import { Footer } from "@/components/Footer";

export default function OrderAssignmentsPage() {
  const [orders] = useState(mockOrders);
  const [assignments, setAssignments] = useState(regionManagement.orderAssignments);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

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
      const newAssignment = regionManagement.assignOrderToRegion(
        selectedOrder.id,
        selectedRegion,
        "hq_admin_001",
        assignmentNotes
      );
      setAssignments([...regionManagement.orderAssignments]);
      setIsAssignDialogOpen(false);
      setSelectedOrder(null);
      setSelectedRegion("");
      setAssignmentNotes("");
    }
  };

  const handleStatusUpdate = (orderId: string, status: any) => {
    regionManagement.updateAssignmentStatus(orderId, status);
    setAssignments([...regionManagement.orderAssignments]);
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
        return <CheckCircle className="w-4 h-4" />;
      case "rejected":
        return <XCircle className="w-4 h-4" />;
      case "pending":
        return <Clock className="w-4 h-4" />;
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
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-4xl font-bold text-slate-900 mb-2">Order Assignment Hub</h1>
                <p className="text-slate-600">Assign orders to regional operations for fulfillment</p>
              </div>
              <Link href="/admin/regions">
                <Button variant="outline">
                  <Building2 className="w-5 h-5 mr-2" />
                  Manage Regions
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <AlertCircle className="w-8 h-8" />
                    <div className="text-3xl font-bold">{unassignedCount}</div>
                  </div>
                  <div className="text-amber-100">Unassigned Orders</div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <Clock className="w-8 h-8 text-yellow-500" />
                    <div className="text-3xl font-bold text-slate-900">{pendingCount}</div>
                  </div>
                  <div className="text-slate-600">Pending Acceptance</div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <TrendingUp className="w-8 h-8 text-blue-500" />
                    <div className="text-3xl font-bold text-slate-900">{activeCount}</div>
                  </div>
                  <div className="text-slate-600">In Progress</div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <Building2 className="w-8 h-8 text-purple-500" />
                    <div className="text-3xl font-bold text-slate-900">{regions.length}</div>
                  </div>
                  <div className="text-slate-600">Active Regions</div>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Search orders by client name or order ID..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[200px]">
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

          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b">
              <CardTitle>Orders Requiring Assignment</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Event Date</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Assigned Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const assignment = getAssignmentForOrder(order.id);
                    const region = getRegionForOrder(order.id);
                    
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono font-semibold">{order.id}</TableCell>
                        <TableCell className="font-semibold">{order.client}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            {order.date}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-slate-400" />
                            {order.location}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-slate-400" />
                            <span className="font-semibold">R{order.total.toLocaleString()}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {region ? (
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-purple-500" />
                              <span className="font-semibold">{region.name}</span>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-slate-500">
                              Not Assigned
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {assignment ? (
                            <Badge className={getStatusColor(assignment.status)}>
                              {getStatusIcon(assignment.status)}
                              <span className="ml-1 capitalize">{assignment.status.replace("_", " ")}</span>
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-600 border-amber-300">
                              <AlertCircle className="w-4 h-4 mr-1" />
                              Unassigned
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!assignment || assignment.status === "rejected" ? (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedOrder(order);
                                setIsAssignDialogOpen(true);
                              }}
                              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                            >
                              <Send className="w-4 h-4 mr-1" />
                              Assign
                            </Button>
                          ) : (
                            <div className="flex gap-2 justify-end">
                              {assignment.status === "pending" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStatusUpdate(order.id, "accepted")}
                                >
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
                              >
                                Update
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {filteredOrders.length === 0 && (
                <div className="py-16 text-center">
                  <Package className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">No orders found</h3>
                  <p className="text-slate-600">Try adjusting your search or filters</p>
                </div>
              )}
            </CardContent>
          </Card>

          {regions.length === 0 && (
            <Card className="border-0 shadow-lg mt-6 bg-amber-50 border-l-4 border-l-amber-500">
              <CardContent className="py-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-amber-900 mb-2">No Active Regions</h3>
                    <p className="text-amber-800 mb-4">
                      You need to create regional operations before you can assign orders. Set up your first region to get started.
                    </p>
                    <Link href="/admin/regions">
                      <Button className="bg-amber-600 hover:bg-amber-700 text-white">
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

        <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assign Order to Region</DialogTitle>
              <DialogDescription>
                Select which regional operation will fulfill this order
              </DialogDescription>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-6 py-4">
                <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Order ID:</span>
                    <span className="font-mono font-semibold">{selectedOrder.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Client:</span>
                    <span className="font-semibold">{selectedOrder.client}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Event Date:</span>
                    <span className="font-semibold">{selectedOrder.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Location:</span>
                    <span className="font-semibold">{selectedOrder.location}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Value:</span>
                    <span className="font-semibold text-green-600">R{selectedOrder.total.toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <Label htmlFor="region">Assign to Region</Label>
                  <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                    <SelectTrigger id="region">
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
                  <Label htmlFor="notes">Assignment Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Add any special instructions or notes for the regional team..."
                    value={assignmentNotes}
                    onChange={(e) => setAssignmentNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAssignOrder}
                    disabled={!selectedRegion}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 text-white"
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
