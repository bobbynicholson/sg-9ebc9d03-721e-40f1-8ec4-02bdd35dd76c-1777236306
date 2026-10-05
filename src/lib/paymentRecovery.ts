/* eslint-disable @typescript-eslint/no-explicit-any */
import { applyVerifiedPayment, settleTenantGatewayPayment } from "@/lib/tenantGatewaySettlement";
import { fetchPayFastHistoryPage, type PayFastHistoryTransaction } from "@/lib/payfastService";

export async function recoverVerifiedPaymentEvents(admin: any, limit = 25) {
  const cutoff = new Date(Date.now() - 60000).toISOString();
  const { data, error } = await admin.from("payment_gateway_events").select("*")
    .is("processed_at", null).or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true }).limit(limit);
  if (error) throw error;
  let recovered = 0;
  const errors: string[] = [];
  for (const event of data || []) {
    try {
      await applyVerifiedPayment(admin, event.payload, event.id);
      recovered += 1;
    } catch (failure: any) {
      errors.push(`event ${event.id}: ${failure.message}`);
      const { error: saveError } = await admin.from("payment_gateway_events").update({
        last_error: String(failure.message).slice(0, 500), last_checked_at: new Date().toISOString(),
      }).eq("id", event.id).is("processed_at", null);
      if (saveError) throw saveError;
    }
  }
  return { recovered, errors };
}

export async function recoverPayFastTransaction(admin: any, gateway: any, transaction: PayFastHistoryTransaction) {
  if (transaction.custom_str3 && transaction.custom_str3 !== gateway.company_id) return null;
  const reference = transaction.custom_str5 || transaction.m_payment_id;
  let attempt: any = null;
  if (reference && /^[0-9a-f-]{36}$/i.test(reference)) {
    const { data, error } = await admin.from("payment_attempts").select("*")
      .eq("company_id", gateway.company_id).eq("provider", "payfast")
      .or(`id.eq.${reference},provider_session_id.eq.${reference}`).maybeSingle();
    if (error) throw error;
    attempt = data;
  }
  if (attempt) {
    const metadata = attempt.metadata || {};
    if ((metadata.gatewayId && metadata.gatewayId !== gateway.id) ||
        (metadata.merchantId && String(metadata.merchantId) !== String(gateway.merchantId)) ||
        (metadata.gatewayIsTest !== undefined && String(metadata.gatewayIsTest) !== String(gateway.is_test))) return null;
    if ((transaction.custom_str1 && transaction.custom_str1 !== (attempt.payment_type === "invoice" ? attempt.invoice_id : attempt.order_id)) ||
        (transaction.custom_str2 && transaction.custom_str2 !== attempt.payment_type) ||
        (transaction.custom_str4 && transaction.custom_str4 !== "invoice" && transaction.custom_str4 !== attempt.invoice_id)) {
      throw new Error("PayFast history metadata does not match saved checkout");
    }
  } else if (transaction.custom_str5) {
    throw new Error("PayFast history refers to an unknown checkout attempt");
  }
  const paymentType = attempt?.payment_type || transaction.custom_str2;
  const orderId = attempt
    ? attempt.payment_type === "invoice" ? attempt.invoice_id : attempt.order_id
    : transaction.custom_str1;
  // A merchant may also receive payments outside this app. Never infer an
  // order from a plan name, description or bare merchant reference.
  if (!attempt && (!transaction.custom_str1 || !["invoice", "deposit", "balance"].includes(paymentType || ""))) {
    return null;
  }
  return settleTenantGatewayPayment({ admin, provider: "payfast", transactionId: transaction.pf_payment_id,
    companyId: gateway.company_id, orderId, paymentType,
    invoiceId: attempt?.invoice_id || (/^[0-9a-f-]{36}$/i.test(transaction.custom_str4 || "") ? transaction.custom_str4 : null),
    paymentAttempt: attempt, amount: Number(transaction.amount_gross), currency: transaction.currency });
}

/** One bounded history page. Persist the cursor only after every relevant row settles. */
export async function recoverPayFastGateway(admin: any, gateway: any, credentials: any) {
  const today = new Date().toISOString().slice(0, 10);
  const sourceId = gateway.recoverySourceId || gateway.id;
  const { data: savedCursor, error } = await admin.from("payfast_recovery_cursors").select("*").eq("source_id", sourceId).maybeSingle();
  let cursor = savedCursor;
  if (error) throw error;
  if (!cursor) {
    const { data: earliest, error: earliestError } = await admin.from("payment_attempts").select("created_at")
      .eq("company_id", gateway.company_id).eq("provider", "payfast")
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (earliestError) throw earliestError;
    const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const from = earliest?.created_at?.slice(0, 10);
    cursor = { source_id: sourceId, gateway_id: gateway.id, next_date: from && from < defaultFrom ? from : defaultFrom, page_offset: 0, recent_offset: 0 };
    const saved = await admin.from("payfast_recovery_cursors").upsert(cursor, { onConflict: "source_id", ignoreDuplicates: true });
    if (saved.error) throw saved.error;
  }
  let recovered = 0;
  try {
    // Fresh charges take priority over the historical backlog after an outage.
    // This offset is separate from the persistent oldest-unscanned-date cursor.
    const recentFrom = new Date(Date.now() - 2 * 86400000).toISOString().slice(0,10);
    const recent = await fetchPayFastHistoryPage(credentials, {
      from: recentFrom, to: today, offset: cursor.recent_offset || 0, limit: 100,
    });
    const failures: Error[] = [];
    for (const transaction of recent.transactions) {
      try {
        const settlement = await recoverPayFastTransaction(admin, { ...gateway, merchantId: credentials.merchantId }, transaction);
        if (settlement && !settlement.duplicate) recovered += 1;
      } catch (error: any) { failures.push(error); }
    }
    if (failures.length) throw new Error(`${failures.length} PayFast history rows need repair: ${failures[0].message}`);
    const recentSaved = await admin.from("payfast_recovery_cursors").update({
      recent_offset: recent.rawCount === 100 ? (cursor.recent_offset || 0) + 100 : 0,
    }).eq("source_id",sourceId).eq("recent_offset",cursor.recent_offset || 0);
    if (recentSaved.error) throw recentSaved.error;
    const page = await fetchPayFastHistoryPage(credentials, {
      from: cursor.next_date, to: cursor.next_date, offset: cursor.page_offset, limit: 100,
    });
    for (const transaction of page.transactions) {
      try {
        const settlement = await recoverPayFastTransaction(admin, { ...gateway, merchantId: credentials.merchantId }, transaction);
        if (settlement && !settlement.duplicate) recovered += 1;
      } catch (error: any) { failures.push(error); }
    }
    if (failures.length) throw new Error(`${failures.length} PayFast history rows need repair: ${failures[0].message}`);
    let nextDate = cursor.next_date;
    let offset = cursor.page_offset + page.rawCount;
    if (page.rawCount < 100) {
      offset = 0;
      // Re-scan the latest two days to catch provider entries posted late.
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      nextDate = nextDate < today
        ? new Date(new Date(`${nextDate}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
        : yesterday;
    }
    const saved = await admin.from("payfast_recovery_cursors").update({ next_date: nextDate, page_offset: offset,
      last_checked_at: new Date().toISOString(), last_error: null }).eq("source_id", sourceId)
      .eq("next_date", cursor.next_date).eq("page_offset", cursor.page_offset);
    if (saved.error) throw saved.error;
    return { recovered, scanning_date: cursor.next_date, caught_up: cursor.next_date >= today };
  } catch (failure: any) {
    const saved = await admin.from("payfast_recovery_cursors").update({ last_checked_at: new Date().toISOString(),
      last_error: String(failure.message).slice(0, 500) }).eq("source_id", sourceId);
    if (saved.error) throw saved.error;
    throw failure;
  }
}

/**
 * Ask Stripe (with the checkout's own saved account) whether a pending
 * attempt was paid, and settle it when Stripe confirms. This is
 * authenticated provider evidence, so it is safe to use from the return
 * page as well as the reconciliation cron when a webhook is late, lost or
 * was never configured on the tenant's Stripe account.
 */
export async function checkStripeAttemptWithProvider(admin: any, attempt: any, credentials: Record<string, string>): Promise<{
  providerStatus: string;
  paid: boolean;
  settled: boolean;
  terminalUnpaid: boolean;
}> {
  // Lazy import keeps the Stripe SDK out of modules that never need it.
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(credentials.secretKey, {
    timeout: 10000, maxNetworkRetries: 0, apiVersion: "2024-12-18.acacia" as any,
  });
  const session = await stripe.checkout.sessions.retrieve(attempt.provider_session_id);
  const providerStatus = `${session.status || "unknown"}:${session.payment_status || "unknown"}`;
  const paid = session.payment_status === "paid";
  const terminalUnpaid = session.status === "expired" && session.payment_status === "unpaid";
  if (!paid) return { providerStatus, paid, settled: false, terminalUnpaid };

  const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!intentId || session.id !== attempt.provider_session_id ||
      session.metadata?.paymentAttemptId !== String(attempt.metadata?.paymentAttemptId || attempt.id) ||
      session.metadata?.companyId !== attempt.company_id ||
      Number(session.amount_total) !== Math.round(Number(attempt.amount) * 100)) {
    throw new Error("Stripe session does not match saved checkout");
  }
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (intent.status !== "succeeded") throw new Error("Stripe paid session has no successful payment intent");
  await settleTenantGatewayPayment({ admin, provider: "stripe", transactionId: intent.id,
    companyId: attempt.company_id, orderId: attempt.payment_type === "invoice" ? attempt.invoice_id : attempt.order_id,
    paymentType: attempt.payment_type, invoiceId: attempt.invoice_id, paymentAttempt: attempt,
    amount: intent.amount_received / 100, currency: intent.currency });
  return { providerStatus, paid, settled: true, terminalUnpaid: false };
}
