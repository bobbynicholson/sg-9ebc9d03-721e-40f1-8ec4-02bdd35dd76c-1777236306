/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/payments/confirm-return { public_token, payment_attempt_id }
 *
 * Read-only status check for the provider return page. A browser redirect
 * can be replayed or opened manually, so only the provider webhook may
 * settle an invoice or mark an attempt successful.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { withApiLogging } from "@/lib/withApiLogging";
import { getCheckoutGatewayCredentials } from "@/lib/checkoutGatewayCredentials";
import { checkStripeAttemptWithProvider } from "@/lib/paymentRecovery";
import { touchPaymentAttempt } from "@/services/paymentAttemptService";

/**
 * Stripe can be asked directly whether a Checkout session was paid. Do that
 * on the return page so a late, lost or unconfigured webhook does not leave
 * a paid client looking at "processing". Throttled per attempt because the
 * return page polls; any provider error simply falls back to the webhook.
 */
async function recheckStripeOnReturn(sb: any, attempt: any) {
  const lastChecked = attempt.last_checked_at ? new Date(attempt.last_checked_at).getTime() : 0;
  if (Date.now() - lastChecked < 15000 || !attempt.provider_session_id ||
      attempt.provider_session_id === attempt.id) return attempt;
  try {
    const configured = await getCheckoutGatewayCredentials(sb, attempt, String(attempt.metadata?.gatewayId || ""));
    if (!configured?.credentials?.secretKey || configured.gateway.company_id !== attempt.company_id ||
        configured.gateway.provider !== "stripe") return attempt;
    const checked = await checkStripeAttemptWithProvider(sb, attempt, configured.credentials);
    if (!checked.settled) {
      await touchPaymentAttempt(attempt.id, checked.paid ? "paid_waiting_webhook" : checked.providerStatus);
      return attempt;
    }
    const { data: fresh } = await sb.from("payment_attempts").select("*").eq("id", attempt.id).maybeSingle();
    return fresh || attempt;
  } catch (error) {
    console.warn("[confirm-return] Stripe return check failed; waiting for webhook:", error);
    try { await touchPaymentAttempt(attempt.id, "return_check_failed"); } catch { /* best effort */ }
    return attempt;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = typeof req.body?.public_token === "string" ? req.body.public_token.trim() : "";
  const requestedInvoiceId = typeof req.body?.invoice_id === "string" ? req.body.invoice_id.trim() : "";
  const attemptId = typeof req.body?.payment_attempt_id === "string"
    ? req.body.payment_attempt_id.trim()
    : "";
  const hasPublicToken = /^[0-9a-f-]{36}$/i.test(token);
  const hasInvoiceId = /^[0-9a-f-]{36}$/i.test(requestedInvoiceId);
  if (!hasPublicToken && !hasInvoiceId) {
    return res.status(400).json({ error: "A public token or invoice ID is required" });
  }
  if (attemptId && !/^[0-9a-f-]{36}$/i.test(attemptId)) {
    return res.status(400).json({ error: "Invalid payment attempt" });
  }

  try {
    const sb: any = getServiceSupabase();
    let invoiceQuery = sb
      .from("invoices")
      .select("id, company_id, client_id, status, balance_due, deleted_at");
    invoiceQuery = hasPublicToken
      ? invoiceQuery.eq("public_token", token)
      : invoiceQuery.eq("id", requestedInvoiceId);
    const { data: invoice, error: invoiceError } = await invoiceQuery.maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice || invoice.deleted_at) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    if (hasPublicToken && hasInvoiceId && requestedInvoiceId !== invoice.id) {
      return res.status(404).json({ error: "Invoice does not match this token" });
    }

    if (!hasPublicToken) {
      const ssr = createPagesServerClient({ req, res });
      const { data: { user } } = await ssr.auth.getUser();
      if (!user || !invoice.client_id) {
        return res.status(401).json({ error: "Sign in to check this payment" });
      }
      const { data: client, error: clientError } = await sb
        .from("clients")
        .select("id")
        .eq("id", invoice.client_id)
        .eq("company_id", invoice.company_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (clientError) throw clientError;
      if (!client) return res.status(404).json({ error: "Invoice not found" });
    }

    let attempt: any = null;
    if (attemptId) {
      const { data, error } = await sb
        .from("payment_attempts")
        .select("*")
        .eq("id", attemptId)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.company_id !== invoice.company_id || data.invoice_id !== invoice.id) {
        return res.status(404).json({ error: "Payment attempt not found" });
      }
      attempt = data;
      if (attempt.status === "pending" && attempt.provider === "stripe") {
        attempt = await recheckStripeOnReturn(sb, attempt);
      }
    }

    const invoicePaid =
      invoice.status === "paid" ||
      (invoice.balance_due !== null && invoice.balance_due !== undefined && Number(invoice.balance_due) <= 0);
    // When we have a specific attempt, report that attempt's saved state.
    // A different payment can settle the same invoice while this checkout
    // fails, so invoice balance alone must not make this attempt look paid.
    const status = attempt ? attempt.status : invoicePaid ? "succeeded" : "pending";
    return res.status(200).json({
      ok: true,
      status,
      paid: status === "succeeded",
      provider: attempt?.provider || null,
    });
  } catch (e: any) {
    console.error("[confirm-return] status lookup failed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "Could not check payment status" });
  }
}

export default withApiLogging(handler);
