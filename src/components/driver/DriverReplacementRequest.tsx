import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, UserX, Users } from "lucide-react";
import { driverReplacementService } from "@/services/driverReplacementService";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface DriverReplacementRequestProps {
  orderId: string;
  orderNumber: string;
  eventDate: string;
  eventTime: string;
}

export function DriverReplacementRequest({ orderId, orderNumber, eventDate, eventTime }: DriverReplacementRequestProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !reason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for the replacement request",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      await driverReplacementService.createReplacementRequest(
        orderId,
        user.id,
        reason
      );

      toast({
        title: "✅ Request Sent!",
        description: "Your replacement request has been sent to other drivers and admin",
      });

      setOpen(false);
      setReason("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit replacement request",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Card className="border-2 border-orange-200 hover:border-orange-400 cursor-pointer transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <UserX className="h-5 w-5" />
              Can't Make It?
            </CardTitle>
            <CardDescription>
              Request a replacement driver for this order
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full border-orange-400 text-orange-600 hover:bg-orange-50">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Request Replacement
            </Button>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-orange-600" />
            Request Driver Replacement
          </DialogTitle>
          <DialogDescription>
            Order #{orderNumber} - {eventDate} at {eventTime}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Replacement *</Label>
            <Textarea
              id="reason"
              placeholder="Please explain why you need a replacement (e.g., vehicle breakdown, family emergency, illness)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>
          <div className="rounded-lg bg-orange-50 border border-orange-200 p-4">
            <p className="text-sm text-orange-800 font-medium mb-2">
              📢 What happens next:
            </p>
            <ul className="text-sm text-orange-700 space-y-1 list-disc list-inside">
              <li>All available drivers will be notified</li>
              <li>Admin will be alerted immediately</li>
              <li>First driver to accept gets the job</li>
              <li>You'll be notified of the outcome</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={submitting || !reason.trim()}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {submitting ? "Submitting..." : "Send Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
