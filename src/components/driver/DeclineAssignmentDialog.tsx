/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const REASONS = [
  { key: "Vehicle issue",       helper: "Breakdown, no fuel, mechanical problem." },
  { key: "Sick / unavailable",  helper: "Can't drive today, family emergency, etc." },
  { key: "Schedule conflict",   helper: "Already assigned an overlapping job." },
  { key: "Distance too far",    helper: "Outside normal area, not feasible from current location." },
  { key: "Unsafe area",         helper: "Concerns about delivering to this venue." },
  { key: "Other",               helper: "Use the note field to explain." },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ID of the driver_assignments row to update. */
  assignmentId: string;
  driverId: string;
  orderId: string;
  clientName?: string;
  onDeclined?: () => void;
}

/**
 * Driver declines an assignment with a reason. Updates driver_assignments
 * status='rejected' + rejection_reason. Also clears orders.assigned_driver_id
 * so the dispatcher's queue picks the order back up for re-suggestion.
 */
export function DeclineAssignmentDialog({
  open, onOpenChange, assignmentId, driverId, orderId, clientName, onDeclined,
}: Props) {
  const { toast } = useToast();
  const [reasonKey, setReasonKey] = useState(REASONS[0].key);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setReasonKey(REASONS[0].key);
    setNote("");
    setError("");
  }, [open]);

  const handleDecline = async () => {
    if (reasonKey === "Other" && !note.trim()) {
      setError("Please add a note when picking Other.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const composed = note.trim() ? `${reasonKey}: ${note.trim()}` : reasonKey;

      // Update assignment row
      const { error: aErr } = await supabase
        .from("driver_assignments")
        .update({
          status: "rejected",
          rejection_reason: composed,
        })
        .eq("id", assignmentId);
      if (aErr) throw aErr;

      // Free the order so the dispatcher's queue picks it back up
      const { error: oErr } = await supabase
        .from("orders")
        .update({ assigned_driver_id: null, assignment_score: null })
        .eq("id", orderId)
        .eq("assigned_driver_id", driverId); // only clear if this driver still holds it
      if (oErr) throw oErr;

      // Audit row so dispatcher sees the decline in the order's history
      await supabase.from("order_assignment_audit").insert([{
        order_id: orderId,
        from_driver_id: driverId,
        to_driver_id: null,
        performed_by: driverId,
        reason: `Declined: ${composed}`,
        // company_id is required on the audit table; pull it from the order
        company_id: (await supabase.from("orders").select("company_id").eq("id", orderId).maybeSingle()).data?.company_id,
      }]);

      toast({
        title: "Assignment declined",
        description: clientName ? `Dispatcher will re-assign ${clientName}.` : "Dispatcher will re-assign the order.",
      });
      onOpenChange(false);
      onDeclined?.();
    } catch (e: any) {
      setError(e?.message ?? "Could not decline. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <X className="w-5 h-5" />
            Decline assignment{clientName ? ` · ${clientName}` : ""}
          </DialogTitle>
          <p className="text-sm text-slate-500">
            Pick a reason. Dispatcher gets notified and re-assigns. Repeated declines reduce your match score on future orders.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            {REASONS.map(r => (
              <label
                key={r.key}
                className={`flex items-start gap-3 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                  reasonKey === r.key
                    ? "border-red-500 bg-red-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="declineReason"
                  value={r.key}
                  checked={reasonKey === r.key}
                  onChange={() => setReasonKey(r.key)}
                  className="mt-0.5 accent-red-600"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{r.key}</p>
                  <p className="text-xs text-slate-500">{r.helper}</p>
                </div>
              </label>
            ))}
          </div>

          <div>
            <Label htmlFor="decline_note">Note {reasonKey === "Other" ? "(required)" : "(optional)"}</Label>
            <Input
              id="decline_note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add detail dispatcher should know"
              className="mt-1"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleDecline} disabled={saving}>
            {saving ? "Declining..." : "Confirm decline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
