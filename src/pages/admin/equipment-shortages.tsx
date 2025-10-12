import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { equipmentShortageService } from "@/services/equipmentShortageService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Filter,
  DollarSign,
  Package,
  User,
  Calendar,
  MapPin
} from "lucide-react";

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
      setShortages(data as ShortageFlag[]);
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Equipment Shortage Flags</h1>
          <p className="text-gray-600">Manage and resolve equipment shortage issues</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Pending</p>
                  <p className="text-3xl font-bold text-orange-600">{pendingCount}</p>
                </div>
                <AlertTriangle className="w-10 h-10 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Investigating</p>
                  <p className="text-3xl font-bold text-blue-600">{investigatingCount}</p>
                </div>
                <Clock className="w-10 h-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Resolved</p>
                  <p className="text-3xl font-bold text-green-600">{resolvedCount}</p>
                </div>
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Financial Impact</p>
                  <p className="text-3xl font-bold text-red-600">R{totalFinancialImpact.toFixed(2)}</p>
                </div>
                <DollarSign className="w-10 h-10 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  placeholder="Search by client name, equipment, or order number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by priority" />
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
          </CardContent>
        </Card>

        <div className="space-y-4">
          {filteredShortages.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Shortage Flags Found</h3>
                <p className="text-gray-600">
                  {searchTerm || statusFilter !== "all" || priorityFilter !== "all"
                    ? "Try adjusting your filters"
                    : "All equipment has been returned in full"}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredShortages.map((shortage) => (
              <Card key={shortage.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {shortage.equipment_name}
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            <Badge className={`${getPriorityColor(shortage.priority)} text-white`}>
                              {shortage.priority.toUpperCase()}
                            </Badge>
                            <Badge className={`${getStatusColor(shortage.status)} text-white`}>
                              {shortage.status.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <User className="w-4 h-4" />
                          <span className="font-medium">Client:</span>
                          <span>{shortage.client_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Package className="w-4 h-4" />
                          <span className="font-medium">Order:</span>
                          <span>{shortage.order?.order_number || "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span className="font-medium">Event Date:</span>
                          <span>{shortage.order?.event_date ? new Date(shortage.order.event_date).toLocaleDateString() : "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="font-medium">Shortage:</span>
                          <span className="text-red-600 font-semibold">
                            {shortage.shortage_quantity} of {shortage.expected_quantity} items
                          </span>
                        </div>
                      </div>

                      {shortage.financial_impact && (
                        <div className="flex items-center gap-2 text-sm">
                          <DollarSign className="w-4 h-4 text-red-500" />
                          <span className="font-medium text-gray-600">Financial Impact:</span>
                          <span className="text-red-600 font-semibold">
                            R{Number(shortage.financial_impact).toFixed(2)}
                          </span>
                        </div>
                      )}

                      {shortage.shortage_reason && (
                        <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                          <span className="font-medium">Reason:</span> {shortage.shortage_reason}
                        </div>
                      )}

                      {shortage.admin_notes && (
                        <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded">
                          <span className="font-medium">Admin Notes:</span> {shortage.admin_notes}
                        </div>
                      )}

                      {shortage.status === "resolved" && shortage.resolution_notes && (
                        <div className="text-sm text-gray-600 bg-green-50 p-3 rounded">
                          <span className="font-medium">Resolution:</span> {shortage.resolution_notes}
                          {shortage.resolved_by_profile && (
                            <div className="mt-1 text-xs text-gray-500">
                              Resolved by {shortage.resolved_by_profile.full_name} on{" "}
                              {shortage.resolved_at ? new Date(shortage.resolved_at).toLocaleString() : ""}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 md:min-w-[200px]">
                      {shortage.status === "pending" && (
                        <>
                          <Button
                            onClick={() => handleUpdateStatus(shortage.id, "investigating")}
                            variant="outline"
                            className="w-full"
                          >
                            <Clock className="w-4 h-4 mr-2" />
                            Mark Investigating
                          </Button>
                          <Button
                            onClick={() => {
                              setSelectedShortage(shortage);
                              setResolveDialogOpen(true);
                            }}
                            className="w-full bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
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
                          className="w-full bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Resolve
                        </Button>
                      )}
                      {shortage.status === "resolved" && (
                        <Badge className="bg-green-500 text-white justify-center py-2">
                          <CheckCircle className="w-4 h-4 mr-2" />
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

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Equipment Shortage</DialogTitle>
            <DialogDescription>
              Add resolution notes for this shortage issue. This will mark the issue as resolved.
            </DialogDescription>
          </DialogHeader>

          {selectedShortage && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">Client:</span> {selectedShortage.client_name}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Equipment:</span> {selectedShortage.equipment_name}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Shortage:</span>{" "}
                  <span className="text-red-600 font-semibold">
                    {selectedShortage.shortage_quantity} items
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Resolution Notes *</label>
                <Textarea
                  placeholder="Describe how this issue was resolved (e.g., client paid for missing items, items found and returned, etc.)"
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={4}
                  required
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleResolveShortage}
              disabled={!resolutionNotes.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark as Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
