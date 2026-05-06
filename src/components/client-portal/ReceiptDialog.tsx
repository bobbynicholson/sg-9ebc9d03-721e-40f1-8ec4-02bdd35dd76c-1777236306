/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ReceiptDialog -- a print-ready, SARS-aware receipt of payment.
 *
 * Surfaced from two places:
 *   - /client-portal/billing -- a "Download receipt" button on every
 *     row that has at least one completed payment.
 *   - billing/PaymentModal success state -- inline link once an
 *     online card payment lands so the client can grab proof
 *     straight away without having to re-find the row.
 *
 * SARS rule: a VAT-registered business issues a 'tax invoice' that
 * must show its VAT registration number. Otherwise it's a plain
 * 'receipt of payment'. The dialog flips its footer label off the
 * tenant's vat_registered flag.
 *
 * The "Print / Save as PDF" button uses the browser's native print
 * dialog. Print CSS hides every chrome bit (close button, modal
 * backdrop, action bar) so what gets printed is just the receipt
 * card. Same @page { margin: 16mm } pattern as /q/[token].tsx so the
 * PDF reads like printed letterhead.
 *
 * Data is fetched live every time the dialog opens. RLS on payments,
 * invoices, orders and clients already gates the client to their own
 * rows so we don't need a server-side endpoint -- the queries are
 * safe from the browser.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, Printer, Receipt as ReceiptIcon, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────

interface ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  /** Optional companyId hint to skip an extra round-trip when known. */
  companyId?: string | null;
}

interface CompanyLite {
  id: string;
  company_name: string | null;
  vat_registered: boolean | null;
  vat_number: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  logo_url: string | null;
}

interface PaymentLite {
  id: string;
  amount: number;
  payment_date: string | null;
  processed_at: string | null;
  created_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  transaction_id: string | null;
  gateway_transaction_id: string | null;
  payment_status: string | null;
}

interface InvoiceLite {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  amount_paid: number | null;
  balance_due: number;
  order_id: string | null;
  client_id: string;
}

interface OrderLite {
  order_number: string | null;
  event_name: string | null;
  event_date: string | null;
}

interface ClientLite {
  client_name: string | null;
  client_email: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────

const fmtMoney = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 2,
});

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "--";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--";
  return d.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const prettyMethod = (raw: string | null | undefined): string => {
  if (!raw) return "Payment";
  const s = String(raw).toLowerCase();
  if (s === "eft") return "EFT";
  if (s === "card" || s === "credit_card" || s === "online") return "Card";
  if (s === "cash") return "Cash";
  // Replace underscores and capitalise the first letter of each word.
  return s
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
};

// ── Component ─────────────────────────────────────────────────────────

export function ReceiptDialog({
  open,
  onOpenChange,
  invoiceId,
  companyId: companyIdHint,
}: ReceiptDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceLite | null>(null);
  const [order, setOrder] = useState<OrderLite | null>(null);
  const [client, setClient] = useState<ClientLite | null>(null);
  const [company, setCompany] = useState<CompanyLite | null>(null);
  const [payments, setPayments] = useState<PaymentLite[]>([]);

  useEffect(() => {
    if (!open || !invoiceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Pull the invoice + embedded order + client in one round-trip.
        // Embeds rely on the FK relationships exposed via PostgREST.
        const { data: invRow, error: invErr } = await supabase
          .from("invoices")
          .select(
            "id, invoice_number, invoice_date, total_amount, amount_paid, balance_due, order_id, client_id, company_id, " +
              "orders:order_id ( order_number, event_name, event_date ), " +
              "clients:client_id ( client_name, client_email )",
          )
          .eq("id", invoiceId)
          .is("deleted_at", null)
          .maybeSingle();

        if (invErr) throw invErr;
        if (!invRow) throw new Error("Receipt not available -- invoice not found.");

        const inv: InvoiceLite = {
          id: (invRow as any).id,
          invoice_number: (invRow as any).invoice_number,
          invoice_date: (invRow as any).invoice_date,
          total_amount: Number((invRow as any).total_amount || 0),
          amount_paid: (invRow as any).amount_paid != null
            ? Number((invRow as any).amount_paid)
            : null,
          balance_due: Number((invRow as any).balance_due || 0),
          order_id: (invRow as any).order_id || null,
          client_id: (invRow as any).client_id,
        };
        const orderEmbed = (invRow as any).orders || null;
        const clientEmbed = (invRow as any).clients || null;
        const tenantCompanyId =
          companyIdHint || ((invRow as any).company_id as string | null);

        // Payments for this invoice. We accept by-invoice and by-order
        // (the older webhook path stamps order_id only) and dedupe.
        // Only completed payments end up on the receipt -- pending /
        // failed claims have no place on a "this is what you've paid"
        // document.
        const orFilter = inv.order_id
          ? `invoice_id.eq.${inv.id},order_id.eq.${inv.order_id}`
          : `invoice_id.eq.${inv.id}`;
        const { data: payRows, error: payErr } = await supabase
          .from("payments")
          .select(
            "id, amount, payment_date, processed_at, created_at, payment_method, payment_reference, transaction_id, gateway_transaction_id, payment_status",
          )
          .or(orFilter)
          .eq("payment_status", "completed")
          .order("payment_date", { ascending: true });

        if (payErr) throw payErr;
        const seen = new Set<string>();
        const payList: PaymentLite[] = ((payRows as any[]) || [])
          .filter((p) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          })
          .map((p) => ({
            id: p.id,
            amount: Number(p.amount || 0),
            payment_date: p.payment_date || null,
            processed_at: p.processed_at || null,
            created_at: p.created_at || null,
            payment_method: p.payment_method || null,
            payment_reference: p.payment_reference || null,
            transaction_id: p.transaction_id || null,
            gateway_transaction_id: p.gateway_transaction_id || null,
            payment_status: p.payment_status || null,
          }));

        // Tenant header row -- VAT details, address, contact.
        let companyRow: CompanyLite | null = null;
        if (tenantCompanyId) {
          const { data: companyData, error: cErr } = await supabase
            .from("companies")
            .select(
              "id, company_name, vat_registered, vat_number, email, phone, address_line1, address_line2, city, logo_url",
            )
            .eq("id", tenantCompanyId)
            .maybeSingle();
          if (cErr) throw cErr;
          if (companyData) {
            companyRow = companyData as unknown as CompanyLite;
          }
        }

        if (cancelled) return;
        setInvoice(inv);
        setOrder(orderEmbed as OrderLite | null);
        setClient(clientEmbed as ClientLite | null);
        setCompany(companyRow);
        setPayments(payList);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Could not load receipt");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId, companyIdHint]);

  const totalPaid = useMemo(
    () => payments.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0),
    [payments],
  );

  const balance = invoice
    ? Math.max(0, Number(invoice.total_amount || 0) - totalPaid)
    : 0;

  const isVat = !!company?.vat_registered && !!company?.vat_number;
  const documentLabel = isVat ? "Tax invoice" : "Receipt of payment";
  const footerNote = isVat
    ? "This is a tax invoice -- valid SARS document."
    : "Receipt of payment.";

  const companyAddress = [
    company?.address_line1,
    company?.address_line2,
    company?.city,
  ]
    .filter(Boolean)
    .join(", ");

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:shadow-none print:border-none print:p-0"
      >
        {/*
          Print CSS scoped to the dialog. We can't use a <Head> here
          because the dialog can be torn out of the tree any moment;
          inline <style> on the printable region is more durable.
          Hides:
            - The Radix backdrop / overlay (no-print on the dialog
              parent already removes it via Radix's own data attrs,
              but we belt-and-brace with .receipt-no-print)
            - The dialog close X
            - The action bar (Print / Close buttons at the bottom)
          Forces colour rendering so the brand-tinted top row prints
          green / brand instead of washing to white.
        */}
        <style>{`
          @media print {
            html, body { background: white !important; }
            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .receipt-no-print { display: none !important; }
            [data-radix-dialog-overlay] { display: none !important; }
            [data-radix-dialog-content] {
              position: static !important;
              transform: none !important;
              max-width: 100% !important;
              max-height: none !important;
              box-shadow: none !important;
              border: none !important;
              padding: 0 !important;
              inset: auto !important;
            }
            .receipt-print-card {
              border: none !important;
              box-shadow: none !important;
              page-break-inside: avoid;
            }
            @page { margin: 16mm; }
          }
        `}</style>

        <DialogHeader className="receipt-no-print">
          <DialogTitle className="flex items-center gap-2">
            <ReceiptIcon className="w-5 h-5 text-emerald-600" />
            {documentLabel}
          </DialogTitle>
          <DialogDescription>
            {loading
              ? "Loading payment details..."
              : invoice
              ? `For invoice ${invoice.invoice_number}`
              : "Payment details"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading receipt...</span>
          </div>
        ) : error ? (
          <div className="py-10 text-center space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto text-amber-500" />
            <p className="text-sm font-medium text-slate-800">Could not load receipt</p>
            <p className="text-xs text-slate-500">{error}</p>
          </div>
        ) : !invoice ? (
          <div className="py-10 text-center space-y-2">
            <ReceiptIcon className="w-8 h-8 mx-auto text-slate-400" />
            <p className="text-sm font-medium text-slate-800">Nothing to show yet</p>
            <p className="text-xs text-slate-500">
              Once a payment lands, the full receipt will appear here.
            </p>
          </div>
        ) : payments.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <ReceiptIcon className="w-8 h-8 mx-auto text-slate-400" />
            <p className="text-sm font-medium text-slate-800">No completed payments</p>
            <p className="text-xs text-slate-500">
              We'll generate the receipt once your payment is reconciled.
            </p>
          </div>
        ) : (
          <div className="receipt-print-card rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-5">
            {/* Header strip -- tenant identity */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700 font-semibold">
                  {documentLabel}
                </p>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
                  {company?.company_name || "Your caterer"}
                </h2>
                {companyAddress && (
                  <p className="text-xs text-slate-500 mt-1">{companyAddress}</p>
                )}
                {(company?.email || company?.phone) && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {[company?.email, company?.phone].filter(Boolean).join(" · ")}
                  </p>
                )}
                {isVat && (
                  <p className="text-xs text-slate-600 mt-1">
                    VAT Reg No:{" "}
                    <span className="font-mono">{company?.vat_number}</span>
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Invoice
                </p>
                <p className="text-sm font-mono font-semibold text-slate-900">
                  {invoice.invoice_number}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Issued {fmtDate(invoice.invoice_date)}
                </p>
              </div>
            </div>

            <Separator />

            {/* Two-column meta -- billed to + event */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                  Billed to
                </p>
                <p className="text-sm font-semibold text-slate-900">
                  {client?.client_name || "Client"}
                </p>
                {client?.client_email && (
                  <p className="text-xs text-slate-500">{client.client_email}</p>
                )}
              </div>
              {(order?.order_number || order?.event_name || order?.event_date) && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                    Event
                  </p>
                  {order?.event_name && (
                    <p className="text-sm font-semibold text-slate-900">
                      {order.event_name}
                    </p>
                  )}
                  <p className="text-xs text-slate-600">
                    {order?.order_number ? `Order ${order.order_number}` : null}
                    {order?.order_number && order?.event_date ? " · " : null}
                    {order?.event_date ? fmtDate(order.event_date) : null}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Payments list */}
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
                Payments received
              </p>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Date</th>
                      <th className="text-left px-3 py-2 font-semibold">Method</th>
                      <th className="text-left px-3 py-2 font-semibold">Reference</th>
                      <th className="text-right px-3 py-2 font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((p) => {
                      const ref =
                        p.transaction_id ||
                        p.gateway_transaction_id ||
                        p.payment_reference ||
                        "--";
                      const dateIso =
                        p.payment_date || p.processed_at || p.created_at;
                      return (
                        <tr key={p.id} className="text-slate-800">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {fmtDate(dateIso)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {prettyMethod(p.payment_method)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs break-all">
                            {ref}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                            {fmtMoney.format(p.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Invoice total</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {fmtMoney.format(Number(invoice.total_amount || 0))}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Total paid</span>
                <span className="font-semibold text-emerald-700 tabular-nums">
                  {fmtMoney.format(totalPaid)}
                </span>
              </div>
              <div className="flex items-center justify-between text-base pt-1 border-t border-slate-200">
                <span className="font-semibold text-slate-900">Balance remaining</span>
                <span
                  className={`font-bold tabular-nums ${
                    balance > 0 ? "text-amber-700" : "text-emerald-700"
                  }`}
                >
                  {fmtMoney.format(balance)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 text-center pt-2 border-t border-slate-100">
              {footerNote}
            </p>
          </div>
        )}

        {/* Action bar -- screen only */}
        {!loading && !error && invoice && payments.length > 0 && (
          <div className="receipt-no-print flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-700">
              <Printer className="w-4 h-4 mr-2" />
              Print / Save as PDF
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
