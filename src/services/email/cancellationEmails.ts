/**
 * Cancellation + refund email helpers.
 *
 * Each helper now goes through the central resolveEmailTemplate so
 * subject / body resolution follows one path: tenant override ->
 * global default -> hardcoded fallback. The fallback bodies stay here
 * as the source-of-truth copy that seeds the DB defaults.
 *
 * These bypass the comms_paused_until quarantine gate - a refund or
 * cancellation is a critical service comm the client needs no matter
 * what import-batch state their record is in. blocked_contacts still
 * applies (a deliberately blocked contact stays blocked).
 */
import { supabase as browserSupabase } from "@/integrations/supabase/client";
import { emailService } from "@/services/emailService";
import { resolveEmailTemplate } from "@/services/email/templateResolver";
import { mintOrderCustomerLink } from "@/lib/customerLinksServer";

// Wave 17 audit: these helpers fire from server-side API routes
// (cancellation-review, refundService etc.) where the imported
// browser supabase client has no session and RLS rejects the orders /
// companies SELECTs - the helpers silently no-op and the client
// never gets their cancellation / refund / postponement email.
// Resolve a service-role client at call time when we're on the
// server. On the browser we keep the imported anon client (these
// helpers are also called from a few admin pages).
function resolveServerClient(): any {
  if (typeof window !== "undefined") return browserSupabase;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getServiceSupabase } = require("@/lib/supabase/service") as { getServiceSupabase: () => any };
    return getServiceSupabase();
  } catch {
    return browserSupabase;
  }
}
import {
  formatCancellationSubject,
  formatPostponementSubject,
  formatRefundPaidSubject,
} from "@/lib/email/subjectFormatters";

// Body fallbacks live here so the same copy seeds the DB. Subjects are
// produced by the centralised formatters when no DB override exists.
const FALLBACK_BODIES = {
  // TIGHTEN I.114: cancellation/refund/postponement bodies embed
  // {{order_url}} so the client can see the cancellation reflected on
  // their booking page + access any refund / credit info there.
  cancellation:
    "Hi {{client_first_name}},\n\n" +
    "This confirms that order {{order_number}}{{event_date_label}} has been cancelled.\n\n" +
    "{{refund_paragraph}}" +
    "Your order record: {{order_url}}\n\n" +
    "If this wasn't expected, please reply to this email and we'll sort it out straight away.\n\n" +
    "Thanks,\n{{company_name}}",
  // {{refund_sla_phrase}} carries the per-tenant refund timeline that
  // the Settings -> Financial card now drives (companies.refund_process_days).
  // Defaults to "within the next few business days" when the days
  // value is missing so a legacy template doesn't suddenly read "0".
  cancellation_with_refund_paragraph:
    "Per our cancellation policy, a refund of {{refund_amount}} is due. " +
    "We'll process the EFT {{refund_sla_phrase}} and send confirmation when it's gone out.\n\n",
  cancellation_no_refund_paragraph:
    "Per our cancellation policy (sent on quote acceptance), no refund is due for this cancellation.\n\n",
  // Wave 28.2: parallel paragraph for the credit-payout choice. The
  // bonus pp wording is omitted when there's no bonus so plain-credit
  // tenants don't read awkwardly.
  cancellation_with_credit_paragraph:
    "You chose to keep your {{credit_amount}} as store credit instead of a refund. " +
    "It's already on your account - use it any time on a future booking, never expires.\n\n",
  refund_paid:
    "Hi {{client_first_name}},\n\n" +
    "Confirming that the refund of {{refund_amount}} for the cancelled order {{order_number}} has been processed. " +
    "It should land in your account within the next 1-3 business days, depending on your bank.\n\n" +
    "Your order record: {{order_url}}\n\n" +
    "Reply to this email if anything looks off.\n\n" +
    "Thanks,\n{{company_name}}",
  postponement_approved:
    "Hi {{client_first_name}},\n\n" +
    "Your booking has been postponed. New event date: {{new_event_date}}.\n\n" +
    "Everything else on the order stays the same. If you need to tweak anything, just reply to this email.\n\n" +
    "View your updated booking: {{order_url}}\n\n" +
    "Thanks,\n{{company_name}}",
} as const;

// Wave 24: tenant-aware money formatter. Falls back to ZAR for back-
// compat. The locale follows the currency code so a UK refund
// confirmation reads "£250" not "R 250" or "ZAR 250".
const CURRENCY_LOCALE: Record<string, string> = {
  ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "en-IE",
  AUD: "en-AU", NZD: "en-NZ", NGN: "en-NG", KES: "en-KE", CAD: "en-CA",
};
const fmtMoney = (n: number, code?: string | null) => {
  const c = (code || "ZAR").toUpperCase();
  const locale = CURRENCY_LOCALE[c] || "en-ZA";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: c }).format(n || 0);
  } catch {
    return `${c} ${(n || 0).toFixed(2)}`;
  }
};

interface OrderForEmail {
  id: string;
  company_id: string;
  client_email: string | null;
  client_name: string | null;
  order_number: string | null;
  event_date: string | null;
  event_name: string | null;
}

interface CompanyForEmail {
  id: string;
  company_name: string | null;
}

interface CompanyForEmailExt extends CompanyForEmail {
  refund_process_days: number | null;
  // Wave 24: pulled so refund / cancellation emails format amounts
  // in the tenant's currency rather than always ZAR.
  currency: string | null;
}

async function fetchOrderAndCompany(orderId: string): Promise<{ order: OrderForEmail | null; company: CompanyForEmailExt | null }> {
  const sb = resolveServerClient();
  const { data: order, error: orderErr } = await sb
    .from("orders")
    .select("id, company_id, client_email, client_name, order_number, event_date, event_name")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) console.error("[email/cancellationEmails/fetchOrderAndCompany] orders lookup failed:", orderErr);
  if (!order) return { order: null, company: null };
  // refund_process_days landed in the companies_financial_settings_columns
  // migration; cast keeps us off the still-stale Supabase Database types.
  const { data: company, error: companyErr } = await (sb as any)
    .from("companies")
    .select("id, company_name, refund_process_days, currency")
    .eq("id", (order as any).company_id)
    .maybeSingle();
  if (companyErr) console.error("[email/cancellationEmails/fetchOrderAndCompany] companies lookup failed:", companyErr);
  return { order: order as any, company: (company as any) || null };
}

/** Per-tenant refund SLA phrase from companies.refund_process_days.
 *  Falls back to the previous "within the next few business days"
 *  copy when nothing is configured so a tenant who never opens
 *  Settings -> Financial doesn't get an awkward "0 business days". */
function refundSlaPhrase(company: CompanyForEmailExt | null): string {
  const days = Number(company?.refund_process_days);
  if (!Number.isFinite(days) || days <= 0) return "within the next few business days";
  return `within ${days} business day${days === 1 ? "" : "s"}`;
}

function commonVars(order: OrderForEmail, company: CompanyForEmailExt | null): Record<string, string> {
  const firstName = String(order.client_name || "").trim().split(" ")[0] || "there";
  const orderNumber = order.order_number || `#${String(order.id).slice(0, 8)}`;
  // Wave 24: locale for the long-form event date follows the tenant
  // currency so a UK tenant reads "12 May 2026" (en-GB) and a US one
  // reads "May 12, 2026" (en-US) instead of always en-ZA. Long-form
  // months stay unambiguous either way; this fixes the comma + word
  // order that gives away "this email was templated for SA".
  const code = (company?.currency || "ZAR").toUpperCase();
  const localeFor: Record<string, string> = {
    ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "en-IE",
    AUD: "en-AU", NZD: "en-NZ", NGN: "en-NG", KES: "en-KE", CAD: "en-CA",
  };
  const locale = localeFor[code] || "en-ZA";
  const eventDateLabel = order.event_date
    ? ` for ${new Date(order.event_date).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}`
    : "";
  return {
    client_first_name: firstName,
    order_number: orderNumber,
    event_date_label: eventDateLabel,
    company_name: company?.company_name || "",
    tenant_name: company?.company_name || "",
    event_name: order.event_name || orderNumber,
  };
}

/**
 * Wave 28.2: third arg lets callers pick the payout variant.
 * Back-compat: existing callers pass just `(orderId, refundAmount)` and
 * get the refund paragraph as before. New callers pass
 * `(orderId, 0, { creditAmount: 485 })` for the credit variant.
 */
export async function sendCancellationEmail(
  orderId: string,
  refundAmount: number,
  opts?: { creditAmount?: number },
): Promise<void> {
  try {
    const { order, company } = await fetchOrderAndCompany(orderId);
    if (!order?.client_email) return;

    const creditAmount = Number(opts?.creditAmount) || 0;
    const baseVars = commonVars(order, company);
    const slaPhrase = refundSlaPhrase(company);
    const currencyCode = company?.currency ?? null;

    let payoutParagraph: string;
    if (creditAmount > 0) {
      payoutParagraph = FALLBACK_BODIES.cancellation_with_credit_paragraph
        .split("{{credit_amount}}")
        .join(fmtMoney(creditAmount, currencyCode));
    } else if (refundAmount > 0) {
      payoutParagraph = FALLBACK_BODIES.cancellation_with_refund_paragraph
        .split("{{refund_amount}}")
        .join(fmtMoney(refundAmount, currencyCode))
        .split("{{refund_sla_phrase}}")
        .join(slaPhrase);
    } else {
      payoutParagraph = FALLBACK_BODIES.cancellation_no_refund_paragraph;
    }

    const fallbackSubject = formatCancellationSubject({
      eventName: order.event_name,
      tenantName: company?.company_name ?? null,
      refundAmount,
      currencyCode,
    });

    // TIGHTEN I.114: mint a /c/order/{id}?t=... link so {{order_url}}
    // resolves to a working URL.
    const orderUrl = await mintOrderCustomerLink({
      sb: resolveServerClient(),
      companyId: order.company_id,
      orderId: order.id,
      label: "email-cancellation-approved",
    });

    const resolved = await resolveEmailTemplate({
      companyId: order.company_id,
      templateType: "cancellation_approved",
      variables: {
        ...baseVars,
        // Wave 28.2: refund_paragraph stays the variable name for
        // back-compat with tenant template overrides; the value now
        // carries either the refund OR credit copy depending on choice.
        refund_paragraph: payoutParagraph,
        refund_amount: fmtMoney(refundAmount, currencyCode),
        credit_amount: fmtMoney(creditAmount, currencyCode),
        refund_sla_phrase: slaPhrase,
        refund_process_days: String(company?.refund_process_days ?? ""),
        order_url: orderUrl,
      },
      fallback: {
        subject: fallbackSubject,
        bodyHtml: FALLBACK_BODIES.cancellation,
      },
    });

    await emailService.sendEmail({
      companyId: order.company_id,
      to: order.client_email,
      subject: resolved.subject,
      body: resolved.bodyHtml,
      bypassQuarantine: true,
      // Wave 17 audit: server-side caller; pass the resolved client
      // so getEmailConfig can read email_provider_settings under
      // service-role - otherwise RLS hides the row and sendEmail
      // returns "no_provider" silently.
      _client: resolveServerClient(),
    } as any);
  } catch (e) {
    console.warn("[sendCancellationEmail] failed:", e);
  }
}

export async function sendRefundPaidEmail(orderId: string, refundAmount: number): Promise<void> {
  try {
    const { order, company } = await fetchOrderAndCompany(orderId);
    if (!order?.client_email) return;

    const currencyCode = company?.currency ?? null;
    const fallbackSubject = formatRefundPaidSubject({
      amount: refundAmount,
      eventName: order.event_name,
      currencyCode,
    });

    // TIGHTEN I.114: order URL for the refund-confirmation email.
    const orderUrl = await mintOrderCustomerLink({
      sb: resolveServerClient(),
      companyId: order.company_id,
      orderId: order.id,
      label: "email-refund-paid",
    });

    const resolved = await resolveEmailTemplate({
      companyId: order.company_id,
      templateType: "refund_paid",
      variables: {
        ...commonVars(order, company),
        refund_amount: fmtMoney(refundAmount, currencyCode),
        amount: fmtMoney(refundAmount, currencyCode),
        order_url: orderUrl,
      },
      fallback: {
        subject: fallbackSubject,
        bodyHtml: FALLBACK_BODIES.refund_paid,
      },
    });

    await emailService.sendEmail({
      companyId: order.company_id,
      to: order.client_email,
      subject: resolved.subject,
      body: resolved.bodyHtml,
      bypassQuarantine: true,
      // Wave 17 audit: server-side caller; pass the resolved client
      // so getEmailConfig can read email_provider_settings under
      // service-role - otherwise RLS hides the row and sendEmail
      // returns "no_provider" silently.
      _client: resolveServerClient(),
    } as any);
  } catch (e) {
    console.warn("[sendRefundPaidEmail] failed:", e);
  }
}

export async function sendPostponementApprovedEmail(orderId: string, newEventDate: string | null): Promise<void> {
  try {
    const { order, company } = await fetchOrderAndCompany(orderId);
    if (!order?.client_email) return;

    const currencyCode = company?.currency ?? null;
    // Wave 24: locale follows tenant currency so a UK / US tenant
    // reads dates in their region's word order, not en-ZA.
    const localeFor: Record<string, string> = {
      ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "en-IE",
      AUD: "en-AU", NZD: "en-NZ", NGN: "en-NG", KES: "en-KE", CAD: "en-CA",
    };
    const locale = localeFor[(currencyCode || "ZAR").toUpperCase()] || "en-ZA";
    const newDateLabel = newEventDate
      ? new Date(newEventDate).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
      : "to be confirmed";

    const fallbackSubject = formatPostponementSubject({
      eventName: order.event_name,
      newDate: newEventDate,
      currencyCode,
    });

    // TIGHTEN I.114: order URL for the postponement email - especially
    // important here because the client needs to confirm the new date
    // visually on their booking page.
    const orderUrl = await mintOrderCustomerLink({
      sb: resolveServerClient(),
      companyId: order.company_id,
      orderId: order.id,
      label: "email-postponement-approved",
    });

    const resolved = await resolveEmailTemplate({
      companyId: order.company_id,
      templateType: "postponement_approved",
      variables: {
        ...commonVars(order, company),
        new_event_date: newDateLabel,
        new_date: newDateLabel,
        order_url: orderUrl,
      },
      fallback: {
        subject: fallbackSubject,
        bodyHtml: FALLBACK_BODIES.postponement_approved,
      },
    });

    await emailService.sendEmail({
      companyId: order.company_id,
      to: order.client_email,
      subject: resolved.subject,
      body: resolved.bodyHtml,
      bypassQuarantine: true,
      // Wave 17 audit: server-side caller; pass the resolved client
      // so getEmailConfig can read email_provider_settings under
      // service-role - otherwise RLS hides the row and sendEmail
      // returns "no_provider" silently.
      _client: resolveServerClient(),
    } as any);
  } catch (e) {
    console.warn("[sendPostponementApprovedEmail] failed:", e);
  }
}
