/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ShortagesPanel -- equipment shortage triage UI.
 *
 * Extracted from /admin/equipment-shortages so the same surface can be
 * mounted in the Equipment hub's "Shortages" tab AND keep working as a
 * standalone page for existing bookmarks / notification deep-links.
 *
 * Pure component: no AdminNav / NoIndexMeta / ProtectedRoute wrapping
 * here -- those are page concerns. This is just the content.
 */
import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle, Package, Calendar, Filter, CheckCircle, Clock,
  DollarSign, Search, User,
} from "lucide-react";
import { equipmentShortageService } from "@/services/equipmentShortageService";
import { InfoTooltip } from "@/components/ui/info-tooltip";
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

export function ShortagesPanel() {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const [shortages, setShortages] = useState<ShortageFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShortage, setSelectedShortage] = useState<ShortageFlag | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  useEffect(() => {
    if (user) loadShortages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const preFilteredShortages = useMemo(() => {
    return shortages.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (priorityFilter !== "all" && s.priority !== priorityFilter) return false;
      return true;
    });
  }, [shortages, statusFilter, priorityFilter]);

  const filteredShortages = useFuzzyItems(
    preFilteredShortages,
    searchTerm,
    [
      { key: "client_name" as any, weight: 3 },
      { key: "equipment_name" as any, weight: 2 },
      { key: ((s: ShortageFlag) => s.order?.order_number || "") as any, weight: 2, label: "order_number" },
    ],
    { limit: 0 },
  );

  const loadShortages = async () => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await equipmentShortageService.getShortageFlags(user.company_id);
      setShortages(data.map((flag: any) => ({
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
        status: flag.status as ShortageFlag["status"],
        priority: flag.priority as ShortageFlag["priority"],
        created_at: flag.created_at,
        resolved_at: flag.resolved_at || null,
        equipment: { name: flag.equipment_name || "Unknown Equipment", category: "" },
        order: {
          order_number: "Unknown",
          client_name: flag.client_name || "Unknown",
          event_date: new Date().toISOString(),
        },
      } as ShortageFlag)));
    } catch (error: any) {
      toast({ title: "Could not load shortages", description: error?.message ?? "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResolveShortage = async () => {
    if (!selectedShortage || !user) return;
    try {
      await equipmentShortageService.resolveShortageFlag(
        selectedShortage.id,
        user.id,
        resolutionNotes,
      );
      setResolveDialogOpen(false);
      setResolutionNotes("");
      setSelectedShortage(null);
      loadShortages();
    } catch (error: any) {
      toast({ title: "Could not resolve", description: error?.message ?? "", variant: "destructive" });
    }
  };

  const handleUpdateStatus = async (id: string, status: ShortageFlag["status"]) => {
    if (!user) return;
    try {
      await equipmentShortageService.updateShortageFlag(id, { status });
      loadShortages();
    } catch (error: any) {
      toast({ title: "Could not update", description: error?.message ?? "", variant: "destructive" });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-500";
      case "high":   return "bg-orange-500";
      case "medium": return "bg-yellow-500";
      case "low":    return "bg-blue-500";
      default:       return "bg-gray-500";
    }
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case "resolved":      return "bg-green-500";
      case "investigating": return "bg-blue-500";
      case "pending":       return "bg-orange-500";
      default:              return "bg-gray-500";
    }
  };

  const pendingCount = shortages.filter((s) => s.status === "pending").length;
  const investigatingCount = shortages.filter((s) => s.status === "investigating").length;
  const resolvedCount = shortages.filter((s) => s.status === "resolved").length;
  const totalFinancialImpact = shortages
    .filter((s) => s.status === "pending" && s.financial_impact)
    .reduce((sum, s) => sum + Number(s.financial_impact), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading shortage flags...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Card>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-gray-600 mb-1 flex items-center gap-1">Pending <InfoTooltip content={"Shortage reports waiting for someone to review them."} /></p>
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
                <p className="text-xs md:text-sm text-gray-600 mb-1 flex items-center gap-1">Investigating <InfoTooltip content={"Reports a manager has picked up and is currently working through."} /></p>
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
                <p className="text-xs md:text-sm text-gray-600 mb-1 flex items-center gap-1">Resolved <InfoTooltip content={"Reports that have been closed out and resolved."} /></p>
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
                <p className="text-xs md:text-sm text-gray-600 mb-1 flex items-center gap-1">Impact <InfoTooltip content={"Total rand value tied up in shortages that are still pending."} /></p>
                <p className="text-xl md:text-2xl font-bold text-red-600">R{totalFinancialImpact.toFixed(0)}</p>
              </div>
              <DollarSign className="w-8 h-8 md:w-10 md:h-10 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + filter */}
      <Card className="mb-4 md:mb-6">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by client, equipment, or order..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="text-sm">
                  <Filter className="w-3 h-3 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="text-sm">
                  <Filter className="w-3 h-3 mr-2" />
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
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

      {/* List */}
      <div className="space-y-4">
        {filteredShortages.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center px-4">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No shortage flags found</h3>
              <p className="text-sm text-gray-600">
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
                <div className="space-y-3">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs md:text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <User className="w-3 h-3 flex-shrink-0" />
                      <span className="font-medium">Client:</span>
                      <span className="truncate">{shortage.client_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Package className="w-3 h-3 flex-shrink-0" />
                      <span className="font-medium">Order:</span>
                      <span className="truncate">{shortage.order?.order_number || "N/A"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-3 h-3 flex-shrink-0" />
                      <span className="font-medium">Event:</span>
                      <span>{shortage.order?.event_date ? new Date(shortage.order.event_date).toLocaleDateString("en-ZA") : "N/A"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      <span className="font-medium">Short:</span>
                      <span className="text-red-600 font-semibold">
                        {shortage.shortage_quantity}/{shortage.expected_quantity}
                      </span>
                    </div>
                  </div>

                  {shortage.financial_impact ? (
                    <div className="flex items-center gap-2 text-xs md:text-sm">
                      <DollarSign className="w-3 h-3 text-red-500 flex-shrink-0" />
                      <span className="font-medium text-gray-600">Impact:</span>
                      <span className="text-red-600 font-semibold">R{Number(shortage.financial_impact).toFixed(2)}</span>
                    </div>
                  ) : null}

                  {shortage.shortage_reason ? (
                    <div className="text-xs md:text-sm text-gray-600 bg-gray-50 p-2 rounded">
                      <span className="font-medium">Reason:</span> {shortage.shortage_reason}
                    </div>
                  ) : null}

                  {shortage.status === "resolved" && shortage.resolution_notes ? (
                    <div className="text-xs md:text-sm text-gray-600 bg-green-50 p-2 rounded">
                      <span className="font-medium">Resolution:</span> {shortage.resolution_notes}
                      {shortage.resolved_by_profile && (
                        <div className="mt-1 text-xs text-gray-500">
                          By {shortage.resolved_by_profile.full_name}
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    {shortage.status === "pending" && (
                      <>
                        <Button
                          onClick={() => handleUpdateStatus(shortage.id, "investigating")}
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto text-xs"
                        >
                          <Clock className="w-3 h-3 mr-2" />
                          Mark investigating
                        </Button>
                        <Button
                          onClick={() => { setSelectedShortage(shortage); setResolveDialogOpen(true); }}
                          size="sm"
                          className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-xs"
                        >
                          <CheckCircle className="w-3 h-3 mr-2" />
                          Resolve
                        </Button>
                      </>
                    )}
                    {shortage.status === "investigating" && (
                      <Button
                        onClick={() => { setSelectedShortage(shortage); setResolveDialogOpen(true); }}
                        size="sm"
                        className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-xs"
                      >
                        <CheckCircle className="w-3 h-3 mr-2" />
                        Resolve
                      </Button>
                    )}
                    {shortage.status === "resolved" && (
                      <Badge className="bg-green-500 text-white justify-center py-2 text-xs">
                        <CheckCircle className="w-3 h-3 mr-2" />
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

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resolve equipment shortage</DialogTitle>
            <DialogDescription className="text-sm">
              Add resolution notes for this shortage issue.
            </DialogDescription>
          </DialogHeader>

          {selectedShortage && (
            <div className="space-y-4 py-4">
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Client:</span> {selectedShortage.client_name}</div>
                <div><span className="font-medium">Equipment:</span> {selectedShortage.equipment_name}</div>
                <div>
                  <span className="font-medium">Shortage:</span>{" "}
                  <span className="text-red-600 font-semibold">{selectedShortage.shortage_quantity} items</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Resolution notes *</label>
                <Textarea
                  placeholder="Describe how this issue was resolved..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={4}
                  required
                  className="text-sm"
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
              Mark as resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ShortagesPanel;
