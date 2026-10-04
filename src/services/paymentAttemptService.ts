/* Server-only lifecycle state for provider checkout sessions. */
import { getServiceSupabase } from "@/lib/supabase/service";

export type PaymentAttemptStatus = "pending" | "succeeded" | "failed" | "expired";

export interface CreatePaymentAttemptInput {
  /** Stable correlation ID passed through provider metadata and callbacks. */
  id: string;
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
      id: input.id,
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

/** Look up a current or legacy attempt by its stable ID or provider ID. */
export async function getPaymentAttemptByReference(provider: string, reference: string) {
  const sb = getServiceSupabase();
  // A provider session ID is not a UUID. PostgreSQL rejects comparing it
  // with the UUID id column, so skip that lookup instead of losing recovery.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference)) {
    const { data: byId, error: idError } = await sb
      .from("payment_attempts")
      .select("*")
      .eq("provider", provider)
      .eq("id", reference)
      .maybeSingle();
    if (idError) throw idError;
    if (byId) return byId;
  }

  const { data: bySession, error: sessionError } = await sb
    .from("payment_attempts")
    .select("*")
    .eq("provider", provider)
    .eq("provider_session_id", reference)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (bySession) return bySession;

  const { data: byMetadata, error: metadataError } = await sb
    .from("payment_attempts")
    .select("*")
    .eq("provider", provider)
    .contains("metadata", { paymentAttemptId: reference })
    .maybeSingle();
  if (metadataError) throw metadataError;
  return byMetadata;
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
  const baseQuery = () => sb
    .from("payment_attempts")
    .select("*")
    .eq("provider", input.provider);
  const lookupQuery = () => input.status === "succeeded"
    ? baseQuery().in("status", ["pending", "expired", "failed"])
    : baseQuery().eq("status", "pending");

  let current: any = null;
  if (input.attemptId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.attemptId)) {
    const { data, error } = await lookupQuery().eq("id", input.attemptId).maybeSingle();
    if (error) throw error;
    current = data;
  }

  // Older checkout rows used a separately generated ID in the provider
  // metadata and relied on provider_session_id for correlation. Keep those
  // sessions transitionable while new rows use the same value for both.
  const sessionReference = input.providerSessionId || input.attemptId;
  if (!current && sessionReference) {
    const { data, error } = await lookupQuery()
      .eq("provider_session_id", sessionReference)
      .maybeSingle();
    if (error) throw error;
    current = data;
  }
  if (!current && input.attemptId) {
    const { data, error } = await lookupQuery()
      .contains("metadata", { paymentAttemptId: input.attemptId })
      .maybeSingle();
    if (error) throw error;
    current = data;
  }
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
    .in("status", input.status === "succeeded" ? ["pending", "expired", "failed"] : ["pending"])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return { attempt: attempt || null, changed: !!attempt };
}

/** Mark settlement only after the provider event and ledger write are verified. */
export async function markPaymentAttemptSucceeded(input: {
  provider: string;
  attemptId: string | null | undefined;
  providerSessionId?: string | null;
  providerStatus?: string | null;
}) {
  if (!input.attemptId) return;
  const transitioned = await transitionPaymentAttempt({
    provider: input.provider,
    attemptId: input.attemptId,
    providerSessionId: input.providerSessionId,
    status: "succeeded",
    providerStatus: input.providerStatus,
  });
  if (transitioned.changed || transitioned.attempt?.status === "succeeded") return;

  // Idempotent delivery after an earlier successful transition is normal.
  // Confirm that saved state instead of treating it as a failed write.
  const current = await getPaymentAttemptByReference(input.provider, input.attemptId);
  if (current?.status !== "succeeded") {
    throw new Error("The confirmed payment attempt could not be marked successful");
  }
}

export async function attachPaymentAttemptSession(
  attemptId: string,
  providerSessionId: string,
) {
  const sb = getServiceSupabase();
  if (!providerSessionId) throw new Error("Provider session ID missing");
  const { data, error } = await sb.from("payment_attempts")
    .update({ provider_session_id: providerSessionId, updated_at: new Date().toISOString() })
    .eq("id", attemptId).select("id").single();
  if (error) throw error;
  if (!data) throw new Error("Checkout tracking row disappeared");
}

export async function touchPaymentAttempt(id: string, providerStatus: string | null) {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("payment_attempts")
    .update({ last_checked_at: now, provider_status: providerStatus, updated_at: now })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw error;
}
