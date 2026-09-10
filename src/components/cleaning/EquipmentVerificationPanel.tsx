import { useState, useEffect } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
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
import { supabase } from "@/integrations/supabase/client";
import { equipmentTrackingService } from "@/services/equipmentTrackingService";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { reporterNameFromUser } from "@/lib/damageReporter";

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
  const { toast } = useToast();
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

    // CLN2-B (cleaning deep audit, CLN2-19, P0):
    //
    // Before this fix the loader filtered
    //   data.filter(item => item.order?.user_id === user.id)
    // which compared the ORDER's user_id (= the client who placed
    // the order) to the CURRENT user (= the cleaner). The two never
    // match, so the panel rendered empty for every real cleaner.
    // The verification surface was de facto dead for months.
    //
    // The right scope is company-wide: every handover with
    // to_stage='kitchen' that hasn't been received yet is something
    // the cleaning team needs to verify, regardless of who placed
    // the order. The .eq("company_id", ...) gate replaces the
    // broken JS filter and adds explicit defense-in-depth on top of
    // RLS.

    const companyId = (user as any)?.company_id;
    if (!companyId) return;

    try {
      // The supabase-generated types are stale on equipment_handovers
      // (company_id present in the migration but missing from the
      // local type bundle). Cast to any at the call site to scope
      // the relaxation tightly without disabling type-checking on
      // the rest of the file.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("equipment_handovers")
        .select(`
          *,
          equipment:equipment_id (
            name,
            category,
            replacement_cost
          ),
          order:order_id (
            order_number
          )
        `)
        .eq("company_id", companyId)
        .eq("to_stage", "kitchen")
        .is("received_at", null)
        .order("handover_time", { ascending: false });

      if (error) {
        console.error("Error loading pending verifications:", error);
        return;
      }
      setPendingVerifications(data || []);
    } catch (error) {
      console.error("Error loading pending verifications:", error);
    }
  };

  const handleVerifyEquipment = async (handover: any) => {
    // CLN2-B (CLN2-56): native alert() loses focus and is hard to
    // dismiss with wet hands in a dish area. Toast is non-blocking.
    if (!actualCount) {
      toast({
        title: "Quantity required",
        description: "Enter the actual quantity received before verifying.",
        variant: "destructive",
      });
      return;
    }

    const quantityReceived = parseInt(actualCount, 10);
    const quantitySent = Number(handover.quantity_sent || 0);
    if (!Number.isFinite(quantityReceived) || quantityReceived < 0 || quantityReceived > quantitySent) {
      toast({
        title: "Check the received quantity",
        description: `Received quantity must be between 0 and ${quantitySent}.`,
        variant: "destructive",
      });
      return;
    }
    const hasDiscrepancy = quantityReceived !== handover.quantity_sent;

    if (hasDiscrepancy && !notes.trim()) {
      toast({
        title: "Notes required",
        description: "Briefly explain the discrepancy before saving.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await equipmentTrackingService.confirmHandoverReceipt({
        handoverId: handover.id,
        receivedByUserId: user?.id,
        receivedByName: reporterNameFromUser(user),
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
            unitCost: handover.equipment?.replacement_cost || 0,
            responsibleUserId: user?.id,
            responsibleName: reporterNameFromUser(user),
            description: notes,
          });
        }
      }

      setSelectedHandover(null);
      setActualCount("");
      setNotes("");
      await loadPendingVerifications();
      toast({
        title: "Verified",
        description: hasDiscrepancy
          ? `Saved with discrepancy (${quantityReceived} of ${handover.quantity_sent}).`
          : "Handover received and logged for cleaning.",
      });
    } catch (error) {
      console.error("Error verifying equipment:", error);
      toast({
        title: "Could not verify",
        description: dbErrorMessage(error, { entity: "equipment", fallback: "Try again or contact admin." }),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredVerifications = useFuzzyItems(
    pendingVerifications,
    searchTerm,
    [
      { key: ((v: any) => v.equipment?.name || "") as any, weight: 3, label: "equipment_name" },
      { key: ((v: any) => v.order?.order_number || "") as any, weight: 2, label: "order_number" },
      { key: ((v: any) => v.order?.client_name || "") as any, weight: 2, label: "client_name" },
    ],
    { limit: 0 },
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
