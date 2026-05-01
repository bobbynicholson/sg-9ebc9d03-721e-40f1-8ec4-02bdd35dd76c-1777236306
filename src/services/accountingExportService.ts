/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * accountingExportService -- maps a CateringMS quote / invoice to the
 * canonical shape the major accounting packages accept on their Quote
 * and Invoice endpoints.
 *
 * Why this exists separately from xeroIntegrationService:
 *   - The mapping is the same for Xero, QuickBooks Online and Sage.
 *     Each package has cosmetic differences (field naming, tax types)
 *     but the underlying payload -- contact, line items with qty +
 *     unit price + tax, totals -- is universal. Building the mapper
 *     once means we can light up the other packages without rewriting.
 *   - The mapper is sync + pure, so it's safe to call from anywhere
 *     in the UI (e.g. a 'Copy JSON' fallback) even before the server-
 *     side API integration is live.
 *
 * Status of live push integrations:
 *   - Xero: scaffolded in xeroIntegrationService.ts. Needs OAuth app
 *     credentials + a server-side /api/integrations/xero/* endpoint
 *     pair before the actual fetch will work. Until then, the UI
 *     calls into this mapper and offers a 'Copy JSON' fallback.
 *   - QuickBooks Online: same shape, swap the contact / line item
 *     keys at adapter time.
 */

import { supabase } from "@/integrations/supabase/client";

export interface AccountingLineItem {
  /** Free-text item description shown on the document. */
  description: string;
  /** Quantity. Defaults to 1 when no quantity is set on the source. */
  quantity: number;
  /** Per-unit price (excludes tax when company is VAT-registered). */
  unit_price: number;
  /** Optional account code mapping (e.g. Xero '200 - Sales'). */
  account_code?: string;
  /** Tax type. SA VAT-inclusive sales => 'OUTPUT' on Xero. */
  tax_type?: "OUTPUT" | "NONE" | "INPUT";
  /** Computed: quantity * unit_price (gross before document discount). */
  line_total: number;
}

export interface AccountingContact {
  name: string;
  email: string | null;
  phone: string | null;
  vat_number?: string | null;
}

export interface AccountingDocument {
  /** "Quote" or "Invoice". Drives which endpoint the adapter posts to. */
  document_type: "Quote" | "Invoice";
  /** Reference number shown on the document (e.g. "Q-001" / "INV-1234"). */
  reference: string;
  /** ISO yyyy-MM-dd. */
  issue_date: string;
  /** ISO yyyy-MM-dd. Quote = valid until; Invoice = due date. */
  expiry_or_due_date: string | null;
  /** Document status (DRAFT / SUBMITTED / AUTHORISED). Most adapters
   *  default to DRAFT so the operator approves in their accounting
   *  package before it goes live. */
  status: "DRAFT" | "SUBMITTED" | "AUTHORISED";
  /** Customer / contact. Most packages auto-create a contact when
   *  one with this email doesn't exist. */
  contact: AccountingContact;
  /** Line items in document order. */
  line_items: AccountingLineItem[];
  /** When true, totals + line prices are stored excluding VAT and
   *  the package adds VAT at the configured rate. SA VAT-registered
   *  businesses typically work tax-inclusive on the source document
   *  so we send 'Inclusive'. */
  amount_type: "Inclusive" | "Exclusive" | "NoTax";
  /** Subtotal exc VAT (sum of unit_price * quantity, pre-discount). */
  subtotal: number;
  /** Discount amount (positive number to subtract from subtotal). */
  discount_amount: number;
  /** VAT amount on the document. */
  tax_amount: number;
  /** Total inc VAT. */
  total: number;
  /** Currency code, ISO 4217 (e.g. 'ZAR'). */
  currency: string;
  /** Free-text notes / special instructions to print on the document. */
  notes: string | null;
  /** Issuer (catering company) metadata for display in the package. */
  issuer: {
    name: string;
    vat_registered: boolean;
    vat_number: string | null;
  };
}

/**
 * Map a CateringMS quote row + company row to the canonical
 * accounting document shape. Pure function, safe to call from any
 * UI context. Returns null when the inputs don't have enough info
 * to build a valid document (e.g. no client name).
 */
export function buildAccountingDocumentFromQuote(args: {
  quote: any;
  company: any;
  documentType?: "Quote" | "Invoice";
}): AccountingDocument | null {
  const q = args.quote;
  const c = args.company;
  if (!q || !c) return null;
  if (!q.client_name) return null;

  const documentType = args.documentType ?? "Quote";
  const vatRegistered = !!c.vat_registered;

  const menuItems = Array.isArray(q.menu_items) ? q.menu_items : [];
  const equipItems = Array.isArray(q.equipment_items) ? q.equipment_items : [];

  const buildLine = (item: any, label: string): AccountingLineItem => {
    const description = item?.name || item?.description || item?.menu_item_name || label;
    const quantity = Number(item?.quantity ?? item?.qty ?? 1);
    const unit_price = Number(item?.unit_price ?? item?.price ?? item?.pricePerPerson ?? item?.rentalPrice ?? 0);
    const line_total = Number(item?.total ?? unit_price * quantity);
    return {
      description,
      quantity,
      unit_price,
      account_code: "200",
      tax_type: vatRegistered ? "OUTPUT" : "NONE",
      line_total,
    };
  };

  const line_items: AccountingLineItem[] = [
    ...menuItems.map((it: any) => buildLine(it, "Menu item")),
    ...equipItems.map((it: any) => buildLine(it, "Equipment")),
  ];

  const issueDate = (q.created_at ? new Date(q.created_at) : new Date()).toISOString().slice(0, 10);
  const expiryOrDue = q.valid_until || null;

  return {
    document_type: documentType,
    reference: q.quote_number || q.id?.slice(0, 8).toUpperCase() || "",
    issue_date: issueDate,
    expiry_or_due_date: expiryOrDue,
    status: "DRAFT",
    contact: {
      name:    q.client_name,
      email:   q.client_email ?? null,
      phone:   q.client_phone ?? null,
      vat_number: null,
    },
    line_items,
    amount_type: vatRegistered ? "Inclusive" : "NoTax",
    subtotal:        Number(q.subtotal ?? 0),
    discount_amount: Number(q.discount_amount ?? 0),
    tax_amount:      Number(q.tax_amount ?? q.tax ?? 0),
    total:           Number(q.total ?? q.total_amount ?? 0),
    currency:        c.currency || c.billing_currency || "ZAR",
    notes:           q.notes || q.terms_and_conditions || null,
    issuer: {
      name:           c.company_name || "",
      vat_registered: vatRegistered,
      vat_number:     c.vat_number || null,
    },
  };
}

/**
 * Convenience: load the quote + the company and build the payload.
 * Used by the 'Push to Xero' / 'Copy accounting JSON' buttons.
 */
export async function buildAccountingPayloadForQuote(quoteId: string, documentType: "Quote" | "Invoice" = "Quote"): Promise<AccountingDocument | null> {
  const { data: quote } = await (supabase as any)
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return null;
  const { data: company } = await (supabase as any)
    .from("companies")
    .select("*")
    .eq("id", quote.company_id)
    .maybeSingle();
  if (!company) return null;
  return buildAccountingDocumentFromQuote({ quote, company, documentType });
}

/**
 * Check whether the current user has an active Xero integration row.
 * Returns true when the OAuth flow is in place and a fetch to the
 * sync endpoint can succeed. Used to gate the 'Push to Xero' button:
 * when false, we surface 'Connect Xero in Integrations' instead.
 */
export async function isXeroConnected(): Promise<boolean> {
  try {
    const { data: user } = await (supabase as any).auth.getUser();
    if (!user?.user) return false;
    const { data: integration } = await (supabase as any)
      .from("integrations")
      .select("id, is_active")
      .eq("user_id", user.user.id)
      .eq("integration_type", "xero")
      .eq("is_active", true)
      .maybeSingle();
    return !!integration;
  } catch {
    return false;
  }
}

/**
 * Push a quote to Xero. Wraps the existing xeroIntegrationService
 * path with the canonical mapper above so the UI doesn't need to
 * know how Xero shapes data.
 *
 * Until the Xero OAuth + server endpoint pair are configured, this
 * will fall back to returning the prepared payload so the UI can
 * offer 'Copy JSON' as a manual stop-gap.
 */
export async function pushQuoteToXero(quoteId: string): Promise<{
  ok: boolean;
  reason?: "not_connected" | "no_endpoint" | "error";
  payload?: AccountingDocument;
  error?: string;
}> {
  const payload = await buildAccountingPayloadForQuote(quoteId, "Quote");
  if (!payload) return { ok: false, reason: "error", error: "Couldn't build the payload for this quote." };

  const connected = await isXeroConnected();
  if (!connected) return { ok: false, reason: "not_connected", payload };

  try {
    const res = await fetch("/api/integrations/xero/sync-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ payload }),
    });
    if (!res.ok) {
      const text = await res.text();
      // 404 means the server endpoint isn't deployed yet -- not the
      // operator's fault. Tell them and offer the fallback.
      if (res.status === 404) {
        return { ok: false, reason: "no_endpoint", payload };
      }
      return { ok: false, reason: "error", error: text || `HTTP ${res.status}`, payload };
    }
    return { ok: true, payload };
  } catch (err: any) {
    return { ok: false, reason: "error", error: err?.message, payload };
  }
}
