import { useState } from "react";
import { CheckCircle, XCircle, Camera, PenTool, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { confirmDelivery, updateDeliveryStatus } from "@/services/driver/deliveryManagement";
import { notificationService } from "@/services/notificationService";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface DeliveryStatusModalProps {
  open: boolean;
  onClose: () => void;
  onStatusUpdated: () => void;
  deliveryId: string;
  stopName: string;
}

const FAILURE_REASONS = [
  { value: "client_not_available", label: "Client Not Available" },
  { value: "wrong_address", label: "Wrong Address" },
  { value: "client_refused", label: "Client Refused Delivery" },
  { value: "access_denied", label: "Access to Venue Denied" },
  { value: "equipment_issue", label: "Equipment Issue" },
  { value: "weather_conditions", label: "Weather Conditions" },
  { value: "other", label: "Other Reason" },
];

export function DeliveryStatusModal({ 
  open, 
  onClose, 
  onStatusUpdated,
  deliveryId,
  stopName 
}: DeliveryStatusModalProps) {
  const { toast } = useToast();
  // deliveryId is actually the ORDER id (route stops are built from
  // orders). The old code PATCHed the legacy `deliveries` table keyed by
  // this id, which has no row -> 406. We now drive the canonical order
  // workflow, which needs the acting driver's id.
  const { user } = useAuth();
  const [status, setStatus] = useState<"completed" | "failed">("completed");
  const [failureReason, setFailureReason] = useState("");
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (status === "failed" && !failureReason) {
      toast({
        title: "Missing Information",
        description: "Please select a reason for the failed delivery",
        variant: "destructive",
      });
      return;
    }

    const driverId = user?.id;
    if (!driverId) {
      toast({
        title: "Not signed in",
        description: "Your session expired. Sign in again and retry.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Build notes with failure reason if applicable
      let finalNotes = notes;
      if (status === "failed" && failureReason) {
        const reasonLabel = FAILURE_REASONS.find(r => r.value === failureReason)?.label;
        finalNotes = `Failure Reason: ${reasonLabel}\n${notes}`;
      }

      // Canonical path. Read current status so we can satisfy the
      // ready -> in_transit -> delivered transition rule (the order is
      // usually "ready" when the driver reaches the stop; jumping
      // straight to "delivered" is rejected by the state machine).
      const { data: ord } = await supabase
        .from("orders")
        .select("status, user_id, client_name")
        .eq("id", deliveryId)
        .maybeSingle();
      const cur = (ord as any)?.status as string | undefined;

      if (status === "completed") {
        // Move the truck into transit first if it hasn't been already,
        // then confirm with POD photo + signature written to orders.*.
        if (cur && cur !== "in_transit" && cur !== "delivered" && cur !== "completed") {
          const pre = await updateDeliveryStatus(deliveryId, "in_transit", driverId);
          if (!pre.success) throw new Error(pre.error || "Could not start the trip");
        }
        const res = await confirmDelivery(
          deliveryId,
          driverId,
          photoPreview || undefined,
          signature || undefined,
          finalNotes || undefined,
          signature || undefined,
        );
        if (!res.success) throw new Error(res.error || "Could not confirm delivery");
      } else {
        // Failed delivery: there is no "failed" order status, so we don't
        // flip the order. Alert dispatch (the order owner) with the
        // reason + a deep link so they can re-dispatch or call the client.
        const ownerId = (ord as any)?.user_id;
        if (ownerId) {
          await notificationService.createNotification({
            recipient_id: ownerId,
            user_id: ownerId,
            notification_type: "delivery_failed",
            title: "Delivery failed",
            message: `${stopName}: ${finalNotes || "Driver reported a failed delivery."}`,
            priority: "high",
            link: `/order/${deliveryId}?role=admin`,
            related_entity_type: "order",
            related_entity_id: deliveryId,
          } as any);
        }
      }

      toast({
        title: status === "completed" ? "Delivery Completed! ✅" : "Status Updated",
        description: status === "completed" 
          ? `${stopName} marked as delivered successfully`
          : `${stopName} marked as failed - dispatch will be notified`,
      });

      onStatusUpdated();
      onClose();
    } catch (error) {
      console.error("Error updating delivery status:", error);
      toast({
        title: "Error",
        description: "Failed to update delivery status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Delivery Status</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Selection */}
          <div className="space-y-3">
            <Label>Delivery Status</Label>
            <div className="grid grid-cols-2 gap-3">
              <Card 
                className={`cursor-pointer transition-all ${
                  status === "completed" 
                    ? "border-green-500 bg-green-50 ring-2 ring-green-200" 
                    : "border-slate-200 hover:border-slate-300"
                }`}
                onClick={() => setStatus("completed")}
              >
                <CardContent className="p-4 text-center">
                  <CheckCircle className={`w-8 h-8 mx-auto mb-2 ${
                    status === "completed" ? "text-green-600" : "text-slate-400"
                  }`} />
                  <p className={`font-semibold ${
                    status === "completed" ? "text-green-900" : "text-slate-600"
                  }`}>
                    Completed
                  </p>
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer transition-all ${
                  status === "failed" 
                    ? "border-red-500 bg-red-50 ring-2 ring-red-200" 
                    : "border-slate-200 hover:border-slate-300"
                }`}
                onClick={() => setStatus("failed")}
              >
                <CardContent className="p-4 text-center">
                  <XCircle className={`w-8 h-8 mx-auto mb-2 ${
                    status === "failed" ? "text-red-600" : "text-slate-400"
                  }`} />
                  <p className={`font-semibold ${
                    status === "failed" ? "text-red-900" : "text-slate-600"
                  }`}>
                    Failed
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Failure Reason (only for failed status) */}
          {status === "failed" && (
            <div className="space-y-2">
              <Label className="text-red-900">Reason for Failure *</Label>
              <Select value={failureReason} onValueChange={setFailureReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {FAILURE_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Additional Notes {status === "failed" && "*"}</Label>
            <Textarea
              placeholder={
                status === "completed"
                  ? "Add any relevant notes (optional)"
                  : "Provide details about the failed delivery"
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Photo Upload (for completed deliveries) */}
          {status === "completed" && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Delivery Photo (Optional)
              </Label>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center">
                {photoPreview ? (
                  <div className="space-y-2">
                    <img 
                      src={photoPreview} 
                      alt="Delivery proof" 
                      className="max-h-48 mx-auto rounded-lg"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview("");
                      }}
                    >
                      Remove Photo
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handlePhotoChange}
                    />
                    <Camera className="w-12 h-12 mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-600">
                      Tap to take/upload photo
                    </p>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Signature (for completed deliveries) */}
          {status === "completed" && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <PenTool className="w-4 h-4" />
                Client Signature (Optional)
              </Label>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-4">
                {signature ? (
                  <div className="space-y-2">
                    <p className="text-sm text-green-600 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Signature captured
                    </p>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSignature("")}
                    >
                      Clear Signature
                    </Button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Input
                      type="text"
                      placeholder="Client's full name"
                      value={signature}
                      onChange={(e) => setSignature(e.target.value)}
                      className="max-w-xs mx-auto"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Enter client's name as signature
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Warning for failed deliveries */}
          {status === "failed" && (
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <div className="text-sm text-amber-900">
                    <p className="font-semibold mb-1">Failed Delivery Notice</p>
                    <p>
                      Dispatch and the client will be notified immediately. 
                      Please ensure all details are accurate.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className={`flex-1 ${
                status === "completed"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {loading ? "Updating..." : status === "completed" ? "Mark Completed" : "Report Failed"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}