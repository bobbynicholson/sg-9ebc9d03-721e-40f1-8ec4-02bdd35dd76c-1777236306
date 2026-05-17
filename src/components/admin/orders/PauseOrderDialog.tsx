/**
 * PauseOrderDialog -- captures the pause reason + optional expected
 * resume date before suspending an active order. Mirrors
 * CancelOrderDialog discipline: predefined category + free-text
 * reason + clear preview of what's about to happen, so the operator
 * never wonders what they're committing to.
 *
 * Calls POST /api/orders/[id]/pause which runs the full pauseOrder
 * cascade (status flip + email queue suspend + prep tasks
 * soft-delete + audit log).
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pause } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { emitOrderUpdated } from "@/lib/events/orderEvents";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string | null;
  orderNumber?: string | null;
  clientName?: string | null;
  onPaused?: () => void;
}

const REASON_OPTIONS = [
  { value: "client_pause",        label: "Client asked us to hold" },
  { value: "awaiting_headcount",  label: "Awaiting final guest count" },
  { value: "venue_change",        label: "Venue is being reconsidered" },
  { value: "date_change",         label: "Date may move" },
  { value: "awaiting_payment",    label: "Awaiting deposit / payment" },
  { value: "other",               label: "Other" },
];

export function PauseOrderDialog({ open, onOpenChange, orderId, orderNumber, clientName, onPaused }: Props) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reasonCategory, setReasonCategory] = useState("client_pause");
  const [reason, setReason] = useState("");
  const [expectedResume, setExpectedResume] = useState("");

  useEffect(() => {
    if (!open) {
      setReasonCategory("client_pause");
      setReason("");
      setExpectedResume("");
      setError("");
    }
  }, [open]);

  const submit = async () => {
    if (!orderId) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/orders/${orderId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason_category: reasonCategory,
          reason: reason.trim() || undefined,
          expected_resume_date: expectedResume || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || `HTTP ${res.status}`);
        return;
      }
      toast({
        title: "Order paused",
        description: `${orderNumber || "Order"} is on hold. Reminders + kitchen prep are suspended; one click to resume.`,
      });
      // Wave 70.40 -- pause flips status + suspends prep + kills
      // email queue; ping every surface.
      if (orderId) emitOrderUpdated(orderId, "pause-dialog:confirm", ["status", "prep"]);
      onOpenChange(false);
      if (onPaused) onPaused();
    } catch (e: any) {
      setError(e?.message || "Pause failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pause className="w-5 h-5 text-blue-600" />
            Pause {clientName || "this order"}?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs text-blue-900 space-y-1">
            <p className="font-semibold uppercase tracking-wide">What pause does</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Status flips to <span className="font-mono">paused</span>; resume returns to the previous status</li>
              <li>Pre-event reminder emails suspended in place</li>
              <li>Kitchen prep tasks hidden from chef views</li>
              <li>Revenue + diary capacity stay counted (still booked, just dormant)</li>
              <li>Deposit invoice unchanged -- void manually if no payment was made</li>
            </ul>
          </div>

          <div>
            <Label className="text-sm">Reason category</Label>
            <Select value={reasonCategory} onValueChange={setReasonCategory}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm">Notes (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What did the client say? Anything the kitchen needs to know on resume?"
              rows={3}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-sm">Expected resume date (optional)</Label>
            <Input
              type="date"
              value={expectedResume}
              onChange={(e) => setExpectedResume(e.target.value)}
              className="mt-1"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Used by the dashboard to flag stale pauses (paused longer than expected).
            </p>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
            {submitting ? "Pausing..." : "Pause order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
