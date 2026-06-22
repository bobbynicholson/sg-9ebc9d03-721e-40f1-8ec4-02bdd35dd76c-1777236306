import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Download, Printer, Calendar, MapPin, FileText } from "lucide-react";
import { invoiceService } from "@/services/invoiceService";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { formatLocalDate } from "@/lib/localFormat";

interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  order_number: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "overdue" | "failed";
  payment_method?: string;
  paid_at?: string;
  event_date: string;
  event_location: string;
  /** Line-item breakdown so the client sees WHAT the amount is for (catering
   *  lines + any damage charge), the full total, and a public link to view /
   *  pay the invoice without logging in. */
  items?: Array<{ description?: string; quantity?: number; unitPrice?: number; total?: number }>;
  total?: number;
  subtotal?: number;
  tax_amount?: number;
  public_token?: string | null;
}

interface InvoiceDetailModalProps {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
}

export function InvoiceDetailModal({ invoice, open, onClose }: InvoiceDetailModalProps) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const blob = await invoiceService.generateOrderInvoice(invoice.order_id);
      invoiceService.downloadInvoice(blob, `${invoice.invoice_number}.pdf`);
      toast({
        title: "Success",
        description: "Invoice downloaded successfully",
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Error",
        description: "Failed to download invoice",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Reconciling breakdown - same rule as the public pay page: show the stored
  // line items only when they sum to the total; otherwise collapse to
  // "Catering & services" + any damage lines so the displayed rows always add
  // up to the total (never expose stale line data).
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rawItems = Array.isArray(invoice.items) ? invoice.items : [];
  const invTotal = r2(Number(invoice.total || 0));
  const itemsSum = r2(rawItems.reduce((s, it) => s + Number(it?.total || 0), 0));
  const itemsReconcile = rawItems.length > 0 && Math.abs(itemsSum - invTotal) <= 0.01;
  const damageItems = rawItems.filter((it) => /damage/i.test(String(it?.description || "")));
  const damageSum = r2(damageItems.reduce((s, it) => s + Number(it?.total || 0), 0));
  const breakdownLines: Array<{ description?: string; quantity?: number; unitPrice?: number; total?: number }> =
    itemsReconcile
      ? rawItems
      : rawItems.length > 0
        ? [{ description: `Catering & services (${invoice.order_number})`, total: r2(invTotal - damageSum) }, ...damageItems]
        : [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Invoice Details
          </DialogTitle>
          <DialogDescription>
            View and manage invoice {invoice.invoice_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Invoice Header */}
          <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">{invoice.invoice_number}</h3>
                <p className="text-sm text-slate-600 mt-1">Order: {invoice.order_number}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-600">Invoice Date</p>
                <p className="font-semibold text-slate-900">
                  {formatLocalDate(invoice.invoice_date)}
                </p>
              </div>
            </div>
          </div>

          {/* Event Details */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-3">Event Details</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-slate-500" />
                <span className="text-slate-600">Event Date:</span>
                <span className="font-medium text-slate-900">
                  {formatLocalDate(invoice.event_date)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-slate-500" />
                <span className="text-slate-600">Location:</span>
                <span className="font-medium text-slate-900">{invoice.event_location}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Itemised breakdown - what the amount is for. Mirrors the public
              pay page so the client sees catering lines + any damage charge
              (highlighted) summing to the total, instead of a bare amount. */}
          {breakdownLines.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-3">What this is for</h4>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <ul className="divide-y divide-slate-100">
                  {breakdownLines.map((it, i) => {
                    const isDamage = /damage/i.test(String(it?.description || ""));
                    return (
                      <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className={isDamage ? "text-rose-700 font-medium" : "text-slate-800"}>
                            {it?.description || "Item"}
                          </p>
                          {Number(it?.quantity) > 0 && Number(it?.unitPrice) > 0 && (
                            <p className="text-[11px] text-slate-500">
                              {it.quantity} × {invoice.currency}{Number(it.unitPrice).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <p className="text-slate-900 tabular-nums font-medium whitespace-nowrap">
                          {invoice.currency}{Number(it?.total || 0).toLocaleString()}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 space-y-1 text-sm">
                  {itemsReconcile && Number(invoice.tax_amount) > 0 && (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{invoice.currency}{Number(invoice.subtotal || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>VAT</span>
                        <span className="tabular-nums">{invoice.currency}{Number(invoice.tax_amount || 0).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-semibold text-slate-900">
                    <span>Total</span>
                    <span className="tabular-nums">{invoice.currency}{Number(invoice.total || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payment Details */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-3">Payment Details</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-600">Amount</span>
                <span className="text-2xl font-bold text-slate-900">
                  {invoice.currency}{invoice.amount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-600">Due Date</span>
                <span className="font-semibold text-slate-900">
                  {formatLocalDate(invoice.due_date)}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-600">Status</span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    invoice.status === "paid"
                      ? "bg-green-100 text-green-800"
                      : invoice.status === "overdue"
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </span>
              </div>
              {invoice.paid_at && (
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                  <span className="text-green-700">Payment Date</span>
                  <span className="font-semibold text-green-800">
                    {formatLocalDate(invoice.paid_at)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDownload}
              disabled={downloading}
            >
              <Download className="w-4 h-4 mr-2" />
              {downloading ? "Downloading..." : "Download PDF"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
            {invoice.public_token && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.open(`/pay/i/${invoice.public_token}`, "_blank", "noopener")}
              >
                <FileText className="w-4 h-4 mr-2" />
                View full invoice
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}