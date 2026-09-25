/* Server-only lifecycle state for provider checkout sessions. */
import { getServiceSupabase } from "@/lib/supabase/service";

export type PaymentAttemptStatus = "pending" | "succeeded" | "failed" | "expired";

export interface CreatePaymentAttemptInput {
  companyId: string;
  clientId: string | null;
  orderId: string | null;
  invoiceId: string | null;
  provider: "payfast" | "yoco" | "stripe";
  providerSessionId: string;
  paymentType: string;
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
  expiresAt?: string | null;
}

export async function createPaymentAttempt(input: CreatePaymentAttemptInput) {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("payment_attempts")
    .insert({
      company_id: input.companyId,
      client_id: input.clientId,
      order_id: input.orderId,
      invoice_id: input.invoiceId,
      provider: input.provider,
      provider_session_id: input.providerSessionId,
      payment_type: input.paymentType,
      amount: input.amount,
      currency: input.currency || "ZAR",
      metadata: input.metadata || {},
      expires_at: input.expiresAt || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function transitionPaymentAttempt(input: {
  provider: string;
  providerSessionId?: string | null;
  attemptId?: string | null;
  status: Exclude<PaymentAttemptStatus, "pending">;
  providerStatus?: string | null;
  failureReason?: string | null;
}) {
  const sb = getServiceSupabase();
  let query = sb
    .from("payment_attempts")
    .select("*")
    .eq("provider", input.provider)
    .eq("status", "pending");

  if (input.attemptId) query = query.eq("id", input.attemptId);
  else if (input.providerSessionId) query = query.eq("provider_session_id", input.providerSessionId);
  else return { attempt: null, changed: false };

  const { data: current, error: readError } = await query.maybeSingle();
  if (readError) throw readError;
  if (!current) return { attempt: null, changed: false };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status,
    provider_status: input.providerStatus || null,
    failure_reason: input.failureReason || null,
    last_checked_at: now,
    updated_at: now,
  };
  if (input.status === "succeeded") patch.succeeded_at = now;
  else patch.failed_at = now;

  const { data: attempt, error } = await sb
    .from("payment_attempts")
    .update(patch)
    .eq("id", current.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return { attempt: attempt || null, changed: !!attempt };
}

export async function attachPaymentAttemptSession(
  attemptId: string,
  providerSessionId: string,
) {
  const sb = getServiceSupabase();
  const { error } = await sb
    .from("payment_attempts")
    .update({ provider_session_id: providerSessionId, updated_at: new Date().toISOString() })
    .eq("id", attemptId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function touchPaymentAttempt(id: string, providerStatus: string | null) {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  await sb
    .from("payment_attempts")
    .update({ last_checked_at: now, provider_status: providerStatus, updated_at: now })
    .eq("id", id)
    .eq("status", "pending");
}
