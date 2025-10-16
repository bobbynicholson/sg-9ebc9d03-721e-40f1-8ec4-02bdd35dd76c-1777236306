import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  CheckCircle2, 
  AlertTriangle, 
  Package, 
  Loader2,
  Search
} from "lucide-react";
import { equipmentTrackingService } from "@/services/equipmentTrackingService";
import { useAuth } from "@/contexts/AuthContext";

interface VerificationItem {
  handoverId: string;
  equipmentName: string;
  expectedQuantity: number;
  actualQuantity: number;
  verified: boolean;
  hasDiscrepancy: boolean;
}

export function EquipmentVerificationPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [pendingVerifications, setPendingVerifications] = useState<any[]>([]);
  const [selectedHandover, setSelectedHandover] = useState<string | null>(null);
  const [actualCount, setActualCount] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadPendingVerifications();
  }, [user]);

  const loadPendingVerifications = async () => {
    if (!user) return;
    
    try {
      // Load handovers that are returning to kitchen (not yet verified)
      const { data } = await supabase
        .from("equipment_handovers")
        .select(`
          *,
          equipment:equipment_id (
            name,
            category
          ),
          order:order_id (
            order_number,
            user_id
          )
        `)
        .eq("to_stage", "kitchen")
        .is("received_at", null)
        .order("handed_at", { ascending: false });

      if (data) {
        const filtered = data.filter((item: any) => item.order?.user_id === user.id);
        setPendingVerifications(filtered);
      }
    } catch (error) {
      console.error("Error loading pending verifications:", error);
    }
  };

  const handleVerifyEquipment = async (handover: any) => {
    if (!actualCount) {
      alert("Please enter the actual quantity received");
      return;
    }

    const quantityReceived = parseInt(actualCount);
    const hasDiscrepancy = quantityReceived !== handover.quantity_sent;

    if (hasDiscrepancy && !notes.trim()) {
      alert("Please provide notes explaining the discrepancy");
      return;
    }

    setLoading(true);
    try {
      await equipmentTrackingService.confirmHandoverReceipt({
        handoverId: handover.id,
        receivedByName: user?.email || "Cleaning Team",
        quantityReceived,
        discrepancyReason: hasDiscrepancy ? notes : undefined,
      });

      // If there's damage, create cleaning status
      if (quantityReceived > 0) {
        await equipmentTrackingService.createCleaningStatus({
          orderId: handover.order_id,
          equipmentId: handover.equipment_id,
          returnedQuantity: quantityReceived,
        });
      }

      // Report damage if discrepancy
      if (hasDiscrepancy) {
        const damagedQuantity = handover.quantity_sent - quantityReceived;
        if (damagedQuantity > 0) {
          await equipmentTrackingService.reportDamage({
            orderId: handover.order_id,
            equipmentId: handover.equipment_id,
            handoverId: handover.id,
            quantityDamaged: damagedQuantity,
            damageType: "lost",
            damageStage: "return",
            unitCost: handover.equipment?.unit_cost || 0,
            description: notes,
          });
        }
      }

      setSelectedHandover(null);
      setActualCount("");
      setNotes("");
      await loadPendingVerifications();
    } catch (error) {
      console.error("Error verifying equipment:", error);
      alert("Failed to verify equipment");
    } finally {
      setLoading(false);
    }
  };

  const filteredVerifications = pendingVerifications.filter((v) =>
    v.equipment?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.order?.order_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Equipment Verification
        </CardTitle>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search equipment or order..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {filteredVerifications.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No Pending Verifications</p>
            <p className="text-sm">All equipment returns have been verified</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredVerifications.map((handover) => (
              <Card key={handover.id} className="border-2">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold">{handover.equipment?.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Order: {handover.order?.order_number}
                        </p>
                      </div>
                      <Badge variant="outline">
                        Expected: {handover.quantity_sent}
                      </Badge>
                    </div>

                    {selectedHandover === handover.id ? (
                      <div className="space-y-3 pt-3 border-t">
                        <div className="grid gap-2">
                          <Label htmlFor={`quantity-${handover.id}`}>
                            Actual Quantity Received
                          </Label>
                          <Input
                            id={`quantity-${handover.id}`}
                            type="number"
                            value={actualCount}
                            onChange={(e) => setActualCount(e.target.value)}
                            placeholder="Enter count"
                            min="0"
                            max={handover.quantity_sent}
                          />
                        </div>

                        {actualCount && parseInt(actualCount) !== handover.quantity_sent && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-amber-600">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="text-sm font-medium">
                                Discrepancy Detected
                              </span>
                            </div>
                            <Textarea
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              placeholder="Explain what happened (required for discrepancies)..."
                              rows={3}
                            />
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleVerifyEquipment(handover)}
                            disabled={loading || !actualCount}
                            className="flex-1 gap-2"
                          >
                            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                            <CheckCircle2 className="h-4 w-4" />
                            Confirm Verification
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelectedHandover(null);
                              setActualCount("");
                              setNotes("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setSelectedHandover(handover.id)}
                        className="w-full"
                        variant="outline"
                      >
                        Verify Count
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
