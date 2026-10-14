/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Single delivery gate for scheduled/background email jobs.
 *
 * A deliberate operator action continues to call emailService directly.
 * Cron jobs call this helper, which either sends immediately or records a
 * durable `awaiting_approval` outbox row according to Email settings.
 */
import { emailService, type EmailSendDetailed, type SendEmailPayload } from "@/services/emailService";

export type QueueDeliveryMode = "automatic" | "manual_review";

export interface AutomatedEmailPayload extends SendEmailPayload {
  triggerEvent: string;
  triggerRefId?: string | null;
  recipientName?: string | null;
}

export interface AutomatedDeliveryResult extends EmailSendDetailed {
  heldForApproval: boolean;
  queueId?: string;
}

export async function getAutomatedDeliveryMode(
  supabase: any,
  companyId: string,
  templateType?: string,
): Promise<QueueDeliveryMode> {
  const { data, error } = await supabase
    .from("email_provider_settings")
    .select("automation_preferences")
    .eq("company_id", companyId)
    .neq("provider", "mailchimp")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not read email delivery setting: ${error.message}`);
  const preferences = (data as any)?.automation_preferences || {};
  const perTemplate = preferences.template_delivery_modes || {};
  if (templateType && perTemplate[templateType] === "manual_review") return "manual_review";
  return preferences.queue_delivery_mode === "manual_review"
    ? "manual_review"
    : "automatic";
}

/** Send an automatic email now, or retain it as an approval item. */
export async function deliverAutomatedEmail(
  supabase: any,
  payload: AutomatedEmailPayload,
): Promise<AutomatedDeliveryResult> {
  const templateType = payload.template || payload.templateType || "custom";
  const mode = await getAutomatedDeliveryMode(supabase, payload.companyId, templateType);
  if (mode === "automatic") {
    const result = await emailService.sendEmailDetailed({ ...payload, _client: supabase } as any);
    return { ...result, heldForApproval: false };
  }

  const referenceId = payload.triggerRefId || payload.orderId || payload.quoteId || null;
  let existing = supabase
    .from("outgoing_email_queue")
    .select("id")
    .eq("company_id", payload.companyId)
    .eq("trigger_event", payload.triggerEvent)
    .eq("template_type", templateType)
    .eq("to_email", payload.to)
    .in("status", ["awaiting_approval", "queued", "in_progress"])
    .limit(1);
  if (referenceId) existing = existing.eq("trigger_ref_id", referenceId);
  const { data: duplicate, error: duplicateError } = await existing.maybeSingle();
  if (duplicateError) {
    return { success: false, error: duplicateError.message, error_code: "unknown", heldForApproval: true };
  }
  if (duplicate?.id) return { success: true, heldForApproval: true, queueId: duplicate.id };

  const { data: queued, error } = await supabase
    .from("outgoing_email_queue")
    .insert({
      company_id: payload.companyId,
      to_email: payload.to,
      to_name: payload.recipientName || payload.variables?.client_name || payload.variables?.first_name || null,
      subject: payload.subject,
      body: payload.body || "",
      template_type: templateType,
      variables: payload.variables || {},
      trigger_event: payload.triggerEvent,
      trigger_ref_id: referenceId,
      scheduled_for: null,
      attempts: 0,
      status: "awaiting_approval",
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message, error_code: "unknown", heldForApproval: true };
  return { success: true, heldForApproval: true, queueId: queued.id };
}
