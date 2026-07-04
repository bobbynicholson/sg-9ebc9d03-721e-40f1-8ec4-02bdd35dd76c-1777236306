/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /pay/i/[token] - public invoice + payment view.
 *
 * Token-keyed sibling of /q/[token]. Replaces the older
 * /pay/invoice/[id] route which used a raw, enumerable invoice UUID
 * and (after the foundation migration) has no anon SELECT policy.
 *
 * The header band, logo slot, brand colours and print CSS mirror
 * /q/[token] so a quote and the matching invoice feel like one
 * document family from the client's side.
 *
 * PayFast remains the only payment surface. We resolve the invoice by
 * token but pass invoice.id as custom_str1 so the IPN webhook
 * (api/webhooks/payment-confirmation) keeps resolving via id without
 * any change. return_url and cancel_url are token-form so the user
 * never lands on a UUID URL.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2, CreditCard, CheckCircle2, AlertCircle, FileText,
  Calendar, Printer, Wallet,
} from "lucide-react";
import { PayFastService } from "@/lib/payfastService";
import { formatZAR } from "@/lib/formatters";
import { applyBrandingToDOM, loadBrandFonts } from "@/lib/branding/applyBranding";

// Use the platform's canonical ZAR formatter (space thousands, dot
// decimal, single "R") instead of raw Intl, which renders a COMMA
// decimal on full-ICU en-ZA and reads inconsistent with every other
// money surface in the app. `.format` shim keeps the call sites tidy.
const fmtMoney = { format: (n: number) => formatZAR(n) };

interface InvoiceView {
  id: string;
  public_token: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  invoice_data: any;
  // Completed payments against this invoice (oldest first) so we can show
  // when the deposit / each payment actually landed.
  payments?: { amount: number; processed_at: string; payment_status: string }[];
  companies: {
    id: string;
    company_name: string;
    logo_url: string | null;
    email: string | null;
    phone_number: string | null;
    vat_registered: boolean | null;
    vat_number: string | null;
    vat_rate: number | null;
    deposit_percent: number | null;
    primary_color: string | null;
    secondary_color: string | null;
    accent_color: string | null;
    brand_font_body?: string | null;
    brand_font_display?: string | null;
  };
}

function companyInitials(name: string | null | undefined): string {
  if (!name) return "C";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type InvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  note?: string | null;
  isAdjustment?: boolean;
};

type InvoiceBreakdownSection = {
  key: string;
  title: string;
  lines: InvoiceLine[];
};

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function moneyNumber(...values: any[]): number {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function normaliseInvoiceLines(rows: any[]): InvoiceLine[] {
  return rows
    .map((row) => {
      const description = String(
        row?.description
        || row?.item_name
        || row?.menu_item_name
        || row?.equipment_name
        || row?.name
        || row?.title
        || "Item",
      ).trim();
      const quantity = moneyNumber(row?.quantity, row?.qty, 1) || 1;
      const unitPrice = moneyNumber(row?.unitPrice, row?.unit_price, row?.price, row?.rentalPrice, row?.rental_price);
      const explicitTotal = moneyNumber(row?.total, row?.line_total, row?.total_price, row?.lineTotal);
      const total = explicitTotal || Number((quantity * unitPrice).toFixed(2));
      return {
        description,
        quantity,
        unitPrice,
        total,
        note: row?.note || row?.notes || null,
        isAdjustment: !!row?.isAdjustment,
      };
    })
    .filter((line) => line.description || Math.abs(line.total) > 0);
}

function isAdditionalChargeLine(line: InvoiceLine): boolean {
  return /delivery|collection|waiter|service fee|damage|shortage|adjustment|discount|surcharge/i.test(line.description);
}

function buildInvoiceBreakdown(invoice: InvoiceView): {
  sections: InvoiceBreakdownSection[];
  hasStoredTax: boolean;
} {
  const idata = invoice.invoice_data || {};
  const rawItems = normaliseInvoiceLines(asArray(idata.items));
  const menuRows = asArray(idata.menuItems).length > 0
    ? asArray(idata.menuItems)
    : asArray(idata.menu_items);
  const equipmentRows = asArray(idata.equipmentItems).length > 0
    ? asArray(idata.equipmentItems)
    : asArray(idata.equipment_items);

  const menuLines = normaliseInvoiceLines(
    menuRows.length > 0 ? menuRows : rawItems.filter((line) => !isAdditionalChargeLine(line)),
  );
  const equipmentLines = normaliseInvoiceLines(equipmentRows);
  const additionalLines = rawItems.filter((line) => {
    if (menuRows.length === 0 && !isAdditionalChargeLine(line)) return false;
    return isAdditionalChargeLine(line);
  });

  const sections: InvoiceBreakdownSection[] = [];
  if (menuLines.length > 0) sections.push({ key: "menu", title: "Menu and catering", lines: menuLines });
  if (equipmentLines.length > 0) sections.push({ key: "equipment", title: "Equipment and hire-in", lines: equipmentLines });

  const packageName = String(idata.packageName || idata.package_name || idata.package?.name || "").trim();
  if (packageName) {
    sections.push({
      key: "package",
      title: "Package",
      lines: [{
        description: packageName,
        quantity: 1,
        unitPrice: 0,
        total: 0,
        note: "Grouped booking package",
      }],
    });
  }

  if (additionalLines.length > 0) {
    sections.push({ key: "additional", title: "Additional charges", lines: additionalLines });
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const invTotal = r2(Number(invoice.total_amount || 0));
  const storedSubtotal = r2(Number(idata.subtotal || 0));
  const storedTax = r2(Number(idata.taxAmount || idata.tax_amount || 0));
  const hasStoredTax = storedTax > 0 && Math.abs(r2(storedSubtotal + storedTax) - invTotal) <= 0.01;
  const lineTarget = hasStoredTax ? storedSubtotal : invTotal;
  const visibleLineSum = r2(sections.reduce(
    (sum, section) => sum + section.lines.reduce((lineSum, line) => lineSum + Number(line.total || 0), 0),
    0,
  ));
  const reconDiff = r2(lineTarget - visibleLineSum);
  if (sections.length > 0 && Math.abs(reconDiff) > 0.01) {
    const adjustment: InvoiceLine = {
      description: "Invoice adjustment",
      quantity: 1,
      unitPrice: reconDiff,
      total: reconDiff,
      isAdjustment: true,
    };
    const extra = sections.find((section) => section.key === "additional");
    if (extra) extra.lines.push(adjustment);
    else sections.push({ key: "additional", title: "Additional charges", lines: [adjustment] });
  }

  return { sections, hasStoredTax };
}

export default function InvoicePaymentPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;
  // TIGHTEN I.113: auto-fire the print dialog when opened with ?print=1.
  // /c/order/{id}'s "Download invoice" button uses this so the client
  // gets a printable invoice in one click. Matches the same pattern
  // /q/{token} already uses for quote downloads.
  const autoPrint = router.query.print === "1";

  const [invoice, setInvoice] = useState<InvoiceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Download the clean react-pdf tax invoice (no browser print chrome /
  // page breaks) instead of window.print(). Falls back to the print
  // dialog if the render endpoint is unreachable. (2026-07-04)
  const downloadInvoicePdf = async () => {
    if (!token || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const resp = await fetch(`/api/public/invoices/${token}/pdf`);
      if (!resp.ok) throw new Error(`Invoice PDF failed (${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice-${(invoice as any)?.invoice_number || token}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      try { window.print(); } catch { /* ignore */ }
    } finally {
      setDownloadingPdf(false);
    }
  };
  // Wave 29.2: store-credit support on the public magic-link pay
  // page. Mirrors PaymentModal - fetch balance via the
  // credit-balance endpoint (token-bearer auth), default the toggle
  // on when there's any to apply.
  const [creditAvailable, setCreditAvailable] = useState<number>(0);
  const [creditMaxApplicable, setCreditMaxApplicable] = useState<number>(0);
  const [applyCredit, setApplyCredit] = useState<boolean>(false);
  const [settledByCredit, setSettledByCredit] = useState<boolean>(false);
  // Client-chosen amount to pay now. Prefilled with the suggested
  // deposit (companies.deposit_percent of the total, default 50%) but
  // fully editable - clients often pay a deposit that isn't exactly
  // that %, and the balance must then reflect whatever they pay. Held
  // as a string so the field can be cleared/typed freely; parsed on use.
  const [payAmount, setPayAmount] = useState<string>("");

  // Apply per-tenant brand colours AND fonts once the invoice resolves.
  // This is a public token route, so it uses the same DOM applier as
  // logged-in tenant pages without depending on auth context.
  useEffect(() => {
    if (!invoice?.companies) return;
    const row = {
      id: invoice.companies.id,
      companyName: invoice.companies.company_name,
      logoUrl: invoice.companies.logo_url,
      primaryColor: invoice.companies.primary_color,
      secondaryColor: invoice.companies.secondary_color,
      accentColor: invoice.companies.accent_color,
      fontBody: invoice.companies.brand_font_body ?? null,
      fontDisplay: invoice.companies.brand_font_display ?? null,
    };
    applyBrandingToDOM(row);
    loadBrandFonts(row);
  }, [invoice?.companies]);

  // TIGHTEN I.113: auto-print dispatch. Waits for the invoice render
  // so the print preview captures the full document.
  useEffect(() => {
    if (!autoPrint || !invoice || loading) return;
    const t = setTimeout(() => {
      try { window.print(); } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(t);
  }, [autoPrint, invoice, loading]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      // FIX (2026-06-12): fetch via the service-role API route instead
      // of a direct anon SELECT. Migration 20260521090000 dropped the
      // open anon read policy on invoices (cross-tenant leak), which
      // silently emptied this query - every public pay link rendered
      // "Invoice not found". The old embed also selected a nonexistent
      // companies.phone_number column (it's `phone`), 400-ing the
      // query regardless. The route mirrors the /q page's
      // /api/public/quotes/[token]/get pattern.
      let data: any = null;
      try {
        const r = await fetch(`/api/public/invoices/${encodeURIComponent(token)}/get`, {
          method: "GET",
          cache: "no-store",
        });
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          data = j?.invoice || null;
        }
      } catch (e) {
        console.warn("[pay/i] invoice fetch failed:", e);
      }
      if (cancelled) return;
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setInvoice(data as InvoiceView);
      setLoading(false);

      // Wave 29.2: probe store-credit balance for this client.
      // Token-bearer auth via the same public_token used for the
      // pay session - no Supabase session required.
      try {
        const cb = await fetch("/api/payments/credit-balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoice_id: (data as any).id,
            public_token: (data as any).public_token,
          }),
        });
        const cbJson = await cb.json().catch(() => ({}));
        if (cb.ok && cbJson?.ok) {
          setCreditAvailable(Number(cbJson.available) || 0);
          setCreditMaxApplicable(Number(cbJson.maxApplicable) || 0);
          if (Number(cbJson.maxApplicable) > 0) setApplyCredit(true);
        }
      } catch {
        // Credit lookup is soft - failure shouldn't block the pay flow.
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Prefill "amount to pay now" with the suggested deposit once the
  // invoice loads, capped to the outstanding balance (a re-visit after
  // a part-payment shouldn't propose more than what's left).
  useEffect(() => {
    if (!invoice) return;
    const p = Number(invoice.companies?.deposit_percent);
    const pct = Number.isFinite(p) && p > 0 && p < 100 ? p : 50;
    const suggested = Math.round((invoice.total_amount || 0) * (pct / 100) * 100) / 100;
    const capped = Math.min(suggested || invoice.balance_due, invoice.balance_due);
    setPayAmount(capped > 0 ? String(capped) : String(invoice.balance_due || 0));
  }, [invoice]);

  async function initiatePayment() {
    if (!invoice) return;
    // What the client chose to pay now, clamped to the balance.
    const payNowAmt = Math.max(0, Math.min(Number(payAmount) || 0, invoice.balance_due));
    if (payNowAmt <= 0) {
      setError("Enter an amount to pay.");
      return;
    }
    try {
      setProcessing(true);
      setError(null);

      // Wave 20 audit: this used to inline-build a PayFast HTML form
      // from NEXT_PUBLIC_PAYFAST_* env vars, hardcoded to PayFast,
      // ignoring whichever gateway the tenant actually configured in
      // /admin/payment-gateways. Tenants who switched to Yoco or
      // Stripe still saw "Pay via PayFast" on their public invoice
      // link - and platform-level PayFast credentials had to be set
      // OR the page died. Route through the existing
      // /api/payments/create-session dispatcher (made unauth-safe in
      // wave 17 via public_token) which picks the active tenant
      // gateway and returns the right payment surface.
      const resp = await fetch("/api/payments/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.id,
          public_token: invoice.public_token,
          // The amount the client chose to pay now (server caps it to
          // the outstanding balance). Lets them part-pay a deposit that
          // isn't exactly the suggested %.
          pay_amount: payNowAmt,
          // Wave 29.2: pass the toggle state through so the server
          // nets credit before the gateway charge. apply_credit_amount
          // explicitly carries the cap we computed up-front; the RPC
          // will further cap by available balance under its lock. Cap
          // to what they're paying now so credit can't exceed it.
          apply_credit: applyCredit,
          apply_credit_amount: applyCredit ? Math.min(creditMaxApplicable, payNowAmt) : undefined,
        }),
      });
      const json = await resp.json();

      // Wave 29.2: full credit cover - no gateway hop. Render a
      // settled state in place rather than sending the client off.
      if (json?.settled === true) {
        setSettledByCredit(true);
        setProcessing(false);
        return;
      }
      if (!resp.ok || !json?.ok) {
        // Surface a fix-path the client can act on. Previously the
        // operator's invoice link landed on a dead-end "contact the
        // company" message; now it's a mailto: with the operator's
        // email + the invoice number pre-filled.
        const company = (invoice as any)?.companies || {};
        const tenantEmail = company.email || company.contact_email || null;
        const invNumber = (invoice as any)?.invoice_number || "your invoice";
        const subject = encodeURIComponent(`Payment help - ${invNumber}`);
        const body = encodeURIComponent(
          `Hi ${company.company_name || "there"},\n\n` +
          `I tried to pay ${invNumber} but the online payment gateway isn't set up.\n` +
          `Please send me alternative payment instructions (EFT, etc.).\n\nThanks.`
        );
        const link = tenantEmail ? `mailto:${tenantEmail}?subject=${subject}&body=${body}` : null;
        const serverMsg = json?.error || `Could not start payment (${resp.status})`;
        setError(
          link
            ? `${serverMsg}. Tap to email ${company.company_name || "the company"}: ${tenantEmail}`
            : `${serverMsg}. Please contact the company to arrange payment.`
        );
        if (link) (window as any).__payFixLink = link;
        setProcessing(false);
        return;
      }

      // PayFast returns isHtmlForm=true with the rendered <form> HTML.
      // Yoco / Stripe return isHtmlForm=false with a redirect URL.
      // Branch on the flag and either inject + submit or window.location.
      if (json.isHtmlForm && typeof json.paymentUrl === "string") {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = json.paymentUrl;
        const form = wrapper.querySelector("form");
        if (form) {
          document.body.appendChild(form);
          form.submit();
          return;
        }
        setError("Could not render payment form. Please try again or contact support.");
        setProcessing(false);
        return;
      }
      if (typeof json.paymentUrl === "string") {
        window.location.href = json.paymentUrl;
        return;
      }
      setError("Payment session returned an unexpected response. Please try again.");
      setProcessing(false);
    } catch (err) {
      console.error("Payment initiation error:", err);
      setError("Failed to initiate payment. Please try again or contact support.");
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  if (notFound || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
        <Card className="max-w-md">
          <CardContent className="py-8 px-6 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
            <h1 className="text-lg font-semibold text-stone-900">Invoice not found</h1>
            <p className="text-sm text-stone-600">
              The link looks broken, or the invoice has been removed. Reach out to the company to ask for a fresh link.
            </p>
            {error && <p className="text-xs text-rose-600">{error}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  const company = invoice.companies;
  const companyName = company.company_name || "Your caterer";
  const isPaid = invoice.balance_due <= 0;
  // A deposit (or any part payment) has landed but the invoice isn't
  // settled yet. The client should see "Deposit paid" + how much of the
  // total is still outstanding, not a bare "Awaiting payment".
  const isPartiallyPaid = !isPaid && Number(invoice.amount_paid) > 0;
  const isOverdue = new Date(invoice.due_date) < new Date() && !isPaid;
  // Outstanding share of the total, as a percentage, for the "X% still
  // remaining" line. Guard against a zero total.
  const remainingPct =
    Number(invoice.total_amount) > 0
      ? Math.round((Number(invoice.balance_due) / Number(invoice.total_amount)) * 100)
      : 0;
  const vatRegistered = !!company.vat_registered;
  const docTitle = vatRegistered ? "Tax Invoice" : "Invoice";
  const today = format(new Date(), "d MMMM yyyy");
  // Days until / since the due date. Surfaces as a top-bar chip so the
  // payer sees the deadline before they scroll. Hidden once paid.
  const daysToDue = Math.ceil(
    (new Date(invoice.due_date).getTime() - Date.now()) / 86_400_000,
  );
  const dueChipLabel = isPaid
    ? null
    : daysToDue < 0
    ? `Overdue by ${Math.abs(daysToDue)} day${Math.abs(daysToDue) === 1 ? "" : "s"}`
    : daysToDue === 0
    ? "Due today"
    : daysToDue === 1
    ? "Due tomorrow"
    : `Due in ${daysToDue} days`;
  const dueChipTone = isOverdue ? "overdue" : daysToDue <= 3 ? "soon" : "ok";

  // Deposit / balance split for the client's payment plan. Uses the
  // caterer's configured deposit_percent (default 50%). Informational
  // so the client sees the staged structure - deposit to confirm the
  // booking, balance before the event - on the same document.
  const depositPct = (() => {
    const p = Number(company.deposit_percent);
    return Number.isFinite(p) && p > 0 && p < 100 ? p : 50;
  })();
  const balancePct = 100 - depositPct;
  const depositAmount = Math.round((invoice.total_amount || 0) * (depositPct / 100) * 100) / 100;
  const balanceAmount = Math.round(((invoice.total_amount || 0) - depositAmount) * 100) / 100;

  // Live payment figures driven by the editable "amount to pay now"
  // field: what they're paying and the balance that will remain after.
  const payNow = Math.max(0, Math.min(Number(payAmount) || 0, invoice.balance_due));
  const remainingAfter = Math.max(0, Math.round((invoice.balance_due - payNow) * 100) / 100);

  const invoiceBreakdown = buildInvoiceBreakdown(invoice);
  const breakdownSections = invoiceBreakdown.sections;
  const breakdownLines = breakdownSections.flatMap((section) =>
    section.lines.map((line) => ({ ...line, sectionTitle: section.title })),
  );
  const hasStoredTax = invoiceBreakdown.hasStoredTax;

  return (
    <>
      <Head>
        <title>{`${docTitle} ${invoice.invoice_number} from ${companyName}`}</title>
        <meta name="robots" content="noindex, nofollow" />
        <style>{`
          /* Mirror /q/[token] - html selector + color-adjust fallback
             keep Safari honouring the brand colour on print. */
          @media print {
            html, body, .brand-print {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            body { background: white !important; }
            .no-print { display: none !important; }
            .print-shadow-none { box-shadow: none !important; }
            .print-border-none { border: none !important; }
            .print-bg-white { background: white !important; }
            .brand-print { page-break-inside: avoid; break-inside: avoid; }
            @page { margin: 16mm; }
          }
        `}</style>
      </Head>

      <div className="min-h-screen bg-stone-50 print-bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

          {/* Floating action bar - screen only */}
          <div className="no-print flex items-center justify-between gap-2 mb-4 flex-wrap">
            {dueChipLabel ? (
              <Badge
                className={
                  dueChipTone === "overdue"
                    ? "bg-rose-100 text-rose-800 border border-rose-200 gap-1.5"
                    : dueChipTone === "soon"
                    ? "bg-amber-100 text-amber-800 border border-amber-200 gap-1.5"
                    : "bg-stone-100 text-stone-700 border border-stone-200 gap-1.5"
                }
              >
                <Calendar className="w-3.5 h-3.5" />
                {dueChipLabel}
              </Badge>
            ) : <span />}
            <Button variant="outline" size="sm" onClick={downloadInvoicePdf} disabled={downloadingPdf} className="gap-1.5">
              <Printer className="w-4 h-4" />
              {downloadingPdf ? "Preparing..." : "Save as PDF"}
            </Button>
          </div>

          {/* BRANDED HEADER - mirrors /q/[token] */}
          <div className="brand-print bg-brand-primary/10 border border-brand-primary/30 rounded-xl p-6 sm:p-8 mb-4 print-shadow-none">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3">
                  {company.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={company.logo_url}
                      alt={`${companyName} logo`}
                      className="h-10 w-auto max-w-[180px] object-contain"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-white font-bold text-sm">
                      {companyInitials(companyName)}
                    </div>
                  )}
                  <p className="text-xs uppercase tracking-[0.2em] text-brand-primary font-bold">
                    {companyName}
                  </p>
                </div>
                <h1 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 leading-tight">
                  {docTitle}
                </h1>
                {/* Invoice number: bold, small, on its own line directly
                    under the title (owner request Pic 77, 2026-07-04). */}
                <p className="block text-xs font-bold text-brand-primary mt-1 tracking-wider">
                  {invoice.invoice_number}
                </p>
                <p className="text-sm text-stone-600 mt-1.5">
                  Issued {format(new Date(invoice.invoice_date), "d MMMM yyyy")} · viewed {today}
                </p>
                {vatRegistered && company.vat_number && (
                  <p className="text-xs text-stone-500 mt-1">
                    VAT Reg No: <span className="font-mono">{company.vat_number}</span>
                  </p>
                )}
              </div>
              {isPaid ? (
                <Badge className="bg-brand-primary text-white border-0 gap-1 px-3 py-1.5 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Paid
                </Badge>
              ) : isPartiallyPaid ? (
                <Badge className="bg-brand-primary text-white border-0 gap-1 px-3 py-1.5 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Deposit paid
                </Badge>
              ) : isOverdue ? (
                <Badge className="bg-rose-600 text-white border-0 px-3 py-1.5 text-sm">
                  Overdue
                </Badge>
              ) : (
                <Badge className="brand-print bg-brand-primary text-white border-0 px-3 py-1.5 text-sm">
                  Awaiting payment
                </Badge>
              )}
            </div>
          </div>

          {/* AMOUNT BREAKDOWN */}
          <Card className="mb-4 border border-stone-200 shadow-sm print-shadow-none">
            <CardContent className="py-5 px-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-brand-primary font-bold">Total</p>
                  <p className="text-xl font-bold text-stone-900 tabular-nums">{fmtMoney.format(invoice.total_amount)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-brand-primary font-bold">Paid to date</p>
                  <p className="text-xl font-bold text-brand-primary tabular-nums">{fmtMoney.format(invoice.amount_paid)}</p>
                  {/* When the deposit / each payment actually landed, so
                      the client sees "deposited on X" + what's left, not
                      just a running total. */}
                  {Array.isArray(invoice.payments) && invoice.payments.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {invoice.payments.map((p, i) => (
                        <p key={i} className="text-[11px] text-stone-500">
                          {fmtMoney.format(Number(p.amount) || 0)} paid on {format(new Date(p.processed_at), "d MMM yyyy")}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {!isPartiallyPaid && !isPaid && (
                <div className="grid grid-cols-2 gap-4 rounded-lg bg-stone-50 p-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-brand-primary font-bold">
                      Deposit payment ({depositPct}%)
                    </p>
                    <p className="text-lg font-bold text-stone-900 tabular-nums">{fmtMoney.format(depositAmount)}</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">Payable to confirm your booking</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-brand-primary font-bold">
                      Balance payment ({balancePct}%)
                    </p>
                    <p className="text-lg font-bold text-stone-900 tabular-nums">{fmtMoney.format(balanceAmount)}</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">Payable before the event</p>
                  </div>
                </div>
              )}

              <div className="brand-print rounded-lg bg-brand-primary/10 border-2 border-brand-primary p-5 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-brand-primary font-bold mb-1">
                    {isPartiallyPaid ? `Balance still to pay (${remainingPct}%)` : "Balance due"}
                  </p>
                  <p className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-stone-900 tabular-nums break-words">
                    {fmtMoney.format(invoice.balance_due)}
                  </p>
                  {isPartiallyPaid && (
                    <p className="text-sm font-semibold text-brand-primary mt-1">
                      Deposit received - thank you. The remaining {remainingPct}% is still to pay.
                    </p>
                  )}
                  {!isPaid && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <Calendar className="w-3 h-3 text-stone-500" />
                      <span className={isOverdue ? "text-rose-600 font-semibold" : "text-stone-500"}>
                        Due {format(new Date(invoice.due_date), "d MMMM yyyy")}
                        {isOverdue && " (overdue)"}
                      </span>
                    </div>
                  )}
                </div>
                <FileText className="w-10 h-10 text-brand-primary opacity-30" />
              </div>

              {/* Itemized breakdown - grouped source labels come from
                  invoice_data menu/equipment/package snapshots, with
                  order-linked fallback hydration from the public API. */}
              {breakdownSections.length > 0 && (
                <div className="rounded-lg border border-stone-200 overflow-hidden">
                  <p className="text-xs uppercase tracking-[0.15em] text-brand-primary font-bold px-4 pt-3 pb-2">
                    Itemized breakdown
                  </p>
                  <ul className="divide-y divide-stone-100">
                    {breakdownLines.map((it: any, i: number) => {
                      const isDamage = /damage/i.test(String(it?.description || ""));
                      const isAdjustment = !!it?.isAdjustment;
                      return (
                        <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                          <div className="min-w-0">
                            {it?.sectionTitle && (
                              <p className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-bold mb-0.5">
                                {it.sectionTitle}
                              </p>
                            )}
                            <p className={isDamage ? "text-rose-700 font-medium" : isAdjustment ? "text-stone-600 italic" : "text-stone-800"}>
                              {it?.description || "Item"}
                            </p>
                            {Number(it?.quantity) > 0 && Number(it?.unitPrice) > 0 && (
                              <p className="text-[11px] text-stone-500">
                                {it.quantity} x {fmtMoney.format(Number(it.unitPrice) || 0)}
                              </p>
                            )}
                          </div>
                          {Math.abs(Number(it?.total || 0)) > 0 || Math.abs(Number(it?.unitPrice || 0)) > 0 ? (
                            <p className="text-stone-900 tabular-nums font-medium whitespace-nowrap">
                              {fmtMoney.format(Number(it?.total) || 0)}
                            </p>
                          ) : (
                            <p className="text-stone-500 text-xs whitespace-nowrap">
                              Included
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="border-t border-stone-200 bg-stone-50 px-4 py-2.5 space-y-1 text-sm">
                    {hasStoredTax && (
                      <>
                        <div className="flex items-center justify-between text-stone-600">
                          <span>Subtotal</span>
                          <span className="tabular-nums">{fmtMoney.format(Number(invoice.invoice_data?.subtotal) || 0)}</span>
                        </div>
                        <div className="flex items-center justify-between text-stone-600">
                          <span>VAT</span>
                          <span className="tabular-nums">{fmtMoney.format(Number(invoice.invoice_data?.taxAmount) || 0)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between font-semibold text-stone-900">
                      <span>Total</span>
                      <span className="tabular-nums">{fmtMoney.format(invoice.total_amount)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Event details inherited from quote (when present) */}
              {invoice.invoice_data?.eventDate && (
                <div className="rounded-lg bg-stone-50 p-4 text-sm text-stone-700 space-y-1">
                  <p className="text-xs uppercase tracking-[0.15em] text-brand-primary font-bold mb-1">Event details</p>
                  <p>Date: {format(new Date(invoice.invoice_data.eventDate), "d MMMM yyyy")}</p>
                  {invoice.invoice_data.venue && <p>Venue: {invoice.invoice_data.venue}</p>}
                  {invoice.invoice_data.guestCount && <p>Guests: {invoice.invoice_data.guestCount}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* PAYMENT SECTION - screen only */}
          <div className="no-print">
            {isPaid ? (
              <Alert className="border-brand-primary/20 bg-brand-primary/10">
                <CheckCircle2 className="h-4 w-4 text-brand-primary" />
                <AlertDescription className="text-brand-primary">
                  <strong>Payment received.</strong> Thanks {invoice.invoice_data?.clientName || "for your business"} - this invoice is settled in full.
                </AlertDescription>
              </Alert>
            ) : (
              <Card className="border border-stone-200 shadow-sm">
                <CardContent className="py-6 px-5 space-y-4">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {error}
                        {typeof window !== "undefined" && (window as any).__payFixLink && (
                          <div className="mt-2">
                            <a
                              href={(window as any).__payFixLink}
                              className="underline font-medium"
                            >
                              Email the company about this invoice
                            </a>
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div>
                    <p className="text-sm font-semibold text-stone-900">Pay this invoice</p>
                    <p className="text-xs text-stone-600 mt-0.5">
                      Secure card / EFT payment. The provider depends on what {invoice.companies.company_name || "the caterer"} has set up.
                    </p>
                  </div>

                  {/* Editable amount-to-pay. Clients commonly pay a
                      deposit that isn't exactly the suggested %, so let
                      them set the figure; the remaining balance updates
                      live and the gateway is charged for exactly this. */}
                  <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 space-y-2">
                    <label htmlFor="pay-amount" className="text-sm font-semibold text-stone-800">
                      Amount to pay now (R)
                    </label>
                    <input
                      id="pay-amount"
                      type="number"
                      min={0}
                      max={invoice.balance_due}
                      step="0.01"
                      inputMode="decimal"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      onBlur={() => {
                        // Clamp on blur so the figure can never exceed
                        // the outstanding balance.
                        const n = Math.max(0, Math.min(Number(payAmount) || 0, invoice.balance_due));
                        setPayAmount(n > 0 ? String(n) : "");
                      }}
                      className="w-full h-11 rounded-md border border-stone-300 px-3 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                    />
                    <div className="flex items-center justify-between text-base mt-1">
                      <span className="text-stone-600">Outstanding balance</span>
                      <span className="font-bold text-stone-900 text-lg tabular-nums">{fmtMoney.format(invoice.balance_due)}</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-stone-600">Balance remaining after this payment</span>
                      <span className="font-bold text-stone-900 text-lg tabular-nums">{fmtMoney.format(remainingAfter)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      {/* Only offer the deposit shortcut when it's actually
                          smaller than what's still owing - once the deposit
                          is paid it equals the full balance, so showing both
                          (same amount) just confuses. */}
                      {depositAmount < invoice.balance_due - 0.01 && (
                        <button
                          type="button"
                          onClick={() => setPayAmount(String(Math.min(depositAmount, invoice.balance_due)))}
                          className="text-sm font-semibold rounded-full border border-stone-300 px-4 py-2 text-stone-700 hover:bg-white"
                        >
                          Pay deposit ({depositPct}%): {fmtMoney.format(Math.min(depositAmount, invoice.balance_due))}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPayAmount(String(invoice.balance_due))}
                        className="text-sm font-semibold rounded-full border border-stone-300 px-4 py-2 text-stone-700 hover:bg-white"
                      >
                        Pay full balance: {fmtMoney.format(invoice.balance_due)}
                      </button>
                    </div>
                  </div>

                  {/* Wave 29.2: store-credit toggle for the magic-link
                      pay flow. Only shown when the client holds credit
                      with this catering company. Default-on for the
                      cashflow win; clients can untick. */}
                  {creditAvailable > 0 && !settledByCredit && (
                    <div className="rounded-xl border-2 border-brand-primary/20 bg-brand-primary/10 p-4">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applyCredit}
                          onChange={(e) => setApplyCredit(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-brand-primary/40 text-brand-primary focus:ring-brand-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-brand-primary" />
                            <span className="font-semibold text-brand-primary">
                              Apply your store credit
                            </span>
                          </div>
                          <p className="text-sm text-brand-primary mt-1">
                            You have <strong>{fmtMoney.format(creditAvailable)}</strong> in credit on file with {invoice.companies.company_name || "the caterer"}.
                            {creditMaxApplicable >= invoice.balance_due
                              ? " That covers this whole invoice - nothing left to charge."
                              : ` We'll apply ${fmtMoney.format(creditMaxApplicable)} and you'll only pay ${fmtMoney.format(invoice.balance_due - creditMaxApplicable)} for the rest.`}
                          </p>
                        </div>
                      </label>
                    </div>
                  )}

                  {settledByCredit ? (
                    <div className="rounded-xl border-2 border-brand-primary/30 bg-brand-primary/10 p-5 text-center">
                      <CheckCircle2 className="w-10 h-10 text-brand-primary mx-auto mb-2" />
                      <p className="font-bold text-brand-primary text-lg">Invoice settled</p>
                      <p className="text-sm text-brand-primary mt-1">
                        We applied {fmtMoney.format(creditMaxApplicable)} of your store credit - nothing further to pay.
                      </p>
                    </div>
                  ) : (
                    <Button
                      onClick={initiatePayment}
                      disabled={processing || payNow <= 0}
                      size="lg"
                      className="w-full bg-brand-primary hover:opacity-90 gap-2"
                    >
                      {processing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Redirecting to payment...
                        </>
                      ) : applyCredit && creditMaxApplicable >= payNow ? (
                        <>
                          <Wallet className="w-5 h-5" />
                          Settle with {fmtMoney.format(Math.min(creditMaxApplicable, payNow))} credit
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-5 h-5" />
                          Pay {fmtMoney.format(
                            applyCredit
                              ? Math.max(0, payNow - creditMaxApplicable)
                              : payNow,
                          )} now
                        </>
                      )}
                    </Button>
                  )}

                  {/* Bank transfer alternative */}
                  {invoice.invoice_data?.bankDetails && (
                    <div className="mt-2 p-4 rounded-lg border border-stone-200 bg-stone-50">
                      <p className="text-sm font-semibold text-stone-900 mb-2">Prefer EFT?</p>
                      <div className="space-y-1 text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <span className="text-stone-500">Bank:</span>
                          <span className="font-medium text-stone-900">{invoice.invoice_data.bankDetails.bankName}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <span className="text-stone-500">Account name:</span>
                          <span className="font-medium text-stone-900">{invoice.invoice_data.bankDetails.accountName}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <span className="text-stone-500">Account #:</span>
                          <span className="font-medium text-stone-900 tabular-nums">{invoice.invoice_data.bankDetails.accountNumber}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <span className="text-stone-500">Branch code:</span>
                          <span className="font-medium text-stone-900 tabular-nums">{invoice.invoice_data.bankDetails.branchCode}</span>
                        </div>
                      </div>
                      <p className="text-xs text-stone-500 mt-3">
                        Use invoice number <strong className="text-stone-700">{invoice.invoice_number}</strong> as reference.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* COMPANY FOOTER */}
          {(company.email || company.phone_number) && (
            <div className="mt-8 text-center text-xs text-stone-500 space-y-0.5">
              <p className="font-bold text-stone-700">{companyName}</p>
              <p>
                {company.email && (
                  <a href={`mailto:${company.email}`} className="hover:underline">{company.email}</a>
                )}
                {company.email && company.phone_number && <span className="mx-1">·</span>}
                {company.phone_number && (
                  <a href={`tel:${company.phone_number}`} className="hover:underline">{company.phone_number}</a>
                )}
              </p>
              <p className="pt-2">Questions? Reach out and they'll come back to you.</p>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
