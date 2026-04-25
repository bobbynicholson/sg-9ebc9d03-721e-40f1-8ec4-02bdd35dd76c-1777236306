import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  Package,
  TrendingDown,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  ShoppingCart,
  CheckCircle,
  XCircle,
  Clock,
  ArrowLeft,
  DollarSign,
  Search,
  User
} from "lucide-react";
import { equipmentShortageService } from "@/services/equipmentShortageService";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ShortageFlag {
  id: string;
  order_id: string;
  equipment_booking_id: string;
  equipment_id: string;
  client_name: string;
  client_email: string | null;
  equipment_name: string;
  expected_quantity: number;
  returned_quantity: number;
  shortage_quantity: number;
  shortage_reason: string | null;
  status: "pending" | "resolved" | "investigating";
  priority: "low" | "medium" | "high" | "urgent";
  financial_impact: number | null;
  admin_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  order?: {
    order_number: string;
    client_name: string;
    event_date: string;
  };
  equipment?: {
    name: string;
    category: string;
  };
  resolved_by_profile?: {
    full_name: string;
    email: string;
  };
}

export default function EquipmentShortagesPage() {
  const { user } = useAuth();
  const [shortages, setShortages] = useState<ShortageFlag[]>([]);
  const [filteredShortages, setFilteredShortages] = useState<ShortageFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShortage, setSelectedShortage] = useState<ShortageFlag | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  useEffect(() => {
    if (user) {
      loadShortages();
    }
  }, [user]);

  useEffect(() => {
    filterShortages();
  }, [shortages, searchTerm, statusFilter, priorityFilter]);

  const loadShortages = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const data = await equipmentShortageService.getShortageFlags(user.id);
      setShortages(data.map(flag => {
        return {
          id: flag.id,
          order_id: flag.order_id,
          equipment_booking_id: flag.equipment_booking_id || "",
          equipment_id: flag.equipment_id,
          client_name: flag.client_name || "",
          client_email: flag.client_email || "",
          expected_quantity: flag.expected_quantity || 0,
          returned_quantity: flag.returned_quantity || 0,
          shortage_quantity: flag.shortage_quantity,
          equipment_name: flag.equipment_name || "",
          shortage_reason: flag.shortage_reason || "",
          financial_impact: flag.financial_impact || 0,
          admin_notes: flag.admin_notes || "",
          resolution_notes: flag.resolution_notes || "",
          resolved_by: flag.resolved_by || "",
          status: flag.status as "pending" | "resolved",
          priority: flag.priority as "high" | "medium" | "low",
          createdAt: flag.created_at,
          resolvedAt: flag.resolved_at || undefined,
          equipment: {
            name: flag.equipment_name || "Unknown Equipment",
          },
          order: {
            order_number: "Unknown",
            client_name: flag.client_name || "Unknown",
            event_date: new Date().toISOString(),
          }
        } as ShortageFlag;
      }));
    } catch (error) {
      console.error("Error loading shortages:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterShortages = () => {
    let filtered = [...shortages];

    if (searchTerm) {
      filtered = filtered.filter(
        s =>
          s.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.equipment_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.order?.order_number?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(s => s.status === statusFilter);
    }

    if (priorityFilter !== "all") {
      filtered = filtered.filter(s => s.priority === priorityFilter);
    }

    setFilteredShortages(filtered);
  };

  const handleResolveShortage = async () => {
    if (!selectedShortage || !user) return;

    try {
      await equipmentShortageService.resolveShortageFlag(
        selectedShortage.id,
        user.id,
        resolutionNotes
      );

      setResolveDialogOpen(false);
      setResolutionNotes("");
      setSelectedShortage(null);
      loadShortages();
    } catch (error) {
      console.error("Error resolving shortage:", error);
      alert("Failed to resolve shortage");
    }
  };

  const handleUpdateStatus = async (id: string, status: "pending" | "resolved" | "investigating") => {
    if (!user) return;

    try {
      await equipmentShortageService.updateShortageFlag(id, { status });
      loadShortages();
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Failed to update status");
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-500";
      case "high": return "bg-orange-500";
      case "medium": return "bg-yellow-500";
      case "low": return "bg-blue-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "resolved": return "bg-green-500";
      case "investigating": return "bg-blue-500";
      case "pending": return "bg-orange-500";
      default: return "bg-gray-500";
    }
  };

  const pendingCount = shortages.filter(s => s.status === "pending").length;
  const investigatingCount = shortages.filter(s => s.status === "investigating").length;
  const resolvedCount = shortages.filter(s => s.status === "resolved").length;
  const totalFinancialImpact = shortages
    .filter(s => s.status === "pending" && s.financial_impact)
    .reduce((sum, s) => sum + Number(s.financial_impact), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading shortage flags...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Equipment Shortages | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 lg:pl-64">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-6 md:mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1 md:mb-2">Equipment Shortage Flags</h1>
            <p className="text-sm md:text-base text-gray-600">Manage and resolve equipment shortage issues</p>
          </div>

          {/* Stats Cards - Mobile Optimized Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6 mb-6 md:mb-8">
            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm text-gray-600 mb-1">Pending</p>
                    <p className="text-2xl md:text-3xl font-bold text-orange-600">{pendingCount}</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 md:w-10 md:h-10 text-orange-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm text-gray-600 mb-1">Investigating</p>
                    <p className="text-2xl md:text-3xl font-bold text-blue-600">{investigatingCount}</p>
                  </div>
                  <Clock className="w-8 h-8 md:w-10 md:h-10 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm text-gray-600 mb-1">Resolved</p>
                    <p className="text-2xl md:text-3xl font-bold text-green-600">{resolvedCount}</p>
                  </div>
                  <CheckCircle className="w-8 h-8 md:w-10 md:h-10 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm text-gray-600 mb-1">Impact</p>
                    <p className="text-xl md:text-2xl lg:text-3xl font-bold text-red-600">
                      R{totalFinancialImpact.toFixed(0)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 md:w-10 md:h-10 text-red-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search and Filter - Mobile Stacked */}
          <Card className="mb-4 md:mb-6">
            <CardContent className="p-4 md:p-6">
              <div className="flex flex-col gap-3 md:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5" />
                  <Input
                    placeholder="Search by client, equipment, or order..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 md:pl-10 text-sm md:text-base"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 md:gap-4">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="text-sm md:text-base">
                      <Filter className="w-3 h-3 md:w-4 md:h-4 mr-2" />
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="investigating">Investigating</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="text-sm md:text-base">
                      <Filter className="w-3 h-3 md:w-4 md:h-4 mr-2" />
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Shortages List - Mobile Optimized Cards */}
          <div className="space-y-4">
            {filteredShortages.length === 0 ? (
              <Card>
                <CardContent className="py-12 md:py-16 text-center px-4">
                  <Package className="w-12 h-12 md:w-16 md:h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-2">
                    No Shortage Flags Found
                  </h3>
                  <p className="text-sm md:text-base text-gray-600">
                    {searchTerm || statusFilter !== "all" || priorityFilter !== "all"
                      ? "Try adjusting your filters"
                      : "All equipment has been returned in full"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredShortages.map((shortage) => (
                <Card key={shortage.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-4 md:p-6">
                    <div className="space-y-3 md:space-y-4">
                      {/* Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2 truncate">
                            {shortage.equipment_name}
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            <Badge className={`${getPriorityColor(shortage.priority)} text-white text-xs`}>
                              {shortage.priority.toUpperCase()}
                            </Badge>
                            <Badge className={`${getStatusColor(shortage.status)} text-white text-xs`}>
                              {shortage.status.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 text-xs md:text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <User className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                          <span className="font-medium">Client:</span>
                          <span className="truncate">{shortage.client_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Package className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                          <span className="font-medium">Order:</span>
                          <span className="truncate">{shortage.order?.order_number || "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                          <span className="font-medium">Event:</span>
                          <span>{shortage.order?.event_date ? new Date(shortage.order.event_date).toLocaleDateString() : "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                          <span className="font-medium">Short:</span>
                          <span className="text-red-600 font-semibold">
                            {shortage.shortage_quantity}/{shortage.expected_quantity}
                          </span>
                        </div>
                      </div>

                      {shortage.financial_impact && (
                        <div className="flex items-center gap-2 text-xs md:text-sm">
                          <DollarSign className="w-3 h-3 md:w-4 md:h-4 text-red-500 flex-shrink-0" />
                          <span className="font-medium text-gray-600">Impact:</span>
                          <span className="text-red-600 font-semibold">
                            R{Number(shortage.financial_impact).toFixed(2)}
                          </span>
                        </div>
                      )}

                      {shortage.shortage_reason && (
                        <div className="text-xs md:text-sm text-gray-600 bg-gray-50 p-2 md:p-3 rounded">
                          <span className="font-medium">Reason:</span> {shortage.shortage_reason}
                        </div>
                      )}

                      {shortage.status === "resolved" && shortage.resolution_notes && (
                        <div className="text-xs md:text-sm text-gray-600 bg-green-50 p-2 md:p-3 rounded">
                          <span className="font-medium">Resolution:</span> {shortage.resolution_notes}
                          {shortage.resolved_by_profile && (
                            <div className="mt-1 text-xs text-gray-500">
                              By {shortage.resolved_by_profile.full_name}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        {shortage.status === "pending" && (
                          <>
                            <Button
                              onClick={() => handleUpdateStatus(shortage.id, "investigating")}
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto text-xs md:text-sm"
                            >
                              <Clock className="w-3 h-3 md:w-4 md:h-4 mr-2" />
                              Mark Investigating
                            </Button>
                            <Button
                              onClick={() => {
                                setSelectedShortage(shortage);
                                setResolveDialogOpen(true);
                              }}
                              size="sm"
                              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-xs md:text-sm"
                            >
                              <CheckCircle className="w-3 h-3 md:w-4 md:h-4 mr-2" />
                              Resolve
                            </Button>
                          </>
                        )}
                        {shortage.status === "investigating" && (
                          <Button
                            onClick={() => {
                              setSelectedShortage(shortage);
                              setResolveDialogOpen(true);
                            }}
                            size="sm"
                            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-xs md:text-sm"
                          >
                            <CheckCircle className="w-3 h-3 md:w-4 md:h-4 mr-2" />
                            Resolve
                          </Button>
                        )}
                        {shortage.status === "resolved" && (
                          <Badge className="bg-green-500 text-white justify-center py-2 text-xs">
                            <CheckCircle className="w-3 h-3 md:w-4 md:h-4 mr-2" />
                            Resolved
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Resolve Dialog - Mobile Optimized */}
        <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg md:text-xl">Resolve Equipment Shortage</DialogTitle>
              <DialogDescription className="text-sm">
                Add resolution notes for this shortage issue
              </DialogDescription>
            </DialogHeader>

            {selectedShortage && (
              <div className="space-y-4 py-4">
                <div className="space-y-2 text-sm md:text-base">
                  <div>
                    <span className="font-medium">Client:</span> {selectedShortage.client_name}
                  </div>
                  <div>
                    <span className="font-medium">Equipment:</span> {selectedShortage.equipment_name}
                  </div>
                  <div>
                    <span className="font-medium">Shortage:</span>{" "}
                    <span className="text-red-600 font-semibold">
                      {selectedShortage.shortage_quantity} items
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Resolution Notes *</label>
                  <Textarea
                    placeholder="Describe how this issue was resolved..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    rows={4}
                    required
                    className="text-sm md:text-base"
                  />
                </div>
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setResolveDialogOpen(false)} className="w-full sm:w-auto" size="sm">
                Cancel
              </Button>
              <Button
                onClick={handleResolveShortage}
                disabled={!resolutionNotes.trim()}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
                size="sm"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Mark as Resolved
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
