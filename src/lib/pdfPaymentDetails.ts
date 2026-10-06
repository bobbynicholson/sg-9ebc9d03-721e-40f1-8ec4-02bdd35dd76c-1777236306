import { resolveCompanyEftDetails } from "@/lib/companyEftDetails";

/** A safe, display-ready EFT bundle shared by client-facing PDFs. */
export interface PdfEftPaymentDetails {
  company_name?: string | null;
  bank_name?: string | null;
  account_holder?: string | null;
  account_number?: string | null;
  branch_code?: string | null;
  account_type?: string | null;
  instructions?: string | null;
  reference?: string | null;
  reference_hint?: string | null;
}

/** The currently available way to settle an outstanding quote or invoice. */
export interface PdfPaymentInstructions {
  online_provider?: string | null;
  payment_url?: string | null;
  eft?: PdfEftPaymentDetails | null;
  reference?: string | null;
  reference_hint?: string | null;
}

/** An auditable payment row rendered on a completed-invoice receipt. */
export interface PdfPaymentRecord {
  amount?: number | null;
  currency?: string | null;
  payment_method?: string | null;
  payment_provider?: string | null;
  transaction_id?: string | null;
  payment_reference?: string | null;
  paid_at?: string | null;
}

export function paymentProviderLabel(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  const labels: Record<string, string> = {
    payfast: "PayFast",
    yoco: "Yoco",
    stripe: "Stripe",
  };
  return labels[value] || value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isEftPaymentMethod(raw: string | null | undefined): boolean {
  const value = String(raw || "").trim().toLowerCase();
  return value === "eft" || value === "bank_transfer" || value === "bank transfer";
}

/**
 * Resolve a complete bank bundle without ever mixing a partially edited
 * company bank profile with an older invoice snapshot. The underlying
 * resolver deliberately declines incomplete details rather than guessing.
 */
export function buildPdfEftPaymentDetails(
  company: Record<string, unknown> | null | undefined,
  snapshot: Record<string, unknown> | null | undefined = {},
  options: {
    reference?: string | null;
    referenceHint?: string | null;
  } = {},
): PdfEftPaymentDetails | null {
  const sourceCompany = company || {};
  const details = resolveCompanyEftDetails(sourceCompany, snapshot || {});
  if (!details.available) return null;

  return {
    company_name: String(sourceCompany.legal_name || sourceCompany.company_name || "").trim() || null,
    bank_name: details.name || null,
    account_holder: details.holder || null,
    account_number: details.account || null,
    branch_code: details.branch || null,
    account_type: details.type || null,
    instructions: details.instructions || null,
    reference: options.reference || null,
    reference_hint: options.referenceHint || null,
  };
}
