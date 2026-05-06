/**
 * Cancellation + refund email helpers.
 *
 * Each helper follows the same shape:
 *   1. Look up email_templates for an active template of the right type
 *      tied to this tenant.
 *   2. Fall back to a sensible default body that explains exactly what
 *      happened (including refund amount + processing timeline).
 *   3. Substitute {{vars}} into subject + body.
 *   4. Send via emailService.
 *
 * These bypass the comms_paused_until quarantine gate -- a refund or
 * cancellation is a critical service comm the client needs no matter
 * what import-batch state their record is in. blocked_contacts still
 * applies (a deliberately blocked contact stays blocked).
 */
import { supabase } from "@/integrations/supabase/client";
import { emailService } from "@/services/emailService";
import {
  formatCancellationSubject,
  formatPostponementSubject,
  formatRefundPaidSubject,
} from "@/lib/email/subjectFormatters";

interface TemplateRow {
  subject: string;
  body: string;
}

// Subject defaults are produced by the centralised formatters at send
// time so that event name, tenant and amount line the inbox cleanly. The
// body defaults stay here -- those are still copy the operator can
// override per tenant via email_templates.
const DEFAULT_TEMPLATES = {
  cancellation: {
    subject: "",
    body:
      "Hi {{client_first_name}},\n\n" +
      "This confirms that order {{order_number}}{{event_date_label}} has been cancelled.\n\n" +
      "{{refund_paragraph}}" +
      "If this wasn't expected, please reply to this email and we'll sort it out straight away.\n\n" +
      "Thanks,\n{{company_name}}",
  },
  cancellation_with_refund_paragraph: {
    subject: "",
    body:
      "Per our cancellation policy, a refund of {{refund_amount}} is due. " +
      "We'll process the EFT within the next few business days and send confirmation when it's gone out.\n\n",
  },
  cancellation_no_refund_paragraph: {
    subject: "",
    body:
      "Per our cancellation policy (sent on quote acceptance), no refund is due for this cancellation.\n\n",
  },
  refund_paid: {
    subject: "",
    body:
      "Hi {{client_first_name}},\n\n" +
      "Confirming that the refund of {{refund_amount}} for the cancelled order {{order_number}} has been processed. " +
      "It should land in your account within the next 1-3 business days, depending on your bank.\n\n" +
      "Reply to this email if anything looks off.\n\n" +
      "Thanks,\n{{company_name}}",
  },
  postponement_approved: {
    subject: "",
    body:
      "Hi {{client_first_name}},\n\n" +
      "Your booking has been postponed. New event date: {{new_event_date}}.\n\n" +
      "Everything else on the order stays the same. If you need to tweak anything, just reply to this email.\n\n" +
      "Thanks,\n{{company_name}}",
  },
} as const;

type TemplateType = keyof typeof DEFAULT_TEMPLATES;

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function substitute(template: string, vars: Record<string, string | number | null | undefined>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v ?? ""));
  }
  return out;
}

async function loadTemplate(companyId: string, type: TemplateType): Promise<TemplateRow> {
  try {
    const { data } = await supabase
      .from("email_templates")
      .select("subject, body")
      .eq("company_id", companyId)
      .eq("template_type", type)
      .eq("is_active", true)
      .maybeSingle();
    if (data && (data as any).subject && (data as any).body) {
      return data as TemplateRow;
    }
  } catch (e) {
    console.warn("[cancellationEmails] template lookup failed:", e);
  }
  return DEFAULT_TEMPLATES[type] as TemplateRow;
}

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

async function fetchOrderAndCompany(orderId: string): Promise<{ order: OrderForEmail | null; company: CompanyForEmail | null }> {
  const { data: order } = await supabase
    .from("orders")
    .select("id, company_id, client_email, client_name, order_number, event_date, event_name")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { order: null, company: null };
  const { data: company } = await supabase
    .from("companies")
    .select("id, company_name" as any)
    .eq("id", (order as any).company_id)
    .maybeSingle();
  return { order: order as any, company: (company as any) || null };
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
  };
}

export async function sendCancellationEmail(orderId: string, refundAmount: number): Promise<void> {
  try {
    const { order, company } = await fetchOrderAndCompany(orderId);
    if (!order?.client_email) return;

    const tpl = await loadTemplate(order.company_id, "cancellation");
    const vars = commonVars(order, company);

    const refundParagraph = refundAmount > 0
      ? substitute(DEFAULT_TEMPLATES.cancellation_with_refund_paragraph.body, {
          ...vars,
          refund_amount: fmtZAR(refundAmount),
        })
      : DEFAULT_TEMPLATES.cancellation_no_refund_paragraph.body;

    const subject = clean(tpl.subject)
      ? substitute(tpl.subject, vars)
      : formatCancellationSubject({
          eventName: order.event_name,
          tenantName: company?.company_name ?? null,
          refundAmount,
        });
    const body = substitute(tpl.body, {
      ...vars,
      refund_paragraph: refundParagraph,
      refund_amount: fmtZAR(refundAmount),
    });

    await emailService.sendEmail({
      companyId: order.company_id,
      to: order.client_email,
      subject,
      body,
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

    const tpl = await loadTemplate(order.company_id, "refund_paid");
    const vars = {
      ...commonVars(order, company),
      refund_amount: fmtZAR(refundAmount),
    };
    const subject = clean(tpl.subject)
      ? substitute(tpl.subject, vars)
      : formatRefundPaidSubject({
          amount: refundAmount,
          eventName: order.event_name,
        });
    await emailService.sendEmail({
      companyId: order.company_id,
      to: order.client_email,
      subject,
      body: substitute(tpl.body, vars),
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

    const tpl = await loadTemplate(order.company_id, "postponement_approved");
    const vars = {
      ...commonVars(order, company),
      new_event_date: newEventDate
        ? new Date(newEventDate).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
        : "to be confirmed",
    };
    const subject = clean(tpl.subject)
      ? substitute(tpl.subject, vars)
      : formatPostponementSubject({
          eventName: order.event_name,
          newDate: newEventDate,
        });
    await emailService.sendEmail({
      companyId: order.company_id,
      to: order.client_email,
      subject,
      body: substitute(tpl.body, vars),
      bypassQuarantine: true,
    });
  } catch (e) {
    console.warn("[sendPostponementApprovedEmail] failed:", e);
  }
}
