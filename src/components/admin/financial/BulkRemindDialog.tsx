/**
 * Bulk payment-reminder dialog. Extracted from financial-dashboard
 * (FIN-C) so the cashflow-dashboard Quick Actions card can fire the
 * same flow. Pre-CASH-D the "Chase unpaid invoices" Quick Action
 * was a verb that only navigated; now it opens this dialog and
 * actually sends reminders.
 *
 * The dialog is a controlled component: parent owns open state.
 * Calls POST /api/admin/invoices/bulk-remind with the chosen scope
 * and surfaces sent / skipped / failed counts in a toast.
 *
 * Scope:
 *   overdue     - invoices past due_date (safer default)
 *   outstanding - every sent / partially_paid / overdue invoice
 */
import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export type BulkRemindScope = "outstanding" | "overdue";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Defaults to "overdue" - the safer, narrower scope. */
  initialScope?: BulkRemindScope;
}

export function BulkRemindDialog({ open, onOpenChange, initialScope = "overdue" }: Props) {
  const { toast } = useToast();
  const [scope, setScope] = useState<BulkRemindScope>(initialScope);
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    setSending(true);
    try {
      const r = await fetch("/api/admin/invoices/bulk-remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to send reminders");
      const sent = Number(data?.sent ?? 0);
      const skipped = Number(data?.skipped ?? 0);
      const failed = Number(data?.failed ?? 0);
      toast({
        title: failed > 0 ? "Reminders partly sent" : "Reminders sent",
        description: `${sent} sent, ${skipped} skipped${failed > 0 ? `, ${failed} failed` : ""}. Scope: ${scope}.`,
        variant: failed > 0 ? "destructive" : "default",
      });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Couldn't send reminders",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }, [scope, toast, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send payment reminders</DialogTitle>
          <DialogDescription>
            Fires a per-tenant branded email to every client with an
            invoice in the chosen scope. Each send is logged in the
            email automation log and respects the suppression list.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setScope("overdue")}
            className={`w-full text-left rounded-md border p-3 transition ${
              scope === "overdue"
                ? "border-purple-500 bg-purple-50"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <p className="font-medium text-slate-900">Overdue only</p>
            <p className="text-xs text-slate-500">
              Invoices past their due date. Safer default - only chases clients who&apos;ve actually missed the deadline.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setScope("outstanding")}
            className={`w-full text-left rounded-md border p-3 transition ${
              scope === "outstanding"
                ? "border-purple-500 bg-purple-50"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <p className="font-medium text-slate-900">All outstanding</p>
            <p className="text-xs text-slate-500">
              Every sent / partially-paid / overdue invoice. Use when chasing the whole AR book.
            </p>
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? "Sending..." : `Send ${scope} reminders`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
