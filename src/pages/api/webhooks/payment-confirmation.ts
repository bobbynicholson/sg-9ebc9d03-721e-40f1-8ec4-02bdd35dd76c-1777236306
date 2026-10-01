import type { NextApiRequest, NextApiResponse } from "next";
// This is an unauthenticated provider callback, so all payment and
// notification writes must use service role. Fail closed if it is not
// available; an anon-client fallback would acknowledge callbacks while
// silently failing the ledger writes under RLS.
import { getServiceSupabase } from "@/lib/supabase/service";
import { paymentGatewayService } from "@/services/paymentGatewayService";
let _svcCache: ReturnType<typeof getServiceSupabase> | null = null;
function svc(): ReturnType<typeof getServiceSupabase> {
  if (!_svcCache) _svcCache = getServiceSupabase();
  return _svcCache;
}
const supabase: any = new Proxy({}, {
  get(_, prop) {
    return (svc() as any)[prop];
  },
}) as any;
import { emailService } from "@/services/emailService";
import { notifyInvoicePaid } from "@/services/payments/notifyInvoicePaid";
import crypto from "crypto";
import { withApiLogging } from "@/lib/withApiLogging";
import { touchPaymentAttempt, transitionPaymentAttempt } from "@/services/paymentAttemptService";
import { notifyPaymentAttemptFailed } from "@/services/payments/notifyPaymentAttemptFailed";


/**
 * Payment Webhook Handler
 * Receives payment confirmations from PayFast and other gateways.
 *
 * Idempotency: PayFast retries IPN aggressively (network blips, slow
 * response, 5xx). Every retry would otherwise double-insert payments
 * rows, double `amount_paid`, and flip status to paid prematurely.
 * We dedupe on `pf_payment_id` (PayFast's canonical id) by checking
 * the payments table BEFORE any DB write - if the row already exists
 * we return 200 immediately so PayFast stops retrying. The dedup also
 * covers replay attacks: a re-sent valid signed IPN with the same
 * pf_payment_id is a no-op.
 *
 * Hardening (P0-11):
 *  - bodyParser disabled; signature validates over the raw form-body
 *    string before any reshape, so URL-encoding edge cases (spaces,
 *    accented characters, ampersands in values) don't break sig check.
 *  - Optional IP allowlist via PAYFAST_ALLOWED_IPS (comma-separated,
 *    CIDR supported). Live production notifications are still checked
 *    against PayFast's server validation endpoint when no allowlist is
 *    configured.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: NextApiRequest): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Parse application/x-www-form-urlencoded preserving original order
// (PayFast signs in the order the fields appear in the body, NOT
// alphabetical). Returns both the ordered key/value list and a map.
function parsePayFastBody(raw: string): { ordered: Array<[string, string]>; map: Record<string, string> } {
  const ordered: Array<[string, string]> = [];
  const map: Record<string, string> = {};
  if (!raw) return { ordered, map };
  for (const pair of raw.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    const v = eq === -1 ? "" : pair.slice(eq + 1);
    const key = decodeURIComponent(k.replace(/\+/g, " "));
    const val = decodeURIComponent(v.replace(/\+/g, " "));
    ordered.push([key, val]);
    map[key] = val;
  }
  return { ordered, map };
}

// Reconstruct the canonical PayFast signed string from the ordered
// fields. PayFast docs: "Take all the form fields excluding signature,
// in the order they appear in the form, urlencode them and concatenate
// with &, then append &passphrase=<passphrase> if set."
function buildPayFastSignedString(
  ordered: Array<[string, string]>,
  passphrase: string,
): string {
  const parts: string[] = [];
  for (const [k, v] of ordered) {
    if (k === "signature") continue;
    if (v === "") continue;
    parts.push(`${k}=${encodeURIComponent(v).replace(/%20/g, "+")}`);
  }
  let s = parts.join("&");
  if (passphrase) {
    s += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`;
  }
  return s;
}

function clientIpFromRequest(req: NextApiRequest): string | null {
  const forwarded = (req.headers["x-forwarded-for"] || "") as string;
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const real = (req.headers["x-real-ip"] || "") as string;
  if (real) return real.trim();
  return req.socket?.remoteAddress || null;
}

/**
 * Parse a single IPv4 entry - either a literal "1.2.3.4" or a CIDR
 * range "1.2.3.0/24" - and return a matcher function. Returns null
 * for unparseable entries (skipped silently so a single typo doesn't
 * disable the whole allowlist).
 */
function ipMatcher(entry: string): ((ip: string) => boolean) | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return (ip) => ip === trimmed;
  }
  const base = trimmed.slice(0, slash);
  const bits = parseInt(trimmed.slice(slash + 1), 10);
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return null;
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return null;
  if (bits === 0) return () => true;
  const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
  const network = (baseInt & mask) >>> 0;
  return (ip) => {
    const candidate = ipv4ToInt(ip);
    if (candidate === null) return false;
    return ((candidate & mask) >>> 0) === network;
  };
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    acc = ((acc << 8) | n) >>> 0;
  }
  return acc;
}

function isAllowedPayFastIp(ip: string | null): boolean {
  const raw = (process.env.PAYFAST_ALLOWED_IPS || "").trim();
  // The request handler calls this matcher only when an allowlist is
  // configured. Without one, live events still pass PayFast's mandatory
  // server-side validation below.
  if (!raw) return true;
  if (!ip) return false;
  // Wave 17 audit: this used to do simple string equality on
  // PAYFAST_ALLOWED_IPS, but the env var typically lists CIDR ranges
  // (PayFast publishes 197.97.145.144/29, 41.74.179.192/27, etc.) --
  // every live IPN was being rejected because the literal IP never
  // string-matched the CIDR entry. Build matchers per entry so both
  // literals and CIDR ranges work.
  // Strip a leading IPv6-mapped prefix (::ffff:) that some proxies
  // attach to IPv4 sources.
  const cleanIp = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  for (const entry of raw.split(",")) {
    const matcher = ipMatcher(entry);
    if (matcher && matcher(cleanIp)) return true;
  }
  return false;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. IP allowlist - enforced only when configured. The previous
    // fail-closed-in-production behaviour 403'd EVERY IPN on any
    // deployment without PAYFAST_ALLOWED_IPS set (i.e. this one) --
    // clients paid on PayFast and the invoice/order never updated.
    // When the allowlist is absent we instead confirm authenticity
    // with PayFast's own server-side /eng/query/validate round-trip
    // below (their documented ITN validation step), which is a
    // stronger check than source IP anyway.
    const callerIp = clientIpFromRequest(req);
    const ipAllowlistConfigured = !!(process.env.PAYFAST_ALLOWED_IPS || "").trim();
    if (ipAllowlistConfigured && !isAllowedPayFastIp(callerIp)) {
      console.warn("[payfast-webhook] rejected non-allowlisted IP:", callerIp);
      return res.status(403).json({ error: "Forbidden" });
    }

    // 2. Read raw body and validate signature against it directly,
    //    preserving the original field order. The previous Object.keys
    //    + .sort() approach was wrong for PayFast (they sign in form
    //    order, not alphabetical) and the JSON-parsed shape lost
    //    multi-value forms.
    const rawBody = await readRawBody(req);
    const { ordered, map: paymentData } = parsePayFastBody(rawBody);

    // Bind the callback to the tenant and the exact checkout attempt.
    // Looking up only the currently active gateway breaks an in-flight
    // PayFast payment as soon as the owner switches to another provider.
    const tenantCompanyIdFromIpn = (paymentData.custom_str3 || "").trim();
    const merchantIdFromIpn = (paymentData.merchant_id || "").trim();
    const attemptId = (paymentData.custom_str5 || "").trim() || null;
    if (!/^[0-9a-f-]{36}$/i.test(tenantCompanyIdFromIpn) || !merchantIdFromIpn) {
      return res.status(400).json({ error: "Missing tenant or merchant reference" });
    }

    let paymentAttempt: any = null;
    if (attemptId) {
      const attemptColumns = "id, company_id, provider, order_id, invoice_id, payment_type, amount, currency, metadata";
      const { data: attemptById, error: attemptByIdErr } = await supabase
        .from("payment_attempts")
        .select(attemptColumns)
        .eq("id", attemptId)
        .maybeSingle();
      if (attemptByIdErr) throw attemptByIdErr;
      paymentAttempt = attemptById;

      // Rows created before the attempt ID became the primary key used a
      // separate database ID, but stored this value as provider_session_id.
      if (!paymentAttempt) {
        const { data: attemptBySession, error: attemptBySessionErr } = await supabase
          .from("payment_attempts")
          .select(attemptColumns)
          .eq("provider", "payfast")
          .eq("provider_session_id", attemptId)
          .maybeSingle();
        if (attemptBySessionErr) throw attemptBySessionErr;
        paymentAttempt = attemptBySession;
      }
      if (!paymentAttempt) {
        return res.status(400).json({ error: "Payment attempt not found" });
      }
      if (
        paymentAttempt.provider !== "payfast" ||
        paymentAttempt.company_id !== tenantCompanyIdFromIpn
      ) {
        return res.status(400).json({ error: "Payment attempt does not match this tenant" });
      }
    }

    const serviceClient = getServiceSupabase();
    const tenantPayFastConfigs = await paymentGatewayService.listCompanyProviderWithCredentials(
      tenantCompanyIdFromIpn,
      "payfast",
      serviceClient,
      true,
    );
    const attemptMetadata = (paymentAttempt?.metadata || {}) as Record<string, unknown>;
    const attemptMerchantId = String(attemptMetadata.merchantId || "").trim();
    if (attemptMerchantId && attemptMerchantId !== merchantIdFromIpn) {
      return res.status(400).json({ error: "Merchant does not match the payment attempt" });
    }

    let tenantIsTest: boolean | null = null;
    const gatewayIdFromAttempt = String(attemptMetadata.gatewayId || "").trim();
    let signatureConfigs = tenantPayFastConfigs.filter(
      (config) => String(config.credentials.merchantId || "").trim() === merchantIdFromIpn,
    );
    if (gatewayIdFromAttempt) {
      const attemptGateway = await paymentGatewayService.getByIdWithCredentials(
        gatewayIdFromAttempt,
        serviceClient,
        true,
      );
      if (attemptGateway) {
        if (
          attemptGateway.gateway.company_id !== tenantCompanyIdFromIpn ||
          attemptGateway.gateway.provider !== "payfast"
        ) {
          return res.status(400).json({ error: "Payment gateway does not match this tenant" });
        }
        signatureConfigs = [attemptGateway];
        tenantIsTest = !!attemptGateway.gateway.is_test;
      }
    }
    if (tenantIsTest === null && signatureConfigs.length > 0) {
      tenantIsTest = !!signatureConfigs[0].gateway.is_test;
    }
    if (attemptMetadata.gatewayIsTest !== undefined) {
      tenantIsTest = String(attemptMetadata.gatewayIsTest) === "true";
    }

    const passphrases = signatureConfigs.map((config) =>
      String(config.credentials.passphrase || ""),
    );
    // Keep accepting old no-attempt links created by the former
    // single-tenant env-var path. Never use platform env credentials to
    // validate a new checkout that carries an attempt ID.
    const legacyMerchantId =
      process.env.PAYFAST_MERCHANT_ID || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID || "";
    const legacyEnvMatches = !attemptId && legacyMerchantId === merchantIdFromIpn;
    if (signatureConfigs.length === 0 && legacyEnvMatches) {
      passphrases.push(
        process.env.PAYFAST_PASSPHRASE || process.env.NEXT_PUBLIC_PAYFAST_PASSPHRASE || "",
      );
    }
    if (signatureConfigs.length === 0 && !legacyEnvMatches && !attemptMerchantId) {
      return res.status(400).json({ error: "No PayFast merchant is configured for this tenant" });
    }

    const providedSignature = (paymentData.signature || "").toLowerCase();
    const signatureValid = passphrases.some((passphrase) => {
      const expected = crypto
        .createHash("md5")
        .update(buildPayFastSignedString(ordered, passphrase))
        .digest("hex");
      return expected.toLowerCase() === providedSignature;
    });

    // PayFast's documented server check posts the complete ITN body,
    // including its signature. Require VALID for live production events;
    // this also allows a pending payment to finish after an owner rotates
    // the passphrase, without storing that secret in tenant-readable data.
    const isLiveProduction = process.env.NODE_ENV === "production" && tenantIsTest !== true;
    let serverConfirmed = false;
    if (isLiveProduction || (!signatureValid && process.env.NODE_ENV === "production")) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const confirmHost = tenantIsTest === true ? "sandbox.payfast.co.za" : "www.payfast.co.za";
        const confirmRes = await fetch(`https://${confirmHost}/eng/query/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: rawBody,
          signal: controller.signal,
        });
        const confirmText = (await confirmRes.text()).trim().toUpperCase();
        serverConfirmed = confirmRes.ok && confirmText === "VALID";
        if (!serverConfirmed && isLiveProduction) {
          console.warn("[payfast-webhook] PayFast rejected server confirmation:", { confirmHost, confirmText: confirmText.slice(0, 60) });
          return res.status(400).json({ error: "PayFast did not validate this notification" });
        }
        if (!serverConfirmed) {
          console.warn("[payfast-webhook] sandbox server confirmation was not VALID; relying on tenant signature:", { confirmHost, confirmText: confirmText.slice(0, 60) });
        }
      } catch (confirmErr) {
        if (isLiveProduction) {
          console.error("[payfast-webhook] PayFast server confirmation unavailable:", confirmErr);
          return res.status(503).json({ error: "PayFast confirmation temporarily unavailable" });
        }
        console.warn("[payfast-webhook] sandbox server confirmation unavailable:", confirmErr);
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!signatureValid && !serverConfirmed) {
      console.warn("[payfast-webhook] signature mismatch (tenant=", tenantCompanyIdFromIpn, ")");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const callbackType = (paymentData.custom_str2 || "").trim().toLowerCase();
    const callbackReference = (paymentData.custom_str1 || "").trim();
    const callbackInvoiceId = (paymentData.custom_str4 || "").trim();
    if (!callbackReference) {
      return res.status(400).json({ error: "Missing payment reference" });
    }
    if (paymentAttempt) {
      const expectedReference = callbackType === "invoice"
        ? paymentAttempt.invoice_id
        : paymentAttempt.order_id;
      if (!expectedReference || expectedReference !== callbackReference) {
        return res.status(400).json({ error: "Payment reference does not match the checkout" });
      }
      if (
        callbackInvoiceId &&
        /^[0-9a-f-]{36}$/i.test(callbackInvoiceId) &&
        paymentAttempt.invoice_id !== callbackInvoiceId
      ) {
        return res.status(400).json({ error: "Invoice does not match the checkout" });
      }
      if (paymentAttempt.payment_type && paymentAttempt.payment_type !== callbackType) {
        return res.status(400).json({ error: "Payment type does not match the checkout" });
      }
      const callbackAmount = Number(paymentData.amount_gross);
      if (
        paymentData.payment_status === "COMPLETE" &&
        (!Number.isFinite(callbackAmount) || Math.abs(callbackAmount - Number(paymentAttempt.amount)) > 0.01)
      ) {
        return res.status(400).json({ error: "Amount does not match the checkout" });
      }
      const callbackCurrency = String(paymentData.currency || "").toUpperCase();
      if (callbackCurrency && paymentAttempt.currency && callbackCurrency !== String(paymentAttempt.currency).toUpperCase()) {
        return res.status(400).json({ error: "Currency does not match the checkout" });
      }
    }

    // A pending provider status is not a failed payment. Only terminal
    // failure statuses transition and notify; late COMPLETE callbacks can
    // still recover an attempt that the expiry worker already closed.
    const providerPaymentStatus = String(paymentData.payment_status || "unknown").toUpperCase();
    if (providerPaymentStatus !== "COMPLETE") {
      try {
        if (["FAILED", "CANCELLED", "EXPIRED"].includes(providerPaymentStatus)) {
          const transitioned = await transitionPaymentAttempt({
            provider: "payfast",
            attemptId: paymentAttempt?.id || attemptId,
            providerSessionId: attemptId,
            status: "failed",
            providerStatus: providerPaymentStatus,
            failureReason: `PayFast payment status: ${providerPaymentStatus}`,
          });
          if (transitioned.changed && transitioned.attempt) {
            await notifyPaymentAttemptFailed({
              admin: supabase,
              attempt: transitioned.attempt,
              reason: `PayFast returned ${providerPaymentStatus}.`,
            });
          }
        } else if (paymentAttempt?.id) {
          await touchPaymentAttempt(paymentAttempt.id, providerPaymentStatus);
        }
      } catch (attemptError) {
        console.warn("[payfast-webhook] failed-attempt transition failed:", attemptError);
      }
      return res.status(200).json({ message: `Payment not complete: ${providerPaymentStatus}` });
    }

    const {
      custom_str1, // Can be orderId or invoiceId
      custom_str2, // Payment type: "deposit", "balance", or "invoice"
      custom_str3, // Company ID
      custom_str4, // Identifier: "invoice" or not present
      amount_gross,
      pf_payment_id
    } = paymentData;

    // Handle invoice payments (post-event final invoice flow).
    // Idempotency for this branch is handled inline below.
    if (custom_str4 === "invoice" || custom_str2 === "invoice") {
      const invoiceId = custom_str1;
      const companyIdFromIpn = custom_str3;
      if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(invoiceId)) {
        return res.status(400).json({ error: "Invalid invoice reference" });
      }

      const { data: invoice, error: invoiceFetchError } = await supabase
        .from("invoices")
        .select("*, companies(*)")
        .eq("id", invoiceId)
        .is("deleted_at", null)
        .maybeSingle();
      if (invoiceFetchError) {
        console.error("[payment-confirmation] invoice fetch failed:", invoiceFetchError);
        return res.status(500).json({ error: "Could not load invoice" });
      }
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });

      const invoiceData = invoice as any;
      const companyData = invoiceData.companies;
      const invoiceCompanyId = invoiceData.company_id as string;
      const companyMatches =
        invoiceCompanyId === companyIdFromIpn ||
        (!paymentAttempt && companyData?.owner_id === companyIdFromIpn) ||
        (!paymentAttempt && invoiceData.user_id === companyIdFromIpn);
      if (!companyMatches || (paymentAttempt && paymentAttempt.company_id !== invoiceCompanyId)) {
        return res.status(400).json({ error: "Invoice does not belong to this tenant" });
      }

      if (!pf_payment_id) return res.status(400).json({ error: "Missing PayFast payment ID" });
      const existingPayment = await findExistingPayFastPayment(pf_payment_id);
      if (existingPayment) {
        if (
          existingPayment.company_id !== invoiceCompanyId ||
          existingPayment.invoice_id !== invoiceId ||
          !["completed", "paid", "succeeded"].includes(String(existingPayment.payment_status || "").toLowerCase()) ||
          Math.abs(Number(existingPayment.amount) - Number(amount_gross)) > 0.01
        ) {
          return res.status(409).json({ error: "PayFast payment ID is already linked to another payment" });
        }
        await markPayFastAttemptSucceeded(paymentAttempt, attemptId, paymentData.payment_status);
        return res.status(200).json({ message: "Already processed", invoiceId });
      }

      const amountReceived = Number(amount_gross);
      const invoiceBalance = invoiceData.balance_due !== null && invoiceData.balance_due !== undefined && Number.isFinite(Number(invoiceData.balance_due))
        ? Number(invoiceData.balance_due)
        : Math.max(0, Number(invoiceData.total_amount || 0) - Number(invoiceData.amount_paid || 0));
      if (!(amountReceived > 0)) {
        return res.status(400).json({ error: "Invalid invoice payment amount" });
      }
      // Concurrent checkout sessions can both be paid before either ITN
      // updates the invoice. A saved attempt proves the amount was capped
      // against the invoice when checkout was created, so record every
      // confirmed charge even if another attempt has since closed it.
      // Legacy callbacks without an attempt remain bounded by the live due.
      if (!paymentAttempt && (invoiceData.status === "paid" || invoiceBalance <= 0)) {
        return res.status(400).json({ error: "Invoice has no outstanding balance" });
      }
      if (!paymentAttempt && amountReceived > invoiceBalance + 0.01) {
        return res.status(400).json({ error: "Payment exceeds invoice balance" });
      }

      {
        // The invoice's persisted company ID, never callback data, is
        // used for ledger writes and owner notifications.
        const companyId = invoiceCompanyId;

        // Atomic invoice + payments + order update via SECURITY DEFINER
        // RPC. Three sequential writes used to leave the system in
        // inconsistent state on a network blip between any two of
        // them. The RPC does all three in one transaction with belt-
        // and-braces idempotency on gateway_transaction_id [P2F-1].
        const { data: rpcResult, error: rpcErr } = await (supabase as any).rpc(
          "record_invoice_payment",
          {
            p_invoice_id: invoiceId,
            p_amount: parseFloat(amount_gross),
            p_payment_method: "payfast",
            p_transaction_id: pf_payment_id,
            p_company_id: invoiceCompanyId,
            p_client_id: invoiceData.client_id,
            p_currency: "ZAR",
            p_gateway_provider: "payfast",
          }
        );

      if (rpcErr) {
        console.error("Error in record_invoice_payment RPC:", rpcErr);
        return res.status(500).json({ error: "Failed to record invoice payment" });
      }

      await markPayFastAttemptSucceeded(paymentAttempt, attemptId, paymentData.payment_status);

      if ((rpcResult as any)?.idempotent === true) {
          return res.status(200).json({
            message: "Already processed",
            invoiceId,
            payment_id: (rpcResult as any).payment_id,
          });
        }

        // Send notification. recipient must be an auth uid (RLS filters
        // reads on it); companies.owner_id is a FK to profiles(id) so it's
        // valid, but the old `|| companyId` fallback wrote a companies.id
        // when owner_id was null - a row no auth user could ever read.
        // Gate on a real owner uid instead of writing a junk recipient.
        if (companyData?.owner_id) {
          await supabase.from("notifications").insert([{
            company_id: companyId,
            // recipient_id is what RLS + notificationService.getNotifications
            // filter reads on; user_id alone left this row unreadable so the
            // owner never saw the invoice-payment alert. Set both.
            recipient_id: companyData.owner_id,
            user_id: companyData.owner_id,
            title: `Invoice Payment Received - ${invoiceData.invoice_number}`,
            message: `Payment of R${amount_gross} received for invoice ${invoiceData.invoice_number}`,
            // notification_type (free-text) is what notificationService +
            // RLS-side filtering/dedup read on; the order-payment branch
            // sets it. Setting only the enum `type` left this row
            // type-null so type-based filtering silently dropped it.
            notification_type: "payment_received",
            type: "payment_received",
            channels: ["in_app", "email"]
          }]);
        } else {
          console.warn(`[payment-confirmation] company ${companyId} has no owner_id; skipping payment-received notification`);
        }

        // Invoice payment confirmation - "thank you, payment received".
        // Emit through emailService so it picks up the company's
        // configured Resend / SMTP provider and the negative gates
        // (block list + import quarantine) run server-side.
        try {
          // Pull a recipient email off the linked client, or fall
          // back to the order's client_email if the invoice has no
          // client_id link.
          let recipientEmail: string | null = null;
          let recipientName: string | null = null;
          if (invoiceData.client_id) {
            const { data: clientRow, error: clientRowErr } = await supabase
              .from("clients")
              .select("email, client_name")
              .eq("id", invoiceData.client_id)
              .maybeSingle();
            if (clientRowErr) {
              console.error("[webhooks/payment-confirmation] clients fetch failed:", clientRowErr);
            }
            if (clientRow) {
              recipientEmail = (clientRow as any).email;
              recipientName = (clientRow as any).client_name;
            }
          }
          // Pull event_name (+ email fallback) from the linked order
          // so the receipt subject/body read "... for RJ Marriage"
          // instead of a blank {{event_name}}.
          let eventName = "your event";
          if (invoiceData.order_id) {
            const { data: orderRow, error: orderRowErr } = await supabase
              .from("orders")
              .select("client_email, client_name, event_name")
              .eq("id", invoiceData.order_id)
              .maybeSingle();
            if (orderRowErr) {
              console.error("[webhooks/payment-confirmation] orders fetch failed:", orderRowErr);
            }
            if (orderRow) {
              if ((orderRow as any).event_name) eventName = (orderRow as any).event_name;
              if (!recipientEmail) {
                recipientEmail = (orderRow as any).client_email;
                recipientName = (orderRow as any).client_name;
              }
            }
          }

          if (recipientEmail) {
            // FIX (2026-06-12): the template speaks snake_case
            // ({{first_name}}, {{event_name}}, {{amount}},
            // {{invoice_number}}, {{tenant_name}}) and hardcodes its
            // own "R" prefix. The old send passed a camelCase bag with
            // an already-R-prefixed amount, so clients saw raw
            // {{first_name}} and "R R5 117,30". Pass the right keys, a
            // bare numeric amount, and pick deposit- vs balance-
            // received by whether the invoice is now fully paid.
            const fullyPaid =
              (rpcResult as any)?.invoice_status === "paid" ||
              Number((rpcResult as any)?.balance_due ?? 1) <= 0;
            const firstName = String(recipientName || "there").trim().split(/\s+/)[0] || "there";
            const amountBare = Number(amount_gross).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const amountFormatted = `R${amountBare}`;
            await emailService.sendEmail({
              companyId,
              to: recipientEmail,
              subject: `Payment received - invoice ${invoiceData.invoice_number}`,
              body: fullyPaid
                ? `Hi {{first_name}},\n\n` +
                  `Thanks for your payment of R {{amount}} against invoice {{invoice_number}}.\n\n` +
                  `This invoice is now fully paid.\n\n` +
                  `Thanks,\n{{tenant_name}}`
                : `Hi {{first_name}},\n\n` +
                  `We received your deposit of R {{amount}} against invoice {{invoice_number}}.\n\n` +
                  `Your booking is secure and your event date is locked in.\n\n` +
                  `Thanks,\n{{tenant_name}}`,
              template: fullyPaid ? "balance_payment_received" : "deposit_payment_received",
              variables: {
                first_name: firstName,
                client_name: recipientName || "there",
                tenant_name: companyData?.company_name || "Your caterer",
                company_name: companyData?.company_name || "Your caterer",
                event_name: eventName,
                amount: amountBare,
                amount_formatted: amountFormatted,
                invoice_number: invoiceData.invoice_number,
                order_number: invoiceData.invoice_number,
                // legacy camelCase kept for older tenant overrides
                clientName: recipientName || "there",
                invoiceNumber: invoiceData.invoice_number,
                companyName: companyData?.company_name || "Your caterer",
              },
              _client: supabase,
            } as any);
          }
        } catch (emailErr) {
          // Non-blocking - the invoice is already marked paid;
          // a failed confirmation email is logged but doesn't undo
          // the webhook. Surfaces in the email-failures dashboard
          // (item #9) once that lands.
          console.warn("Invoice payment confirmation email failed:", emailErr);
        }

        try {
          const fullyPaid =
            (rpcResult as any)?.invoice_status === "paid" ||
            Number((rpcResult as any)?.balance_due ?? 1) <= 0;
          await notifyInvoicePaid({
            admin: supabase,
            companyId,
            orderId: invoiceData.order_id || null,
            invoiceId,
            invoiceNumber: invoiceData.invoice_number || null,
            clientId: invoiceData.client_id || null,
            amount: Number(amount_gross) || 0,
            currency: "ZAR",
            fullyPaid,
            skipOwnerInApp: true,
            skipClientEmail: true,
          });
        } catch (notifyErr) {
          console.warn("[payment-confirmation] invoice payment notifyInvoicePaid failed:", notifyErr);
        }

        // Auto-complete the linked order when:
        //   (a) the invoice has an order_id (it's tied to a real order)
        //   (b) the invoice is now fully paid (balance_due <= 0)
        //   (c) the order is already in 'delivered' status - meaning
        //       the food / service was rendered and only the balance
        //       was outstanding
        //
        // Without this hook the order sat in 'delivered' forever even
        // after the client paid in full, so ensureScheduledAfterSales
        // (gated on 'completed' transition) never fired, the
        // after-sales nurture sequence never started, and the order
        // never showed as 'fully closed' on operator dashboards.
        if (invoiceData.order_id) {
          try {
            const { data: freshInvoice } = await supabase
              .from("invoices")
              .select("balance_due, status")
              .eq("id", invoiceId)
              .maybeSingle();
            const fullyPaid = (freshInvoice as any)?.status === "paid"
              || Number((freshInvoice as any)?.balance_due || 0) <= 0;
            if (fullyPaid) {
              const { data: linkedOrder } = await supabase
                .from("orders")
                .select("status")
                .eq("id", invoiceData.order_id)
                .maybeSingle();
              const orderStatus = String((linkedOrder as any)?.status || "").toLowerCase();
              if (orderStatus === "delivered") {
                // Route through the state-machine helper so order_status_history
                // gets the row + the post-completion hooks (after-sales
                // scheduling) fire correctly. Non-blocking on failure.
                const { updateOrderStatus } = await import("@/services/order/orderWorkflow");
                const r = await updateOrderStatus(invoiceData.order_id, "completed" as any);
                if (!(r as any)?.success) {
                  console.warn(
                    "[invoice-paid] auto-complete failed:",
                    (r as any)?.error,
                  );
                }
              }
            }
          } catch (autoCompleteErr) {
            console.warn("[invoice-paid] auto-complete crashed (non-blocking):", autoCompleteErr);
          }
        }
        console.log(`Invoice ${invoiceData.invoice_number} marked as paid - R${amount_gross}`);
      }

      return res.status(200).json({
        message: "Invoice payment processed successfully",
        invoiceId,
        amount: amount_gross
      });
    }

    // Handle order payments (deposit / balance)
    const orderId = custom_str1;
    const paymentType = (custom_str2 || "").toLowerCase(); // "deposit" or "balance"
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return res.status(400).json({ error: "Invalid order reference" });
    }
    if (paymentType && paymentType !== "deposit" && paymentType !== "balance") {
      return res.status(400).json({ error: "Invalid order payment type" });
    }

    // Get order details. FIX (2026-06-12): orderService.getOrderById
    // uses orderCRUD's module-level BROWSER ANON client, which RLS
    // blocks in this unauthenticated webhook context - so every
    // deposit/balance IPN 404'd with "Order not found" and the
    // payment never recorded (the invoice-branch above worked because
    // it uses this file's service-role `supabase`). Read the order
    // directly with the service-role client instead.
    const { data: orderRowDirect, error: orderFetchErr } = await supabase
      .from("orders")
      .select("*, client:clients(*), order_items(*)")
      .eq("id", orderId)
      .is("deleted_at", null)
      .maybeSingle();

    if (orderFetchErr) {
      console.error("[payment-webhook] order fetch failed:", orderFetchErr);
    }
    if (!orderRowDirect) {
      console.error("Order not found:", orderId);
      return res.status(404).json({ error: "Order not found" });
    }

    const order: any = orderRowDirect;
    const orderCompanyId = String(order.company_id || order.user_id || "");
    const companyMatches =
      order.company_id === tenantCompanyIdFromIpn ||
      (!paymentAttempt && order.user_id === tenantCompanyIdFromIpn);
    if (!companyMatches || (paymentAttempt && paymentAttempt.company_id !== orderCompanyId)) {
      return res.status(400).json({ error: "Order does not belong to this tenant" });
    }

    const requestedInvoiceId =
      /^[0-9a-f-]{36}$/i.test(callbackInvoiceId)
        ? callbackInvoiceId
        : paymentAttempt?.invoice_id || null;
    let linkedInvoice: any = null;
    if (requestedInvoiceId) {
      const { data: invoiceRow, error: linkedInvoiceErr } = await supabase
        .from("invoices")
        .select("id, company_id, order_id, total_amount, amount_paid, balance_due, status, deleted_at")
        .eq("id", requestedInvoiceId)
        .maybeSingle();
      if (linkedInvoiceErr) {
        console.error("[payment-webhook] linked invoice fetch failed:", linkedInvoiceErr);
        return res.status(500).json({ error: "Could not load payment invoice" });
      }
      if (!invoiceRow || invoiceRow.deleted_at) {
        return res.status(404).json({ error: "Payment invoice not found" });
      }
      if (
        invoiceRow.company_id !== orderCompanyId ||
        (invoiceRow.order_id && invoiceRow.order_id !== order.id) ||
        (paymentAttempt && paymentAttempt.invoice_id !== invoiceRow.id)
      ) {
        return res.status(400).json({ error: "Invoice does not belong to this order" });
      }
      linkedInvoice = invoiceRow;
    } else {
      const { data: openInvoice, error: openInvoiceErr } = await supabase
        .from("invoices")
        .select("id, company_id, order_id, total_amount, amount_paid, balance_due, status, deleted_at")
        .eq("order_id", order.id)
        .eq("company_id", orderCompanyId)
        .neq("status", "paid")
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (openInvoiceErr) {
        console.error("[payment-webhook] open invoice lookup failed:", openInvoiceErr);
        return res.status(500).json({ error: "Could not load order balance" });
      }
      linkedInvoice = openInvoice;
    }

    // Validate tenant and invoice context before acknowledging a duplicate
    // transaction. This keeps a replay from masking a cross-tenant mismatch.
    if (!pf_payment_id) return res.status(400).json({ error: "Missing PayFast payment ID" });
    const existingPayment = await findExistingPayFastPayment(pf_payment_id);
    let alreadyRecorded = false;
    if (existingPayment) {
      if (
        existingPayment.company_id !== orderCompanyId ||
        existingPayment.order_id !== order.id ||
        (linkedInvoice && existingPayment.invoice_id && existingPayment.invoice_id !== linkedInvoice.id) ||
        !["completed", "paid", "succeeded"].includes(String(existingPayment.payment_status || "").toLowerCase()) ||
        Math.abs(Number(existingPayment.amount) - Number(amount_gross)) > 0.01
      ) {
        return res.status(409).json({ error: "PayFast payment ID is already linked to another payment" });
      }
      alreadyRecorded = true;
    }

    // Determine if this is deposit or balance payment. Prefer the
    // explicit custom_str2 the checkout sends; fall back to the order
    // state for old links.
    const isDepositPayment = paymentType
      ? paymentType === "deposit"
      : !order.deposit_paid;
    // What the client can pay now is ANY amount up to the outstanding
    // balance. Since 7b36bbf3 the public pay page lets the payer choose
    // a custom figure (a deposit that isn't the configured %, or any
    // partial), and create-session charges the gateway exactly that,
    // capped to the balance. The webhook therefore can no longer expect
    // a fixed deposit/balance amount - it must validate the gateway
    // figure against the outstanding balance as a CEILING.
    //
    // The previous exact-match check (got must equal deposit_amount or
    // the full balance, within tolerance) rejected every custom partial
    // as "Amount mismatch": the client paid on PayFast but the order +
    // invoice never flipped to paid. This is the exact "I paid but it
    // still shows unpaid" incident. The deposit invoice amount also
    // lives on the invoice, not orders.deposit_amount/balance_amount
    // (which are routinely null), so we resolve the ceiling from the
    // live open invoice first, then fall back to the order columns.
    const invoiceBalance = linkedInvoice
      ? linkedInvoice.balance_due !== null && linkedInvoice.balance_due !== undefined && Number.isFinite(Number(linkedInvoice.balance_due))
        ? Number(linkedInvoice.balance_due)
        : Math.max(0, Number(linkedInvoice.total_amount || 0) - Number(linkedInvoice.amount_paid || 0))
      : null;
    const orderFallbackBalance = paymentType === "deposit"
      ? Number(order.deposit_amount) || Number(order.total_amount) || 0
      : Number(order.balance_amount) || Math.max(0, Number(order.total_amount || 0) - Number(order.amount_paid || 0));
    const maxPayable = invoiceBalance !== null ? invoiceBalance : orderFallbackBalance;

    // Sanity-gate the gateway amount. The passphrase-keyed signature
    // check above already authenticated the IPN, so this is a
    // data-integrity guard, NOT an exact-match requirement:
    //   - must be a positive figure
    //   - must not exceed the outstanding balance by more than rounding
    //     tolerance (catches a stale / forged overpayment)
    // Any amount at or below the balance (full OR partial deposit) is
    // accepted and recorded; the invoice reconcile below flips the row
    // to partially_paid or paid accordingly. Tolerance mirrors the
    // inc-VAT rounding drift allowance used elsewhere: R1 or 0.5%.
    const got = Number(amount_gross);
    const tolerance = paymentAttempt ? 0.01 : Math.max(1.0, maxPayable * 0.005);
    if (!(got > 0)) {
      console.error("Invalid payment amount:", { got });
      return res.status(400).json({ error: "Invalid amount" });
    }
    if (!alreadyRecorded && !paymentAttempt && maxPayable <= 0) {
      return res.status(400).json({ error: "Order has no outstanding balance" });
    }
    if (!alreadyRecorded && !paymentAttempt && got > maxPayable + tolerance) {
      console.error("Amount exceeds outstanding balance:", { got, maxPayable, tolerance });
      return res.status(400).json({ error: "Amount exceeds balance" });
    }
    if (!alreadyRecorded && got < maxPayable - tolerance) {
      console.warn("Partial payment below full balance - recording as partial:", { got, maxPayable });
    }

    // FIX (2026-06-12): record the payment via the service-role RPC
    // directly. orderService.recordPayment + paymentProcessingService
    // both use orderCRUD/orderFinancials' module-level BROWSER ANON
    // client, which RLS/grant blocks in this unauthenticated webhook:
    // record_order_payment is GRANTed to service_role only, and the
    // orders UPDATEs are RLS-gated, so every deposit IPN failed to
    // record. Drive the writes with this file's service-role client.
    if (!alreadyRecorded) {
      const { error: recordErr } = await (supabase as any).rpc(
        "record_order_payment",
        {
          p_order_id: order.id,
          p_amount: parseFloat(amount_gross),
          p_payment_method: "payfast",
          p_transaction_id: pf_payment_id,
          p_user_id: order.user_id,
          p_company_id: order.company_id || order.user_id,
          p_client_id: order.client_id || null,
          p_currency: order.currency || "ZAR",
          p_payment_type: isDepositPayment ? "deposit" : "balance",
          p_gateway_provider: "payfast",
        },
      );
      if (recordErr) {
        console.error("Failed to record payment:", recordErr);
        return res.status(500).json({ error: "Failed to record payment" });
      }
    }
    await markPayFastAttemptSucceeded(paymentAttempt, attemptId, paymentData.payment_status);

    // Cascade: stamp the order's deposit/confirmation flags directly
    // with the service-role client (the paymentProcessingService
    // helpers run on the anon client and silently no-op under RLS).
    if (isDepositPayment) {
      try {
        const { error: flagError } = await supabase
          .from("orders")
          .update({
            deposit_paid: true,
            deposit_paid_at: new Date().toISOString(),
            deposit_transaction_id: pf_payment_id,
            ...(order.confirmed_at ? {} : { confirmed_at: new Date().toISOString() }),
            ...(String(order.status || "").toLowerCase() === "pending" ? { status: "confirmed" } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
        if (flagError) throw flagError;
      } catch (flagErr) {
        console.error("[payment-webhook] deposit flag update failed; requesting PayFast retry:", flagErr);
        return res.status(500).json({ error: "Payment recorded, but the order status update needs retry" });
      }
      if (!alreadyRecorded) await sendClientPaymentConfirmation(order, "deposit", amount_gross);
    } else {
      // If the order is now fully paid AND already delivered, close it.
      const { data: refreshed, error: refreshedError } = await supabase
        .from("orders")
        .select("payment_status, status")
        .eq("id", order.id)
        .maybeSingle();
      if (refreshedError) {
        console.error("[payment-webhook] balance order refresh failed; requesting PayFast retry:", refreshedError);
        return res.status(500).json({ error: "Payment recorded, but order status needs retry" });
      }
      if (refreshed && (refreshed as any).payment_status === "paid"
          && (refreshed as any).status === "delivered") {
        const { error: completionError } = await supabase.from("orders").update({ status: "completed" }).eq("id", order.id);
        if (completionError) {
          console.error("[payment-webhook] completed-order update failed; requesting PayFast retry:", completionError);
          return res.status(500).json({ error: "Payment recorded, but order completion needs retry" });
        }
      }
      if (!alreadyRecorded) await sendClientPaymentConfirmation(order, "balance", amount_gross);
    }

    // record_order_payment and this invoice reconciliation are separate
    // writes. If this step fails, return 500 so PayFast retries; the retry
    // detects the existing order payment and safely repairs the invoice.
    if (linkedInvoice) {
      await reconcileOrderInvoicePayment(linkedInvoice.id, pf_payment_id);
    }

    // Owner / admin in-app notification (kept legacy shape for the
    // notifications inbox the owner already uses).
    if (!alreadyRecorded) {
      await supabase.from("notifications").insert([{
        company_id: order.company_id || order.user_id,
        user_id: order.user_id,
        recipient_id: order.user_id,
        notification_type: "payment_received",
        title: isDepositPayment ? "Deposit Payment Received" : "Balance Payment Received",
        message: isDepositPayment
          ? `Deposit payment received for order ${order.order_number}`
          : `Full payment received for order ${order.order_number}. Booking is confirmed.`,
        priority: "high",
      }]);
    }

    // Phase 8 #6: also email the company contact address. The
    // in-app bell only fires when an admin happens to be in the
    // tab; for the operator on the road this email is the actual
    // 'money landed' signal and prompts them to confirm with the
    // kitchen / driver. Best-effort - never undoes the webhook.
    if (!alreadyRecorded) {
      try {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("email, company_name, owner_id")
        .eq("id", order.company_id || order.user_id)
        .maybeSingle();
      let ownerEmail = (companyRow as any)?.email as string | null | undefined;
      const companyName = (companyRow as any)?.company_name as string | null | undefined;
      if (!ownerEmail && (companyRow as any)?.owner_id) {
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", (companyRow as any).owner_id)
          .maybeSingle();
        ownerEmail = (ownerProfile as any)?.email || null;
      }
      if (ownerEmail) {
        const amountFmt = `R${Number(amount_gross).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
        const subject = isDepositPayment
          ? `Deposit landed - ${order.order_number} (${order.client_name || "client"})`
          : `Final payment landed - ${order.order_number} (${order.client_name || "client"})`;
        const eventLine = order.event_date
          ? new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
          : "TBC";
        const html = `<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; max-width: 560px;">
            <h2 style="margin: 0 0 12px;">${isDepositPayment ? "Deposit received" : "Final payment received"}</h2>
            <p style="margin: 0 0 8px;"><strong>${order.client_name || "Client"}</strong> just paid <strong>${amountFmt}</strong> on order <strong>${order.order_number}</strong>.</p>
            <p style="margin: 0 0 8px;">Event: ${eventLine}<br/>Venue: ${order.venue_address || "TBC"}</p>
            <p style="margin: 0 0 8px;">Booking is now ${isDepositPayment ? "confirmed" : "fully paid"}.</p>
            <p style="margin: 16px 0 0; font-size: 12px; color: #64748b;">${companyName || "Your team"} - automated notification from CateringMS.</p>
          </div>`;
        await emailService.sendEmail({
          companyId: order.company_id || order.user_id,
          to: ownerEmail,
          subject,
          body: html,
          orderId: order.id,
          // Wave 24: webhook context - pass service-role client.
          _client: supabase,
        } as any);
      }
    } catch (ownerEmailErr) {
      console.warn("[payment-webhook] owner notification email failed (non-blocking):", ownerEmailErr);
      }
    }
    return res.status(200).json({
      success: true,
      message: "Payment processed successfully"
    });

  } catch (error) {
    // Phase 6 follow-up: webhook errors used to land only in
    // console.error which is invisible outside DevTools / Vercel
    // function logs. PayFast IPN failures = customer paid but order
    // didn't flip to paid (incident runbook section 5.1). Capture
    // with tenant context so the operator sees it the moment Sentry
    // is wired in.
    const { captureException } = await import("@/lib/observability");
    captureException(error, {
      tags: {
        route: "/api/webhooks/payment-confirmation",
        provider: "payfast",
      },
      level: "error",
    });
    return res.status(500).json({ error: "Internal server error" });
  }
}

/** Resolve a PayFast transaction id to its existing ledger row. */
async function findExistingPayFastPayment(pfPaymentId: string | undefined | null): Promise<any | null> {
  if (!pfPaymentId) return null;
  for (const column of ["gateway_transaction_id", "transaction_id"]) {
    const { data, error } = await supabase
      .from("payments")
      .select("id, company_id, invoice_id, order_id, amount, payment_status")
      .eq(column, pfPaymentId)
      .limit(1);
    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) return data[0];
  }
  return null;
}

/** Mark a payment attempt as soon as its ledger transaction is confirmed. */
async function markPayFastAttemptSucceeded(
  attempt: any,
  providerAttemptId: string | null,
  providerStatus: string,
): Promise<void> {
  const attemptId = attempt?.id || providerAttemptId;
  if (!attemptId) return;
  const transitioned = await transitionPaymentAttempt({
    provider: "payfast",
    attemptId,
    providerSessionId: providerAttemptId,
    status: "succeeded",
    providerStatus,
  });
  if (transitioned.changed || transitioned.attempt?.status === "succeeded") return;

  // A retry can arrive after the row was already transitioned to success.
  const { data: current, error } = await getServiceSupabase()
    .from("payment_attempts")
    .select("status")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw error;
  if (current?.status !== "succeeded") {
    throw new Error("The confirmed PayFast payment attempt could not be transitioned");
  }
}

/**
 * Rebuild the order-linked invoice balance from recorded payment rows.
 * Linking the PayFast row first makes retries idempotent if the webhook
 * stops between the order RPC and invoice update.
 */
async function reconcileOrderInvoicePayment(
  invoiceId: string,
  pfPaymentId: string,
): Promise<void> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, total_amount, amount_paid, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceError) throw invoiceError;
  if (!invoice) throw new Error("Order payment invoice disappeared before reconciliation");

  for (const column of ["gateway_transaction_id", "transaction_id"]) {
    const { error } = await supabase
      .from("payments")
      .update({ invoice_id: invoiceId })
      .eq(column, pfPaymentId)
      .is("invoice_id", null);
    if (error) throw error;
  }

  const { data: rows, error: paymentsError } = await supabase
    .from("payments")
    .select("amount, payment_status")
    .eq("invoice_id", invoiceId);
  if (paymentsError) throw paymentsError;

  const paidFromLedger = (rows || []).reduce((sum: number, payment: any) => {
    const status = String(payment.payment_status || "").toLowerCase();
    return ["completed", "paid", "succeeded"].includes(status)
      ? sum + (Number(payment.amount) || 0)
      : sum;
  }, 0);
  const totalAmount = Number(invoice.total_amount) || 0;
  const amountPaid = Math.round(Math.max(Number(invoice.amount_paid) || 0, paidFromLedger) * 100) / 100;
  const balanceDue = Math.max(0, Math.round((totalAmount - amountPaid) * 100) / 100);
  const status = balanceDue < 0.01 ? "paid" : amountPaid > 0 ? "partially_paid" : "sent";
  const patch: Record<string, unknown> = {
    amount_paid: amountPaid,
    balance_due: balanceDue,
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "paid") patch.paid_at = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", invoiceId);
  if (updateError) throw updateError;
}

/**
 * Resolve the auth.users.id of the client behind an order. orders.client_id
 * is a FK to clients.id (NOT auth.users.id), so we go through the clients
 * table - prefer the explicit user_id link, fall back to the email match
 * on profiles. Pattern mirrored from amendment-review.ts.
 */
async function resolveClientUserId(orderClientId: string | null | undefined): Promise<string | null> {
  if (!orderClientId) return null;
  const { data: clientRow, error: clientRowErr2 } = await supabase
    .from("clients")
    .select("user_id, email")
    .eq("id", orderClientId)
    .maybeSingle();
  if (clientRowErr2) {
    console.error("[webhooks/payment-confirmation] clients fetch failed:", clientRowErr2);
  }
  if (!clientRow) return null;
  if ((clientRow as any).user_id) return (clientRow as any).user_id as string;
  const email = ((clientRow as any).email || "").toLowerCase().trim();
  if (!email) return null;
  const { data: profileMatch, error: profileMatchErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (profileMatchErr) {
    console.error("[webhooks/payment-confirmation] profiles fetch failed:", profileMatchErr);
  }
  return (profileMatch as any)?.id || null;
}

/**
 * Send the client (not just the owner) a confirmation - in-app
 * notification AND email. Non-blocking on individual failures so a
 * dead inbox doesn't undo a successful webhook.
 */
async function sendClientPaymentConfirmation(
  order: any,
  kind: "deposit" | "balance",
  amountGross: string | number
): Promise<void> {
  const clientUserId = await resolveClientUserId(order.client_id);
  const amountFmt = `R${Number(amountGross).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
  const isDeposit = kind === "deposit";

  // Tenant display name for the receipt sign-off (orders rows don't
  // carry company_name). Best-effort - falls back below if absent.
  let tenantName = order.company_name || "";
  if (!tenantName) {
    try {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("company_name")
        .eq("id", order.company_id || order.user_id)
        .maybeSingle();
      if ((companyRow as any)?.company_name) tenantName = (companyRow as any).company_name;
    } catch { /* keep fallback */ }
  }
  if (!tenantName) tenantName = "Your caterer";
  let orderUrl = "";
  try {
    const { mintOrderCustomerLink } = await import("@/lib/customerLinksServer");
    orderUrl = await mintOrderCustomerLink({
      sb: supabase,
      companyId: order.company_id || order.user_id,
      orderId: order.id,
      label: `payment-${kind}-confirmation`,
      origin: process.env.NEXT_PUBLIC_APP_URL || null,
    });
  } catch (e) {
    console.warn("[payment-confirmation] order link mint failed:", e);
  }
  const title = isDeposit
    ? `Deposit received for order ${order.order_number}`
    : `Final payment received for order ${order.order_number}`;
  const message = isDeposit
    ? `We received your deposit of ${amountFmt}. Your booking is now confirmed.`
    : `We received your final payment of ${amountFmt}. Your booking is fully paid.`;

  // In-app notification to the client (only if we resolved an auth uid).
  if (clientUserId) {
    try {
      await supabase.from("notifications").insert([{
        company_id: order.company_id || order.user_id,
        user_id: clientUserId,
        recipient_id: clientUserId,
        notification_type: "payment_received",
        title,
        message,
        priority: "high",
        link: `/client-portal/billing?orderId=${order.id}`,
      }]);
    } catch (e) {
      console.warn("Client in-app notification failed:", e);
    }
  }

  // Email to the client. Use whichever address we have on file.
  let recipientEmail: string | null = order.client_email || null;
  let recipientName: string | null = order.client_name || null;
  if (!recipientEmail && order.client_id) {
    const { data: clientRow, error: clientRowErr3 } = await supabase
      .from("clients")
      .select("email, client_name")
      .eq("id", order.client_id)
      .maybeSingle();
    if (clientRowErr3) {
      console.error("[webhooks/payment-confirmation] clients fetch failed:", clientRowErr3);
    }
    if (clientRow) {
      recipientEmail = (clientRow as any).email || null;
      recipientName = recipientName || (clientRow as any).client_name || null;
    }
  }

  if (!recipientEmail) return;

  try {
    await emailService.sendEmail({
      companyId: order.company_id || order.user_id,
      to: recipientEmail,
      subject: isDeposit
        ? `Deposit received - order ${order.order_number}`
        : `Final payment received - order ${order.order_number}`,
      body: isDeposit
        ? `Hi {{first_name}},\n\n` +
          `We received your deposit of R {{amount}} for {{event_name}}.\n\n` +
          `Your booking is secure and your event date is locked in.\n\n` +
          `View your booking: {{order_url}}\n\n` +
          `Thanks,\n{{tenant_name}}`
        : `Hi {{first_name}},\n\n` +
          `We received your final payment of R {{amount}} for {{event_name}}.\n\n` +
          `Your booking is fully paid.\n\n` +
          `Thanks,\n{{tenant_name}}`,
      // Template type aligns with the seed in
      // supabase/migrations/20260506130000_seed_email_templates.sql
      // (deposit_payment_received / balance_payment_received). The
      // previous "deposit_confirmation" / "balance_confirmation" names
      // had no row in email_templates [P0-07].
      template: isDeposit ? "deposit_payment_received" : "balance_payment_received",
      variables: {
        // snake_case to match the seeded templates; amount is bare
        // (template prefixes its own "R") to avoid "R R5 117,30".
        first_name: String(recipientName || "there").trim().split(/\s+/)[0] || "there",
        client_name: recipientName || "there",
        tenant_name: tenantName,
        company_name: tenantName,
        event_name: order.event_name || "your event",
        amount: Number(amountGross).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        amount_formatted: amountFmt,
        invoice_number: order.order_number,
        order_number: order.order_number,
        event_date: order.event_date
          ? new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
          : "TBD",
        venue: order.venue_address || "TBD",
        order_url: orderUrl,
        // legacy camelCase kept for older tenant overrides
        clientName: recipientName || "there",
        orderNumber: order.order_number,
      },
      orderId: order.id,
      // Wave 24: webhook context - pass service-role client.
      _client: supabase,
    } as any);
  } catch (e) {
    console.warn("Client payment confirmation email failed:", e);
  }
}

// validatePayFastSignature was removed in favour of the inline raw-body
// + ordered-fields validator at the top of handler [P0-11]. Old version
// signed over alphabetical-sorted JSON-parsed fields, which doesn't
// match PayFast's documented "fields in form order" contract and
// produced false negatives on any IPN with non-ASCII characters.

export default withApiLogging(handler);
