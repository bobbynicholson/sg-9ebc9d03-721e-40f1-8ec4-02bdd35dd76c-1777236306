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
import crypto from "crypto";
import { withApiLogging } from "@/lib/withApiLogging";
import { touchPaymentAttempt, transitionPaymentAttempt } from "@/services/paymentAttemptService";
import { notifyPaymentAttemptFailed } from "@/services/payments/notifyPaymentAttemptFailed";
import { settleTenantGatewayPayment, TenantGatewaySettlementError } from "@/lib/tenantGatewaySettlement";
import { getCheckoutGatewayCredentials } from "@/lib/checkoutGatewayCredentials";
import { pfUrlEncode } from "@/lib/payfastService";


/** PayFast ITN. Authenticate raw form + tenant merchant, persist the verified
 * receipt, then atomically settle money/status. HTTP 200 means committed;
 * retryable errors return 503. Duplicate deliveries repair old projections.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

class PayFastInputError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}

async function readRawBody(req: NextApiRequest): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer | string) => {
      size += Buffer.byteLength(chunk);
      if (size > 64 * 1024) { reject(new PayFastInputError("Callback body too large", 413)); return; }
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("Callback connection interrupted")));
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
    if (Object.prototype.hasOwnProperty.call(map, key)) throw new PayFastInputError("Duplicate callback field");
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
    parts.push(`${k}=${pfUrlEncode(v)}`);
  }
  let s = parts.join("&");
  if (passphrase) {
    s += `&passphrase=${pfUrlEncode(passphrase)}`;
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
    let parsed: ReturnType<typeof parsePayFastBody>;
    try { parsed = parsePayFastBody(rawBody); }
    catch { return res.status(400).json({ error: "Invalid payment callback form" }); }
    const { ordered, map: paymentData } = parsed;

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
      const attemptColumns = "id, company_id, provider, order_id, invoice_id, payment_type, amount, currency, metadata, provider_session_id";
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
    let signatureConfigs: Array<{ gateway: { company_id: string; provider: string; is_test: boolean }; credentials: Record<string,string> }> = tenantPayFastConfigs.filter(
      (config) => String(config.credentials.merchantId || "").trim() === merchantIdFromIpn,
    );
    if (gatewayIdFromAttempt) {
      const attemptGateway = await getCheckoutGatewayCredentials(serviceClient, paymentAttempt, gatewayIdFromAttempt);
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
    if (signatureConfigs.length === 0 && !attemptMerchantId) {
      return res.status(400).json({ error: "No company-owned PayFast merchant is configured for this payment" });
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
    // including its signature. Require VALID for live events in every environment;
    // this also allows a pending payment to finish after an owner rotates
    // the passphrase, without storing that secret in tenant-readable data.
    const isLivePayment = tenantIsTest !== true;
    let serverConfirmed = false;
    if (isLivePayment || (!signatureValid && process.env.NODE_ENV === "production")) {
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
        if (!serverConfirmed && isLivePayment) {
          console.warn("[payfast-webhook] PayFast rejected server confirmation:", { confirmHost, confirmText: confirmText.slice(0, 60) });
          return res.status(400).json({ error: "PayFast did not validate this notification" });
        }
        if (!serverConfirmed) {
          console.warn("[payfast-webhook] sandbox server confirmation was not VALID; relying on tenant signature:", { confirmHost, confirmText: confirmText.slice(0, 60) });
        }
      } catch (confirmErr) {
        if (isLivePayment) {
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
      if (paymentAttempt.metadata?.merchantPaymentId && paymentData.m_payment_id !== paymentAttempt.metadata.merchantPaymentId) {
        return res.status(400).json({ error: "Merchant payment reference does not match the checkout" });
      }
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
        return res.status(503).json({ error: "Could not persist provider status" });
      }
      return res.status(200).json({ message: `Payment not complete: ${providerPaymentStatus}` });
    }

    const settlement = await settleTenantGatewayPayment({
      admin: serviceClient, provider: "payfast", transactionId: paymentData.pf_payment_id,
      companyId: tenantCompanyIdFromIpn, orderId: callbackReference, paymentType: callbackType,
      invoiceId: paymentAttempt?.invoice_id || (/^[0-9a-f-]{36}$/i.test(callbackInvoiceId) ? callbackInvoiceId : null),
      paymentAttempt, amount: Number(paymentData.amount_gross), currency: paymentData.currency || "ZAR",
    });
    return res.status(200).json({ ok: true, duplicate: settlement.duplicate,
      invoiceId: settlement.invoice_id, orderId: settlement.order_id });
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
    return res.status(error instanceof TenantGatewaySettlementError || error instanceof PayFastInputError ? error.statusCode : 503)
      .json({ error: "Payment confirmation could not be committed. Retry required." });
  }
}

export default withApiLogging(handler);
