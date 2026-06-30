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
import { useCallback, useEffect, useState } from "react";
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
import { AlertCircle, Mail, MailX } from "lucide-react";

export type BulkRemindScope = "outstanding" | "overdue";

interface PreviewRow {
  clientName: string;
  balance: number;
  due_date: string | null;
  hasEmail: boolean;
}
interface PreviewState {
  total: number;
  withEmail: number;
  withoutEmail: number;
  preview: PreviewRow[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Defaults to "overdue" - the safer, narrower scope. */
  initialScope?: BulkRemindScope;
}

function fmtRand(n: number) {
  return `R ${n.toFixed(2)}`;
}

export function BulkRemindDialog({ open, onOpenChange, initialScope = "overdue" }: Props) {
  const { toast } = useToast();
  const [scope, setScope] = useState<BulkRemindScope>(initialScope);
  const [sending, setSending] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  // INV-B (invoices follow-ups): fetch a dryRun preview whenever the
  // dialog opens or the operator flips scope. The bulk-remind
  // endpoint runs the same filter + email resolution it would on
  // send, and returns counts + the first 5 recipients. Pre-INV-B
  // the invoices page fired a confirm() with no recipient context
  // and the operator only learned the count from the post-send
  // toast.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setPreviewLoading(true);
    void fetch("/api/admin/invoices/bulk-remind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, dryRun: true }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && data?.dryRun) {
          setPreview({
            total: Number(data.total) || 0,
            withEmail: Number(data.withEmail) || 0,
            withoutEmail: Number(data.withoutEmail) || 0,
            preview: Array.isArray(data.preview) ? data.preview : [],
          });
        } else {
          setPreview({ total: 0, withEmail: 0, withoutEmail: 0, preview: [] });
        }
      })
      .catch(() => { if (!cancelled) setPreview({ total: 0, withEmail: 0, withoutEmail: 0, preview: [] }); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [open, scope]);

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
                ? "border-slate-500 bg-slate-50"
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
                ? "border-slate-500 bg-slate-50"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <p className="font-medium text-slate-900">All outstanding</p>
            <p className="text-xs text-slate-500">
              Every sent / partially-paid / overdue invoice. Use when chasing the whole AR book.
            </p>
          </button>
        </div>

        {/* INV-B: recipient preview block. Counts + first 5 names so
            the operator knows what's about to fire BEFORE they
            click Send. Shows skipped-no-email separately because
            that's the surprise number on the post-send toast. */}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
          {previewLoading ? (
            <p className="text-slate-500">Counting recipients...</p>
          ) : !preview ? null : preview.total === 0 ? (
            <p className="text-slate-500 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              No invoices match the {scope} scope. Nothing will be sent.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-semibold text-slate-700">
                  {preview.total} invoice{preview.total === 1 ? "" : "s"} in scope
                </span>
                <span className="tabular-nums text-slate-500">
                  <span className="inline-flex items-center gap-0.5 text-brand-primary"><Mail className="w-3 h-3" /> {preview.withEmail}</span>
                  {preview.withoutEmail > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-amber-700 ml-2"><MailX className="w-3 h-3" /> {preview.withoutEmail} skipped</span>
                  )}
                </span>
              </div>
              <ul className="space-y-0.5 text-slate-700">
                {preview.preview.map((row, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate flex items-center gap-1">
                      {row.hasEmail
                        ? <Mail className="w-3 h-3 text-brand-primary shrink-0" />
                        : <MailX className="w-3 h-3 text-amber-600 shrink-0" />}
                      <span className="truncate" title={row.clientName}>{row.clientName}</span>
                    </span>
                    <span className="tabular-nums text-slate-500 shrink-0">{fmtRand(row.balance)}</span>
                  </li>
                ))}
                {preview.total > preview.preview.length && (
                  <li className="text-slate-500 italic pt-0.5">
                    + {preview.total - preview.preview.length} more
                  </li>
                )}
              </ul>
              {preview.withoutEmail > 0 && (
                <p className="text-amber-700 mt-2 flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{preview.withoutEmail} client{preview.withoutEmail === 1 ? " has" : "s have"} no email on file and will be skipped.</span>
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || previewLoading || (preview != null && preview.withEmail === 0)}
          >
            {sending
              ? "Sending..."
              : preview && preview.withEmail > 0
                ? `Send to ${preview.withEmail} client${preview.withEmail === 1 ? "" : "s"}`
                : `Send ${scope} reminders`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
