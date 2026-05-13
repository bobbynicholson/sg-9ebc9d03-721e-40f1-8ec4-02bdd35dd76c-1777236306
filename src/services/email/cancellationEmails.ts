/**
 * Cancellation + refund email helpers.
 *
 * Each helper now goes through the central resolveEmailTemplate so
 * subject / body resolution follows one path: tenant override ->
 * global default -> hardcoded fallback. The fallback bodies stay here
 * as the source-of-truth copy that seeds the DB defaults.
 *
 * These bypass the comms_paused_until quarantine gate -- a refund or
 * cancellation is a critical service comm the client needs no matter
 * what import-batch state their record is in. blocked_contacts still
 * applies (a deliberately blocked contact stays blocked).
 */
import { supabase } from "@/integrations/supabase/client";
import { emailService } from "@/services/emailService";
import { resolveEmailTemplate } from "@/services/email/templateResolver";
import {
  formatCancellationSubject,
  formatPostponementSubject,
  formatRefundPaidSubject,
} from "@/lib/email/subjectFormatters";

// Body fallbacks live here so the same copy seeds the DB. Subjects are
// produced by the centralised formatters when no DB override exists.
const FALLBACK_BODIES = {
  cancellation:
    "Hi {{client_first_name}},\n\n" +
    "This confirms that order {{order_number}}{{event_date_label}} has been cancelled.\n\n" +
    "{{refund_paragraph}}" +
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
  refund_paid:
    "Hi {{client_first_name}},\n\n" +
    "Confirming that the refund of {{refund_amount}} for the cancelled order {{order_number}} has been processed. " +
    "It should land in your account within the next 1-3 business days, depending on your bank.\n\n" +
    "Reply to this email if anything looks off.\n\n" +
    "Thanks,\n{{company_name}}",
  postponement_approved:
    "Hi {{client_first_name}},\n\n" +
    "Your booking has been postponed. New event date: {{new_event_date}}.\n\n" +
    "Everything else on the order stays the same. If you need to tweak anything, just reply to this email.\n\n" +
    "Thanks,\n{{company_name}}",
} as const;

const fmtZAR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n || 0);

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
}

async function fetchOrderAndCompany(orderId: string): Promise<{ order: OrderForEmail | null; company: CompanyForEmailExt | null }> {
  const { data: order } = await supabase
    .from("orders")
    .select("id, company_id, client_email, client_name, order_number, event_date, event_name")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { order: null, company: null };
  // refund_process_days landed in the companies_financial_settings_columns
  // migration; cast keeps us off the still-stale Supabase Database types.
  const { data: company } = await (supabase as any)
    .from("companies")
    .select("id, company_name, refund_process_days")
    .eq("id", (order as any).company_id)
    .maybeSingle();
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

function commonVars(order: OrderForEmail, company: CompanyForEmail | null): Record<string, string> {
  const firstName = String(order.client_name || "").trim().split(" ")[0] || "there";
  const orderNumber = order.order_number || `#${String(order.id).slice(0, 8)}`;
  const eventDateLabel = order.event_date
    ? ` for ${new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}`
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

export async function sendCancellationEmail(orderId: string, refundAmount: number): Promise<void> {
  try {
    const { order, company } = await fetchOrderAndCompany(orderId);
    if (!order?.client_email) return;

    const baseVars = commonVars(order, company);
    const slaPhrase = refundSlaPhrase(company);
    const refundParagraph = refundAmount > 0
      ? FALLBACK_BODIES.cancellation_with_refund_paragraph
          .split("{{refund_amount}}")
          .join(fmtZAR(refundAmount))
          .split("{{refund_sla_phrase}}")
          .join(slaPhrase)
      : FALLBACK_BODIES.cancellation_no_refund_paragraph;

    const fallbackSubject = formatCancellationSubject({
      eventName: order.event_name,
      tenantName: company?.company_name ?? null,
      refundAmount,
    });

    const resolved = await resolveEmailTemplate({
      companyId: order.company_id,
      templateType: "cancellation_approved",
      variables: {
        ...baseVars,
        refund_paragraph: refundParagraph,
        refund_amount: fmtZAR(refundAmount),
        refund_sla_phrase: slaPhrase,
        refund_process_days: String(company?.refund_process_days ?? ""),
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
    });
  } catch (e) {
    console.warn("[sendCancellationEmail] failed:", e);
  }
}

export async function sendRefundPaidEmail(orderId: string, refundAmount: number): Promise<void> {
  try {
    const { order, company } = await fetchOrderAndCompany(orderId);
    if (!order?.client_email) return;

    const fallbackSubject = formatRefundPaidSubject({
      amount: refundAmount,
      eventName: order.event_name,
    });

    const resolved = await resolveEmailTemplate({
      companyId: order.company_id,
      templateType: "refund_paid",
      variables: {
        ...commonVars(order, company),
        refund_amount: fmtZAR(refundAmount),
        amount: fmtZAR(refundAmount),
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
    });
  } catch (e) {
    console.warn("[sendRefundPaidEmail] failed:", e);
  }
}

export async function sendPostponementApprovedEmail(orderId: string, newEventDate: string | null): Promise<void> {
  try {
    const { order, company } = await fetchOrderAndCompany(orderId);
    if (!order?.client_email) return;

    const fallbackSubject = formatPostponementSubject({
      eventName: order.event_name,
      newDate: newEventDate,
    });

    const resolved = await resolveEmailTemplate({
      companyId: order.company_id,
      templateType: "postponement_approved",
      variables: {
        ...commonVars(order, company),
        new_event_date: newEventDate
          ? new Date(newEventDate).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
          : "to be confirmed",
        new_date: newEventDate
          ? new Date(newEventDate).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
          : "to be confirmed",
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
    });
  } catch (e) {
    console.warn("[sendPostponementApprovedEmail] failed:", e);
  }
}
