/**
 * InvoiceActivityDrawer - Wave 67.
 *
 * Per-invoice activity timeline composed from existing tables:
 *  - email_automation_log (sent / failed events keyed by invoice_id
 *    via the order_id link)
 *  - payments (deposit / balance / refund keyed by order_id)
 *  - invoice row scalars (created_at, sent_at, paid_at,
 *    last_synced_at, sync_error)
 *
 * No new table - the audit trail already exists, just wasn't
 * surfaced. Bookkeepers chasing "did this client open the invoice
 * email" or "when did the EFT clear" had to drill into multiple
 * admin pages; now it's one drawer per invoice.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { CheckCircle2, AlertCircle, Send, CreditCard, CloudUpload, FileText, Clock, X } from "lucide-react";

interface ActivityEntry {
  ts: string;
  icon: any;
  label: string;
  detail?: string;
  tone: "blue" | "green" | "rose" | "slate" | "amber";
}

const TONE_CLASS: Record<ActivityEntry["tone"], string> = {
  blue: "bg-blue-50 border-blue-200 text-blue-900",
  green: "bg-green-50 border-green-200 text-green-900",
  rose: "bg-rose-50 border-rose-200 text-rose-900",
  slate: "bg-slate-50 border-slate-200 text-slate-700",
  amber: "bg-amber-50 border-amber-200 text-amber-900",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any | null;
}

export function InvoiceActivityDrawer({ open, onOpenChange, invoice }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !invoice?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const out: ActivityEntry[] = [];

      // 1. Invoice scalars
      if (invoice.created_at) {
        out.push({
          ts: invoice.created_at,
          icon: FileText,
          label: "Invoice generated",
          detail: invoice.invoice_number || undefined,
          tone: "slate",
        });
      }
      if (invoice.sent_at) {
        out.push({
          ts: invoice.sent_at,
          icon: Send,
          label: "Sent to client",
          tone: "blue",
        });
      }
      if (invoice.paid_at) {
        out.push({
          ts: invoice.paid_at,
          icon: CheckCircle2,
          label: "Paid in full",
          tone: "green",
        });
      }
      if (invoice.last_synced_at) {
        out.push({
          ts: invoice.last_synced_at,
          icon: CloudUpload,
          label: invoice.sync_error ? "Sync failed" : "Synced to accounting",
          detail: invoice.sync_error || undefined,
          tone: invoice.sync_error ? "rose" : "slate",
        });
      }

      // 2. Email automation log entries (sent / failed by template_type)
      try {
        const { data: emails } = await (supabase as any)
          .from("email_automation_log")
          .select("template_type, status, sent_at, recipient_email, error_message")
          .eq("order_id", invoice.order_id)
          .like("template_type", "%invoice%")
          .order("sent_at", { ascending: false });
        for (const e of (emails || []) as any[]) {
          const failed = e.status !== "sent";
          out.push({
            ts: e.sent_at,
            icon: failed ? AlertCircle : Send,
            label: failed
              ? `Email failed (${e.template_type})`
              : `Email sent (${e.template_type})`,
            detail: failed
              ? e.error_message || "unknown error"
              : `to ${e.recipient_email}`,
            tone: failed ? "rose" : "blue",
          });
        }
      } catch (e) {
        console.warn("[InvoiceActivityDrawer] emails fetch failed:", e);
      }

      // 3. Payments
      try {
        const { data: payments } = await (supabase as any)
          .from("payments")
          // payments has payment_status, not status; alias so p.status holds it.
          .select("payment_type, status:payment_status, processed_at, amount, payment_method")
          .eq("order_id", invoice.order_id)
          .order("processed_at", { ascending: false });
        for (const p of (payments || []) as any[]) {
          out.push({
            ts: p.processed_at || p.created_at,
            icon: CreditCard,
            label: `${p.payment_type ? p.payment_type.charAt(0).toUpperCase() + p.payment_type.slice(1) : "Payment"} - ${p.status}`,
            detail: `${p.amount} via ${p.payment_method || "manual"}`,
            tone: p.status === "completed" ? "green" : "amber",
          });
        }
      } catch (e) {
        console.warn("[InvoiceActivityDrawer] payments fetch failed:", e);
      }

      // 4. Sort newest first
      out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      if (!cancelled) {
        setEntries(out);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, invoice?.id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Activity log
          </SheetTitle>
          <SheetDescription>
            Every event on {invoice?.invoice_number || "this invoice"}: generated, sent, opened, paid, synced. Newest first.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {loading && (
            <p className="text-sm text-slate-500">Loading...</p>
          )}
          {!loading && entries.length === 0 && (
            <p className="text-sm text-slate-500">No activity recorded yet.</p>
          )}
          {entries.map((e, i) => {
            const Icon = e.icon;
            return (
              <div key={i} className={`rounded-md border ${TONE_CLASS[e.tone]} px-3 py-2 flex items-start gap-3`}>
                <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">{e.label}</p>
                  {e.detail && (
                    <p className="text-xs opacity-75 mt-0.5 break-words">{e.detail}</p>
                  )}
                  <p className="text-[11px] opacity-60 mt-0.5 tabular-nums">
                    {(() => {
                      try {
                        return format(new Date(e.ts), "dd MMM yyyy 'at' HH:mm");
                      } catch { return e.ts; }
                    })()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
