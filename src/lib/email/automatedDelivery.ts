/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Single on/off gate for automatic emails (Email settings ->
 * "Automatic" / "Off").
 *
 * - Cron jobs call deliverAutomatedEmail: sends when the email is on,
 *   does nothing when it is off.
 * - emailService.sendEmailDetailed calls skipIfTurnedOff for every other
 *   send of a listed automatic email (order status, receipts,
 *   cancellations, ...), unless the send is an admin's own "Send" action
 *   (deliveryContext: "manual").
 *
 * Which emails and which rule: src/lib/email/automatedEmailTemplates.ts.
 */
import { emailService, type EmailSendDetailed, type SendEmailPayload } from "@/services/emailService";
import {
  isApprovalControllable,
  resolveEmailDeliveryMode,
  type EmailDeliveryMode,
} from "@/lib/email/automatedEmailTemplates";

export type QueueDeliveryMode = EmailDeliveryMode;

export interface AutomatedEmailPayload extends SendEmailPayload {
  triggerEvent: string;
  triggerRefId?: string | null;
  recipientName?: string | null;
}

export interface AutomatedDeliveryResult extends EmailSendDetailed {
  /** Kept for existing callers; nothing is held any more. */
  heldForApproval: boolean;
  /** True when the email is turned off in Email settings and was not sent. */
  skippedBySettings?: boolean;
}

/**
 * The key Email settings knows this email by. Some senders pass a generic
 * `template` (e.g. "transactional") plus the real type in `templateType`;
 * prefer whichever one is on the Email settings list.
 */
export function deliveryKey(payload: { template?: string; templateType?: string; automationKey?: string }): string | undefined {
  if (payload.automationKey) return payload.automationKey;
  if (payload.templateType && isApprovalControllable(payload.templateType)) return payload.templateType;
  return payload.template || payload.templateType;
}

export async function readDeliveryPreferences(supabase: any, companyId: string): Promise<Record<string, any>> {
  const { data, error } = await supabase
    .from("email_provider_settings")
    .select("automation_preferences")
    .eq("company_id", companyId)
    .neq("provider", "mailchimp")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not read email delivery setting: ${error.message}`);
  return (data as any)?.automation_preferences || {};
}

export async function getAutomatedDeliveryMode(
  supabase: any,
  companyId: string,
  templateType?: string,
): Promise<QueueDeliveryMode> {
  return resolveEmailDeliveryMode(await readDeliveryPreferences(supabase, companyId), templateType);
}

const TURNED_OFF: AutomatedDeliveryResult = {
  success: true,
  heldForApproval: false,
  skippedBySettings: true,
};

/** Send an automatic email when it is on in Email settings; otherwise do nothing. */
export async function deliverAutomatedEmail(
  supabase: any,
  payload: AutomatedEmailPayload,
): Promise<AutomatedDeliveryResult> {
  const mode = await getAutomatedDeliveryMode(supabase, payload.companyId, deliveryKey(payload) || "custom");
  if (mode === "off") return { ...TURNED_OFF };
  const result = await emailService.sendEmailDetailed({ ...payload, _client: supabase, _deliveryApproved: true } as any);
  return { ...result, heldForApproval: false };
}

/**
 * emailService gate. Returns a "not sent" result when the email is turned
 * off in Email settings, or null when it should be sent. A settings read
 * failure sends the email (today's behaviour) rather than silently
 * dropping it.
 */
export async function skipIfTurnedOff(
  supabase: any,
  payload: SendEmailPayload,
): Promise<AutomatedDeliveryResult | null> {
  const templateKey = deliveryKey(payload);
  if (!payload.companyId || !isApprovalControllable(templateKey)) return null;
  try {
    const mode = await getAutomatedDeliveryMode(supabase, payload.companyId, templateKey);
    return mode === "off" ? { ...TURNED_OFF } : null;
  } catch (e: any) {
    console.error("[automatedDelivery] delivery setting unreadable, sending now:", e?.message || e);
    return null;
  }
}
