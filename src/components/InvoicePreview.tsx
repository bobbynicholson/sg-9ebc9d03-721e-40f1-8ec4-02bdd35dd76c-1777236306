/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * InvoicePreview - the admin-side modal preview of an invoice.
 *
 * Visual identity mirrors /q/[token] and /pay/i/[token] so a
 * caterer's quote, invoice preview and client-facing payment page
 * read like the same document family. Key shared moves:
 *   - Branded header band tinted with bg-brand-primary/10
 *   - Serif headline (font-serif), tabular-nums for money columns
 *   - Brand-primary accent labels (uppercase tracking-wide)
 *   - Stone palette for body text (stone-900 / stone-600 / stone-500)
 *
 * The component is intentionally read-only - send / download lives
 * in the parent dialog. Items, totals, payment block and notes all
 * render conditionally so a partially-built invoice doesn't show
 * empty cards.
 */
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, MapPin, FileText } from "lucide-react";
import { getOrderPaymentSummary } from "@/lib/paymentStatus";

interface InvoicePreviewProps {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyVAT?: string;
  companyVatRegistered?: boolean;
  companyRegistration?: string;
  companyLogo?: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  clientAddress?: string;
  orderNumber: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  guestCount: number;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  depositPaid: number;
  balanceDue: number;
  paymentTerms: string;
  bankDetails?: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    branchCode: string;
  };
  notes?: string;
  /** TIGHTEN I.82: tenant currency code from companies.currency.
   *  Defaults to ZAR for backward compat with any caller that hasn't
   *  been updated. Customer-facing invoice document so this matters. */
  currencyCode?: string;
}

// TIGHTEN I.82: builder so we can vary the currency per-tenant. The
// previous module-scope constant baked ZAR into every rendered
// invoice; non-ZA tenants saw the wrong symbol on the document they
// actually send their customers.
const buildFmtMoney = (code: string) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: code || "ZAR",
    maximumFractionDigits: 2,
  });

function safeDate(raw: string | null | undefined, fallback = "TBD"): string {
  if (!raw) return fallback;
  try {
    return format(new Date(raw), "d MMMM yyyy");
  } catch {
    return fallback;
  }
}

function companyInitials(name: string | null | undefined): string {
  if (!name) return "C";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function InvoicePreview(props: InvoicePreviewProps) {
  const docTitle = props.companyVatRegistered ? "Tax Invoice" : "Invoice";
  const paymentSummary = getOrderPaymentSummary({
    totalAmount: props.total,
    amountPaid: Math.max(0, props.total - props.balanceDue),
    balanceAmount: props.balanceDue,
  });
  const isPaid = paymentSummary.state === "paid";
  const today = format(new Date(), "d MMMM yyyy");
  const fmtMoney = buildFmtMoney(props.currencyCode || "ZAR");

  return (
    <div className="bg-stone-50 rounded-lg p-4 sm:p-6 max-w-3xl mx-auto">
      {/* BRANDED HEADER - mirrors /q/[token] and /pay/i/[token] */}
      <div className="brand-print bg-brand-primary/10 border border-brand-primary/30 rounded-xl p-6 sm:p-8 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              {props.companyLogo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={props.companyLogo}
                  alt={`${props.companyName} logo`}
                  className="h-10 w-auto max-w-[180px] object-contain"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-white font-bold text-sm">
                  {companyInitials(props.companyName)}
                </div>
              )}
              <p className="text-xs uppercase tracking-[0.2em] text-brand-primary font-bold">
                {props.companyName}
              </p>
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 leading-tight">
              {docTitle}
            </h1>
            {/* Invoice number: bold, small, on its own line under the
                title (owner request Pic 77, 2026-07-04). */}
            <p className="block text-xs font-bold text-brand-primary mt-1 tracking-wider whitespace-nowrap">
              {props.invoiceNumber}
            </p>
            <p className="text-sm text-stone-600 mt-1.5">
              Issued {safeDate(props.invoiceDate, today)} · due {safeDate(props.dueDate)}
            </p>
            {props.companyRegistration && (
              <p className="text-xs text-stone-500 mt-1">
                Reg No: <span className="font-mono">{props.companyRegistration}</span>
              </p>
            )}
            {props.companyVatRegistered && props.companyVAT && (
              <p className="text-xs text-stone-500 mt-0.5">
                VAT Reg No: <span className="font-mono">{props.companyVAT}</span>
              </p>
            )}
          </div>
          {isPaid ? (
            <Badge className="bg-brand-primary text-white border-0 px-3 py-1.5 text-sm">
              {paymentSummary.label}
            </Badge>
          ) : (
            <Badge className="brand-print bg-brand-primary text-white border-0 px-3 py-1.5 text-sm">
              Awaiting payment
            </Badge>
          )}
        </div>
      </div>

      {/* BILL TO + EVENT DETAILS */}
      <Card className="mb-4 border border-stone-200 shadow-sm">
        <CardContent className="py-5 px-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-brand-primary font-bold mb-1.5">
              Bill to
            </p>
            <p className="text-sm font-semibold text-stone-900">{props.clientName}</p>
            {props.clientAddress && (
              <p className="text-xs text-stone-600 mt-0.5">{props.clientAddress}</p>
            )}
            {props.clientEmail && (
              <p className="text-xs text-stone-600">{props.clientEmail}</p>
            )}
            {props.clientPhone && (
              <p className="text-xs text-stone-600">{props.clientPhone}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-brand-primary font-bold mb-1.5">
              Event details
            </p>
            <div className="space-y-1 text-xs text-stone-700">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-stone-400" />
                <span className="text-stone-500">Order:</span>
                <span className="font-semibold text-stone-900">{props.orderNumber}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-stone-400" />
                <span className="text-stone-500">Date:</span>
                <span className="font-semibold text-stone-900">{safeDate(props.eventDate)}</span>
                {props.eventTime && (
                  <span className="text-stone-700"> - {props.eventTime}</span>
                )}
              </div>
              {props.venue && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-stone-400" />
                  <span className="text-stone-500">Venue:</span>
                  <span className="font-semibold text-stone-900">{props.venue}</span>
                </div>
              )}
              {props.guestCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <Users className="w-3 h-3 text-stone-400" />
                  <span className="text-stone-500">Guests:</span>
                  <span className="font-semibold text-stone-900">{props.guestCount}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ITEMS */}
      {Array.isArray(props.items) && props.items.length > 0 && (
        <Card className="mb-4 border border-stone-200 shadow-sm">
          <CardContent className="py-5 px-5">
            <p className="text-xs uppercase tracking-[0.15em] text-brand-primary font-bold mb-3">
              From the kitchen
            </p>
            <div className="space-y-2">
              {props.items.map((item, i) => {
                const qty = Number(item.quantity || 1);
                const unitPrice = Number(item.unitPrice || 0);
                const lineTotal = Number(
                  item.total != null ? item.total : qty * unitPrice,
                );
                return (
                  <div
                    key={i}
                    className="flex justify-between gap-3 text-sm py-2 border-b border-stone-100 last:border-b-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-900">{item.description}</p>
                      {qty > 1 && (
                        <p className="text-xs text-stone-500 mt-0.5">
                          {qty} x {fmtMoney.format(unitPrice)}
                        </p>
                      )}
                    </div>
                    <p className="text-stone-900 font-semibold tabular-nums shrink-0">
                      {fmtMoney.format(lineTotal)}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TOTALS */}
      <Card className="mb-4 border border-stone-200 shadow-sm">
        <CardContent className="py-5 px-5 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-stone-600">Subtotal</span>
            <span className="text-stone-900 tabular-nums">
              {fmtMoney.format(props.subtotal)}
            </span>
          </div>
          {props.taxAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-stone-600">
                VAT {props.taxRate ? `(${Number(props.taxRate).toFixed(0)}%)` : ""}
              </span>
              <span className="text-stone-900 tabular-nums">
                {fmtMoney.format(props.taxAmount)}
              </span>
            </div>
          )}
          <div className="flex justify-between font-bold text-xl pt-3 border-t-2 border-brand-primary">
            <span className="text-stone-900 font-serif">
              Total{props.companyVatRegistered ? " incl. VAT" : ""}
            </span>
            <span className="text-brand-primary tabular-nums">
              {fmtMoney.format(props.total)}
            </span>
          </div>
          {props.depositPaid > 0 && (
            <>
              <div className="flex justify-between text-sm pt-2">
                <span className="text-stone-600">{paymentSummary.label}</span>
                <span className="text-brand-primary tabular-nums">
                  -{fmtMoney.format(props.depositPaid)}
                </span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span className="text-stone-900">
                  {props.balanceDue <= 0 ? "Balance" : "Balance due"}
                </span>
                <span
                  className={
                    props.balanceDue <= 0
                      ? "text-brand-primary tabular-nums"
                      : "text-amber-700 tabular-nums"
                  }
                >
                  {fmtMoney.format(Math.max(0, props.balanceDue))}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* PAYMENT DETAILS */}
      {props.bankDetails && (
        <Card className="mb-4 border border-stone-200 shadow-sm">
          <CardContent className="py-5 px-5">
            <p className="text-xs uppercase tracking-[0.15em] text-brand-primary font-bold mb-3">
              Payment details
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-stone-500">Bank</p>
                <p className="font-semibold text-stone-900">
                  {props.bankDetails.bankName}
                </p>
              </div>
              <div>
                <p className="text-xs text-stone-500">Account name</p>
                <p className="font-semibold text-stone-900">
                  {props.bankDetails.accountName}
                </p>
              </div>
              <div>
                <p className="text-xs text-stone-500">Account number</p>
                <p className="font-semibold text-stone-900 tabular-nums">
                  {props.bankDetails.accountNumber}
                </p>
              </div>
              <div>
                <p className="text-xs text-stone-500">Branch code</p>
                <p className="font-semibold text-stone-900 tabular-nums">
                  {props.bankDetails.branchCode}
                </p>
              </div>
            </div>
            {props.paymentTerms && (
              <div className="mt-4 pt-4 border-t border-stone-100">
                <p className="text-xs text-stone-500 mb-0.5">Payment terms</p>
                <p className="text-xs text-stone-700">{props.paymentTerms}</p>
              </div>
            )}
            <p className="text-xs text-stone-500 mt-3">
              Use invoice number{" "}
              <strong className="text-stone-700">{props.invoiceNumber}</strong>{" "}
              as reference.
            </p>
          </CardContent>
        </Card>
      )}

      {/* NOTES */}
      {props.notes && (
        <Card className="mb-4 border border-stone-200 shadow-sm">
          <CardContent className="py-5 px-5">
            <p className="text-xs uppercase tracking-[0.15em] text-brand-primary font-bold mb-1.5">
              A note from us
            </p>
            <p className="text-sm text-stone-700 whitespace-pre-wrap">{props.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* COMPANY FOOTER */}
      {(props.companyEmail || props.companyPhone || props.companyAddress) && (
        <div className="mt-6 text-center text-xs text-stone-500 space-y-0.5">
          <p className="font-bold text-stone-700">{props.companyName}</p>
          {props.companyAddress && <p>{props.companyAddress}</p>}
          <p>
            {props.companyEmail}
            {props.companyEmail && props.companyPhone && (
              <span className="mx-1">·</span>
            )}
            {props.companyPhone}
          </p>
        </div>
      )}
    </div>
  );
}
