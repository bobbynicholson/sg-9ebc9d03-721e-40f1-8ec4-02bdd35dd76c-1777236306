import { SubscriptionPlan, PaymentGatewayConfig } from "@/types/payments";
import crypto from "crypto";
import { formatLocalDate } from "@/lib/localFormat";
import { PLATFORM_TRIAL_DAYS } from "@/lib/platformBilling";
import { PAYFAST_TEST_PLAN_AMOUNT_ZAR } from "@/lib/payfastTestPlan";

export interface PayFastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  testMode: boolean;
}

// PayFast's custom /eng/process integration signs fields in the order used
// by its custom integration field specification. This is intentionally
// distinct from the alphabetic order used by PayFast's REST API signatures.
const PAYFAST_PAYMENT_FIELD_ORDER = [
  "merchant_id",
  "merchant_key",
  "return_url",
  "cancel_url",
  "notify_url",
  "notify_method",
  "name_first",
  "name_last",
  "email_address",
  "cell_number",
  "m_payment_id",
  "amount",
  "item_name",
  "item_description",
  "custom_int1",
  "custom_int2",
  "custom_int3",
  "custom_int4",
  "custom_int5",
  "custom_str1",
  "custom_str2",
  "custom_str3",
  "custom_str4",
  "custom_str5",
  "email_confirmation",
  "confirmation_address",
  "currency",
  "payment_method",
  "subscription_type",
  "billing_date",
  "recurring_amount",
  "frequency",
  "cycles",
  "subscription_notify_email",
  "subscription_notify_webhook",
  "subscription_notify_buyer",
] as const;

const PAYFAST_PAYMENT_FIELD_RANK = new Map(
  PAYFAST_PAYMENT_FIELD_ORDER.map((field, index) => [field, index]),
);

function orderPayFastPaymentEntries(data: Record<string, unknown>) {
  return Object.entries(data).sort(([left], [right]) => {
    if (left === "signature") return right === "signature" ? 0 : 1;
    if (right === "signature") return -1;

    const leftRank = PAYFAST_PAYMENT_FIELD_RANK.get(left as typeof PAYFAST_PAYMENT_FIELD_ORDER[number]);
    const rightRank = PAYFAST_PAYMENT_FIELD_RANK.get(right as typeof PAYFAST_PAYMENT_FIELD_ORDER[number]);
    if (leftRank != null && rightRank != null) return leftRank - rightRank;
    if (leftRank != null) return -1;
    if (rightRank != null) return 1;
    // Keep unknown integration fields in their original relative order.
    return 0;
  });
}

export interface PayFastSubscriptionParams {
  merchantId: string;
  merchantKey: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  nameFirst: string;
  nameLast: string;
  emailAddress: string;
  subscriptionType: "1" | "2";
  billingDate: string;
  recurringAmount: string;
  frequency: "3" | "4" | "5" | "6";
  cycles: string;
  itemName: string;
  itemDescription: string;
  customStr1?: string;
  customStr2?: string;
  customStr3?: string;
  emailConfirmation?: string;
  confirmationAddress?: string;
  signature?: string;
}

/** PHP-urlencode equivalent that PayFast signs against. The one
 *  difference from encodeURIComponent that matters: spaces must be
 *  '+', not '%20'. */
export function pfUrlEncode(value: string): string {
  // PayFast follows PHP's urlencode (RFC 1738), which differs from
  // encodeURIComponent for spaces and the punctuation characters ! ' ( ) *.
  // The latter are left unescaped by JavaScript but must be percent-encoded
  // in the signed payload; an event such as "Cal's birthday" otherwise
  // produces the gateway's "signature does not match" error.
  return encodeURIComponent(value.trim())
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export class PayFastService {
  private config: PayFastConfig;
  private baseUrl: string;

  constructor(config: PayFastConfig) {
    this.config = config;
    this.baseUrl = config.testMode
      ? "https://sandbox.payfast.co.za/eng/process"
      : "https://www.payfast.co.za/eng/process";
  }

  generateSignature(data: Record<string, string>): string {
    // /eng/process uses PayFast's documented custom-integration field order,
    // not the caller's object insertion order and not the alphabetic order
    // used for their REST API. Values use PHP urlencode (spaces as '+'); blank
    // fields are omitted and the passphrase is appended last.
    const paramString = orderPayFastPaymentEntries(data)
      .filter(
        ([key, value]) =>
          key !== "signature" &&
          value != null &&
          String(value).trim() !== "",
      )
      .map(([key, value]) => `${key}=${pfUrlEncode(String(value))}`)
      .join("&");

    const signatureString = this.config.passphrase
      ? `${paramString}&passphrase=${pfUrlEncode(this.config.passphrase)}`
      : paramString;

    return crypto
      .createHash("md5")
      .update(signatureString)
      .digest("hex");
  }

  createSubscriptionParams(
    plan: SubscriptionPlan,
    user: {
      firstName: string;
      lastName: string;
      email: string;
      userId: string;
    },
    billingCycle: "monthly" | "annual",
    // Origin for the return/cancel/notify URLs. Passed explicitly so this
    // can run SERVER-side (where there's no window) - the subscription
    // form is now built in /api/subscription/create-session so the
    // passphrase never reaches the browser. Falls back to window for any
    // legacy client-side caller.
    baseUrl?: string,
    billingDateOverride?: string,
    tenantSlug?: string,
  ): PayFastSubscriptionParams {
    const origin =
      baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
    const tenantPath = tenantSlug ? `/${encodeURIComponent(tenantSlug)}` : "";
    const amount =
      billingCycle === "monthly" ? plan.monthlyPrice : plan.annualPrice;
    const frequency = billingCycle === "monthly" ? "3" : "6";
    const today = new Date();
    const nextCharge = new Date(today);
    const day = nextCharge.getUTCDate();
    nextCharge.setUTCDate(1);
    nextCharge.setUTCMonth(nextCharge.getUTCMonth() + (billingCycle === "annual" ? 12 : 1));
    const lastDay = new Date(Date.UTC(nextCharge.getUTCFullYear(), nextCharge.getUTCMonth() + 1, 0)).getUTCDate();
    nextCharge.setUTCDate(Math.min(day, lastDay));
    const billingDate = billingDateOverride || nextCharge.toISOString().split("T")[0];
    const isTrial = !!billingDateOverride && billingDateOverride > today.toISOString().split("T")[0];
    const merchantPaymentId = crypto.randomUUID();

    const params: Record<string, string> = {
      merchant_id: this.config.merchantId,
      merchant_key: this.config.merchantKey,
      // Retain our merchant reference on the browser return. If PayFast's
      // ITN is delayed or lost, the success page can verify this exact
      // transaction through the signed PayFast API before restoring access.
      return_url: `${origin}${tenantPath}/subscription/success?m_payment_id=${encodeURIComponent(merchantPaymentId)}`,
      // /subscription/cancelled doesn't exist; send a cancelled checkout
      // back to the subscription page so they can retry.
      cancel_url: `${origin}${tenantPath}/admin/subscription?cancelled=1`,
      // ITN target. Was /api/payfast/notify, which doesn't exist (404) -
      // so PayFast's payment notification never landed and the company
      // was never flipped to 'active'. The real subscription webhook is
      // /api/webhooks/subscriptions/payfast.
      notify_url: `${origin}/api/webhooks/subscriptions/payfast`,
      name_first: user.firstName,
      name_last: user.lastName,
      email_address: user.email,
      m_payment_id: merchantPaymentId,
      amount: isTrial ? "0.00" : amount.toFixed(2),
      item_name: `${plan.name} Plan - ${billingCycle}`,
      item_description: `${plan.name} subscription (${billingCycle} billing)`,
      custom_str1: user.userId,
      custom_str2: plan.id,
      custom_str3: billingCycle,
      email_confirmation: "1",
      confirmation_address: user.email,
      subscription_type: "1",
      billing_date: billingDate,
      recurring_amount: amount.toFixed(2),
      frequency,
      cycles: "0",
    };

    const signature = this.generateSignature(params);

    return {
      ...params,
      signature,
    } as unknown as PayFastSubscriptionParams;
  }

  /**
   * Single-charge checkout used by the isolated R5 flow-test plan. It
   * deliberately omits subscription fields so PayFast cannot create a
   * recurring agreement for the test payment.
   */
  createOneTimePlanParams(
    plan: SubscriptionPlan,
    user: {
      firstName: string;
      lastName: string;
      email: string;
      userId: string;
    },
    baseUrl: string,
    tenantSlug?: string,
  ): Record<string, string> {
    const tenantPath = tenantSlug ? "/" + encodeURIComponent(tenantSlug) : "";
    const merchantPaymentId = crypto.randomUUID();
    const params: Record<string, string> = {
      merchant_id: this.config.merchantId,
      merchant_key: this.config.merchantKey,
      return_url: `${baseUrl}${tenantPath}/subscription/success?m_payment_id=${encodeURIComponent(merchantPaymentId)}`,
      cancel_url: baseUrl + tenantPath + "/admin/subscription?cancelled=1",
      notify_url: baseUrl + "/api/webhooks/subscriptions/payfast",
      name_first: user.firstName,
      name_last: user.lastName,
      email_address: user.email,
      m_payment_id: merchantPaymentId,
      amount: plan.monthlyPrice.toFixed(2),
      item_name: plan.name + " - once-off test",
      item_description: plan.name + " one-time PayFast flow test",
      custom_str1: user.userId,
      custom_str2: plan.id,
      custom_str3: "monthly",
      email_confirmation: "1",
      confirmation_address: user.email,
    };
    return { ...params, signature: this.generateSignature(params) };
  }

  getPaymentFormUrl(): string {
    return this.baseUrl;
  }

  generatePaymentForm(params: Record<string, string> | PayFastSubscriptionParams): string {
    // Escape attribute values so item names with quotes/ampersands
    // can't break out of the hidden input markup. The browser decodes
    // entities before POSTing, so the submitted values (and therefore
    // the signature inputs) are unchanged.
    const escAttr = (v: unknown) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
    const formFields = orderPayFastPaymentEntries(params as Record<string, unknown>)
      .map(
        ([key, value]) =>
          `<input type="hidden" name="${key}" value="${escAttr(value)}" />`
      )
      .join("\n");

    return `
      <form id="payfast-form" action="${this.baseUrl}" method="POST">
        ${formFields}
      </form>
      <script>
        document.getElementById('payfast-form').submit();
      </script>
    `;
  }

  validateSignature(data: Record<string, string>, signature: string): boolean {
    const generatedSignature = this.generateSignature(data);
    return generatedSignature === signature;
  }

  private subscriptionHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers = { "merchant-id": this.config.merchantId, version: "v1", timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00") };
    const params: Record<string, string> = { ...headers, ...extra, passphrase: this.config.passphrase };
    const source = Object.keys(params).sort().map((key) => `${key}=${pfUrlEncode(params[key])}`).join("&");
    return { ...headers, signature: crypto.createHash("md5").update(source).digest("hex") };
  }

  private subscriptionUrl(token: string, action: string): string {
    return `https://api.payfast.co.za/subscriptions/${encodeURIComponent(token)}/${action}${this.config.testMode ? "?testing=true" : ""}`;
  }

  async cancelSubscription(token: string): Promise<boolean> {
    try {
      const response = await fetch(
        this.subscriptionUrl(token, "cancel"),
        {
          method: "PUT",
          headers: this.subscriptionHeaders(),
          signal: AbortSignal.timeout(15000),
        }
      );

      return response.ok;
    } catch (error) {
      console.error("PayFast cancellation error:", error);
      return false;
    }
  }

  async fetchSubscription(token: string): Promise<any> {
    try {
      const response = await fetch(
        this.subscriptionUrl(token, "fetch"),
        {
          method: "GET",
          headers: this.subscriptionHeaders(),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error("PayFast fetch error:", error);
      return null;
    }
  }

  async pauseSubscription(
    token: string,
    cycles: number
  ): Promise<boolean> {
    try {
      const response = await fetch(
        this.subscriptionUrl(token, "pause"),
        {
          method: "PUT",
          headers: {
            ...this.subscriptionHeaders({ cycles: String(cycles) }),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cycles }),
          signal: AbortSignal.timeout(15000),
        }
      );

      return response.ok;
    } catch (error) {
      console.error("PayFast pause error:", error);
      return false;
    }
  }

  async unpauseSubscription(token: string): Promise<boolean> {
    try {
      const response = await fetch(
        this.subscriptionUrl(token, "unpause"),
        {
          method: "PUT",
          headers: this.subscriptionHeaders(),
          signal: AbortSignal.timeout(15000),
        }
      );

      return response.ok;
    } catch (error) {
      console.error("PayFast unpause error:", error);
      return false;
    }
  }

  /**
   * Refund a previously captured PayFast transaction via the merchant
   * refund API.
   *
   * Endpoint:
   *   POST https://api.payfast.co.za/refunds/{pf_payment_id}        (live)
   *   POST https://sandbox.payfast.co.za/refunds/{pf_payment_id}    (sandbox)
   *
   * PayFast signs the request with the same md5(sorted-params + passphrase)
   * scheme used elsewhere in this service. The `timestamp`, `merchant-id`,
   * and `version` headers participate in the signature alongside the
   * body params.
   *
   * Uses the documented REST signature, cents amount and buyer notification.
   * The caller queries refund eligibility before claiming/sending a refund.
   * Reference: https://developers.payfast.co.za/api (Refunds).
   */
  async queryRefundAvailability(pfPaymentId: string): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
    if (this.config.testMode) return { ok: false, status: 400, body: null, error: "PayFast refunds are not supported in sandbox mode" };
    if (!pfPaymentId || !this.config.passphrase) return { ok: false, status: 400, body: null, error: "Refund transaction ID and merchant API passphrase are required" };
    try {
      const response = await fetch(`https://api.payfast.co.za/refunds/query/${encodeURIComponent(pfPaymentId)}`, {
        headers: this.subscriptionHeaders(), signal: AbortSignal.timeout(10000),
      });
      const parsed = await response.json();
      if (!response.ok) return { ok: false, status: response.status, body: parsed, error: `PayFast refund query HTTP ${response.status}` };
      const availability = parsed?.data?.response || parsed;
      if (!availability || !["REFUNDABLE", "COMPLETED", "NOT_AVAILABLE"].includes(availability.status)) {
        return { ok: false, status: 0, body: parsed, error: "PayFast returned an unrecognized refund query response" };
      }
      return { ok: true, status: response.status, body: availability };
    } catch (error: any) {
      return { ok: false, status: 0, body: null, error: error?.message || "PayFast refund query failed" };
    }
  }

  async refundTransaction(
    pfPaymentId: string,
    amountCents: number,
    reason: string,
  ): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
    if (this.config.testMode) return { ok: false, status: 400, body: null, error: "PayFast refunds are not supported in sandbox mode" };
    if (!pfPaymentId || !Number.isSafeInteger(amountCents) || amountCents <= 0 || !this.config.passphrase) {
      return { ok: false, status: 400, body: null, error: "Invalid refund transaction, amount or API passphrase" };
    }
    try {
      const url = `https://api.payfast.co.za/refunds/${encodeURIComponent(pfPaymentId)}`;
      const bodyParams: Record<string, string> = {
        amount: String(amountCents),
        reason: String(reason || "Refund").trim().length >= 3 ? String(reason || "Refund").trim().slice(0, 255) : "Refund",
        notify_buyer: "1",
      };
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...this.subscriptionHeaders(bodyParams),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(bodyParams).toString(),
        signal: AbortSignal.timeout(15000),
      });

      let parsed: any = null;
      try {
        parsed = await response.json();
      } catch {
        try {
          parsed = await response.text();
        } catch {
          parsed = null;
        }
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          body: parsed,
          error: `PayFast refund returned HTTP ${response.status}`,
        };
      }

      // HTTP 200 alone is insufficient. Only the provider's explicit
      // affirmative response permits the ledger to record a paid refund.
      if (parsed?.status === "success" && parsed?.data?.response === true) {
        return { ok: true, status: response.status, body: parsed };
      }
      const rejected = parsed?.data?.response === false || parsed?.status === "failed";
      return { ok: false, status: rejected ? 400 : 0, body: parsed,
        error: rejected ? String(parsed?.data?.message || "PayFast rejected the refund") : "PayFast refund response did not confirm its outcome" };
    } catch (error: any) {
      console.error("PayFast refund error:", error);
      return {
        ok: false,
        status: 0,
        body: null,
        error: error?.message || "PayFast refund call threw",
      };
    }
  }
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "payfast-test",
    name: "PayFast Flow Test",
    monthlyPrice: PAYFAST_TEST_PLAN_AMOUNT_ZAR,
    annualPrice: PAYFAST_TEST_PLAN_AMOUNT_ZAR,
    features: [
      "One R5 payment only",
      "Confirms PayFast notification and return",
      "Test tenant access",
    ],
    limits: { orders: 150, regions: 1, users: 5, inventory: 200 },
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 999,
    annualPrice: 10190,
    features: [
      "Up to 50 orders per month",
      "Basic lead management",
      "Quote generation & email automation",
      "Calendar & booking system",
      "Inventory tracking (200 items)",
      "Client portal access",
      "Basic reporting",
      "Email support",
      "1 region/kitchen",
      "Up to 5 team members",
    ],
    limits: {
      orders: 50,
      regions: 1,
      users: 5,
      inventory: 200,
    },
  },
  {
    id: "professional",
    name: "Pro",
    monthlyPrice: 1899,
    annualPrice: 19370,
    features: [
      "Up to 200 orders per month",
      "Advanced lead & CRM features",
      "Automated quote follow-ups",
      "Multi-region support (3 regions)",
      "Unlimited inventory items",
      "GPS driver tracking",
      "Receipt scanning & auto-stock",
      "Supplier price comparison",
      "Product expiry tracking",
      "Kitchen & shopping management",
      "Equipment cleaning scheduler",
      "Driver earnings calculator",
      "Advanced analytics & reports",
      "Priority email & chat support",
      "Up to 20 team members",
      "After-sales automation (6 emails)",
    ],
    limits: {
      orders: 200,
      regions: 3,
      users: 20,
      inventory: -1,
    },
    recommended: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: 4999,
    annualPrice: 50990,
    features: [
      "Unlimited orders",
      "Unlimited regions/franchises",
      "White-label options available",
      "Custom email templates",
      "Advanced automation rules",
      "Multi-currency support",
      "API access for integrations",
      "Dedicated account manager",
      "Custom training sessions",
      "24/7 priority support",
      "Unlimited team members",
      "Custom reporting dashboards",
      "Data export & backups",
      "Early access to new features",
      "Dedicated onboarding specialist",
    ],
    limits: {
      orders: -1,
      regions: -1,
      users: -1,
      inventory: -1,
    },
  },
];

export function getPlanById(planId: string): SubscriptionPlan | undefined {
  const normalizedId = planId.toLowerCase() === "pro" ? "professional" : planId.toLowerCase();
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === normalizedId);
}

/**
 * TIGHTEN I.86 (2026-06-02): proper Intl-driven formatter. The prior
 * implementation:
 *   - Returned `R${amount}` regardless of currency, so non-ZAR tenants
 *     saw "R" prefix on PayFast confirmation strings.
 *   - For USD, did `Math.round(amount * 0.054)` - hardcoded an
 *     ancient ZAR->USD exchange rate that drifted from reality. A
 *     subscription priced at R5000 rendered as "$270" using a 2020-
 *     era rate; today's $267 / $260 / $250 depending on FX.
 *
 * Now: locale-aware Intl.NumberFormat per currency, no conversion.
 * The amount is rendered AS the supplied currency (caller's
 * responsibility to pass the right amount in the right currency).
 */
const CURRENCY_LOCALE: Record<string, string> = {
  ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "en-IE",
  AUD: "en-AU", NZD: "en-NZ", NGN: "en-NG", KES: "en-KE",
};
export function formatCurrency(amount: number, currency: string = "ZAR"): string {
  try {
    // Consistency (Callum 2026-07-08): exact cents + dot-decimal / space
    // grouping like formatZAR so payment amounts match the quote,
    // invoice + PDF instead of rounding "R 5 833.86" to "R 5 834".
    return new Intl.NumberFormat(CURRENCY_LOCALE[currency] || "en-ZA", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(amount).map((p) => {
      if (p.type === "group") return " ";
      if (p.type === "decimal") return ".";
      return p.value.replace(/\s/g, " ");
    }).join("");
  } catch {
    // Unknown currency code - fall back to the symbol-less amount so we
    // don't display "$270" for a R5000 subscription via the bogus rate.
    return `${currency} ${amount.toLocaleString("en-ZA")}`;
  }
}

export function calculateTrialEndDate(days: number = PLATFORM_TRIAL_DAYS): Date {
  const today = new Date();
  return new Date(today.setDate(today.getDate() + days));
}

export function isTrialActive(trialEndDate: Date): boolean {
  return new Date() < trialEndDate;
}

export function getDaysRemaining(endDate: Date): number {
  const today = new Date();
  const diff = endDate.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * One-shot PayFast payment-form builder used by the per-tenant payment
 * dispatcher in `lib/paymentService.ts`. Reads credentials from the
 * caller (which already pulled them from `payment_gateway_credentials`
 * for the active tenant) - no env-var lookup happens here. The
 * legacy single-tenant env-var path in
 * `paymentProcessingService.generatePaymentLink` is preserved
 * unchanged for backwards compatibility.
 *
 * Returns a self-submitting HTML form snippet. The browser injects it
 * into the DOM; the form auto-posts to PayFast on the next tick.
 */
export interface PayFastFormInput {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  testMode: boolean;
  amount: number;
  itemName: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  nameFirst: string;
  nameLast: string;
  emailAddress: string;
  customStr1?: string;
  customStr2?: string;
  customStr3?: string;
  customStr4?: string;
  customStr5?: string;
  merchantPaymentId?: string;
}

export function generatePayFastPaymentForm(input: PayFastFormInput): string {
  const svc = new PayFastService({
    merchantId: input.merchantId,
    merchantKey: input.merchantKey,
    passphrase: input.passphrase,
    testMode: input.testMode,
  });

  const params: Record<string, string> = {
    merchant_id: input.merchantId,
    merchant_key: input.merchantKey,
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    notify_url: input.notifyUrl,
    name_first: input.nameFirst,
    name_last: input.nameLast,
    email_address: input.emailAddress,
    amount: input.amount.toFixed(2),
    item_name: input.itemName,
  };
  if (input.merchantPaymentId) params.m_payment_id = input.merchantPaymentId;
  if (input.customStr1) params.custom_str1 = input.customStr1;
  if (input.customStr2) params.custom_str2 = input.customStr2;
  if (input.customStr3) params.custom_str3 = input.customStr3;
  if (input.customStr4) params.custom_str4 = input.customStr4;
  if (input.customStr5) params.custom_str5 = input.customStr5;

  // PayFast's shared, public sandbox account is a special case. Its
  // credentials are intentionally not tied to a merchant passphrase and the
  // sandbox currently rejects any signature submitted with that account --
  // including signatures salted with the sample passphrase shown in older
  // integration examples. An omitted signature is accepted for this generic
  // test account. Keep the exception sandbox-only and credential-specific so
  // tenant-owned sandbox accounts and every live payment remain signed.
  const usesSharedUnsignedSandbox =
    input.testMode &&
    input.merchantId === "10000100" &&
    input.merchantKey === "46f0cd694581a";

  if (usesSharedUnsignedSandbox) {
    return svc.generatePaymentForm(params as any);
  }

  const signature = svc.generateSignature(params);
  return svc.generatePaymentForm({ ...params, signature } as any);
}

/**
 * Lightweight credential ping for PayFast. There's no public REST
 * "verify key" endpoint, so the closest sane thing is to compute a
 * signature locally (proves merchant_id + key + passphrase are
 * coherent strings) and return ok. A real round-trip happens only
 * when the first live IPN arrives. Better than nothing in the UI,
 * obviously not a substitute for an end-to-end test transaction.
 */
export function pingPayFastCredentials(input: {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
}): { ok: boolean; message?: string } {
  if (!input.merchantId || !input.merchantKey) {
    return { ok: false, message: "Merchant ID or key missing" };
  }
  try {
    const svc = new PayFastService({
      merchantId: input.merchantId,
      merchantKey: input.merchantKey,
      passphrase: input.passphrase,
      testMode: true,
    });
    const sig = svc.generateSignature({
      merchant_id: input.merchantId,
      merchant_key: input.merchantKey,
    });
    if (!sig || sig.length !== 32) {
      return { ok: false, message: "Signature generation produced an unexpected value" };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || "PayFast ping failed" };
  }
}

export interface DepositPaymentConfig {
  defaultDepositPercentage: number;
  defaultBalanceDueDays: number;
  defaultFinalOrderChangeDays: number;
  minDepositPercentage: number;
  maxDepositPercentage: number;
}

export const DEFAULT_DEPOSIT_CONFIG: DepositPaymentConfig = {
  defaultDepositPercentage: 30,
  defaultBalanceDueDays: 7,
  defaultFinalOrderChangeDays: 7,
  minDepositPercentage: 10,
  maxDepositPercentage: 100
};

export function calculateDepositAndBalance(
  totalAmount: number,
  depositPercentage: number = DEFAULT_DEPOSIT_CONFIG.defaultDepositPercentage
): {
  depositAmount: number;
  balanceAmount: number;
} {
  const depositAmount = Math.round((totalAmount * depositPercentage) / 100);
  const balanceAmount = totalAmount - depositAmount;
  
  return {
    depositAmount,
    balanceAmount
  };
}

export function calculateBalanceDueDate(
  eventDate: string,
  daysBeforeEvent: number = DEFAULT_DEPOSIT_CONFIG.defaultBalanceDueDays
): string {
  const event = new Date(eventDate);
  const dueDate = new Date(event);
  dueDate.setDate(dueDate.getDate() - daysBeforeEvent);
  return dueDate.toISOString().split('T')[0];
}

export function calculateFinalOrderChangeDate(
  eventDate: string,
  daysBeforeEvent: number = DEFAULT_DEPOSIT_CONFIG.defaultFinalOrderChangeDays
): string {
  const event = new Date(eventDate);
  const changeDate = new Date(event);
  changeDate.setDate(changeDate.getDate() - daysBeforeEvent);
  return changeDate.toISOString().split('T')[0];
}

export function canModifyOrder(
  finalOrderChangeDate: string,
  currentDate: Date = new Date()
): boolean {
  const changeDeadline = new Date(finalOrderChangeDate);
  return currentDate <= changeDeadline;
}

export function getOrderModificationStatus(
  finalOrderChangeDate: string,
  currentDate: Date = new Date()
): {
  canModify: boolean;
  daysRemaining: number;
  message: string;
} {
  const changeDeadline = new Date(finalOrderChangeDate);
  const today = currentDate;
  const daysRemaining = Math.ceil((changeDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  const canModify = daysRemaining > 0;
  
  let message = "";
  if (daysRemaining > 7) {
    message = `You can modify your order until ${formatLocalDate(changeDeadline)}`;
  } else if (daysRemaining > 0) {
    message = `Last chance! Order modifications close in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;
  } else {
    message = `Order modifications are no longer allowed (deadline was ${formatLocalDate(changeDeadline)})`;
  }
  
  return {
    canModify,
    daysRemaining,
    message
  };
}

export interface PayFastHistoryTransaction {
  pf_payment_id: string;
  m_payment_id: string;
  amount_gross: string | number;
  currency: string;
  payment_status: string;
  custom_str1?: string; custom_str2?: string; custom_str3?: string;
  custom_str4?: string; custom_str5?: string;
}
export interface PayFastHistoryCredentials { merchantId: string; passphrase?: string; isTest?: boolean }
/** Authenticated merchant history. An upstream error must never look like an empty successful scan. */
export async function fetchPayFastHistoryPage(
  credentials: PayFastHistoryCredentials,
  range: { from: string; to: string; offset: number; limit: number },
): Promise<{ transactions: PayFastHistoryTransaction[]; rawCount: number }> {
  if (!credentials.merchantId) throw new Error("PayFast merchant ID missing");
  const headersToSign = { "merchant-id": credentials.merchantId, version: "v1",
    timestamp: new Date().toISOString().replace(/\.\d+Z$/, "+00:00") };
  const query = { from: range.from, to: range.to, offset: String(range.offset), limit: String(range.limit) };
  const url = new URL("https://api.payfast.co.za/transactions/history");
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  if (credentials.isTest) url.searchParams.set("testing", "true");
  const response = await fetch(url, { headers: { ...headersToSign,
    signature: generatePayFastApiSignature({ ...headersToSign, ...query }, credentials.passphrase) },
    signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`PayFast history HTTP ${response.status}`);
  const body = await response.json();
  if (body?.status === "failed" || Number(body?.code || 200) >= 400) throw new Error("PayFast history rejected request");
  const payload = body?.data?.response ?? body?.response ?? body?.data ?? body;
  if (!Array.isArray(payload) && typeof payload !== "string") throw new Error("Unexpected PayFast history response");
  const list = Array.isArray(payload) ? payload : parsePayFastCsv(payload);
  const transactions = list.map((raw): PayFastHistoryTransaction => {
    const row = normalizePayFastHistoryRow(raw);
    const type = String(row.type || "").toUpperCase();
    const sign = String(row.sign || "").toUpperCase();
    const status = String(row.payment_status || row.status || "").toUpperCase();
    const amount = row.amount_gross ?? row.gross ?? row.amount;
    const complete = sign !== "DEBIT" && Number(amount) > 0 &&
      (["COMPLETE", "SUCCESSFUL"].includes(status) || type === "FUNDS_RECEIVED");
    return { pf_payment_id: String(row.pf_payment_id || row.id || ""),
      m_payment_id: String(row.m_payment_id || row.merchant_reference || ""),
      amount_gross: amount, currency: String(row.currency || "ZAR").toUpperCase(),
      payment_status: complete ? "COMPLETE" : status || type,
      custom_str1: row.custom_str1, custom_str2: row.custom_str2, custom_str3: row.custom_str3,
      custom_str4: row.custom_str4, custom_str5: row.custom_str5 };
  }).filter((row) => row.pf_payment_id && row.payment_status === "COMPLETE");
  return { transactions, rawCount: list.length };
}
/** Bounded convenience scan. Recovery workers persist their date/page cursor separately. */
export async function fetchRecentPayFastTransactions(credentials: PayFastHistoryCredentials, lookbackDays: number) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
  const transactions: PayFastHistoryTransaction[] = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const page = await fetchPayFastHistoryPage(credentials, { from, to, offset, limit: 1000 });
    transactions.push(...page.transactions);
    if (page.rawCount < 1000) return transactions;
  }
  throw new Error("PayFast history exceeds convenience scan; use the paginated recovery worker");
}

/** Query PayFast's source of truth for one payment found in transaction history. */
export async function queryPayFastTransaction(
  credentials: { merchantId: string; passphrase?: string; isTest?: boolean },
  pfPaymentId: string,
): Promise<{ status: string; m_payment_id: string; amount: number; cc_status?: string } | null> {
  if (!credentials?.merchantId || !pfPaymentId) return null;
  try {
    const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
    const headersToSign = {
      "merchant-id": credentials.merchantId,
      version: "v1",
      timestamp,
    };
    const signature = generatePayFastApiSignature(headersToSign, credentials.passphrase);
    const url = new URL(`https://api.payfast.co.za/process/query/${encodeURIComponent(pfPaymentId)}`);
    if (credentials.isTest) url.searchParams.set("testing", "true");
    const response = await fetch(url, {
      method: "GET",
      headers: { ...headersToSign, signature },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const body: any = await response.json().catch(() => null);
    const payment = body?.data?.response ?? body?.response ?? body?.data ?? body;
    if (!payment || typeof payment !== "object") return null;
    return {
      status: String(payment.status || "").toUpperCase(),
      m_payment_id: String(payment.m_payment_id || ""),
      amount: Number(payment.amount),
      cc_status: payment.cc_status == null ? undefined : String(payment.cc_status),
    };
  } catch (error) {
    console.warn("[payfastService] transaction query failed:", error);
    return null;
  }
}

function generatePayFastApiSignature(
  parameters: Record<string, string>,
  passphrase?: string,
): string {
  const signedParameters = { ...parameters };
  if (passphrase) signedParameters.passphrase = passphrase;
  const signatureSource = Object.entries(signedParameters)
    .filter(([, value]) => value != null && String(value) !== "")
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${pfUrlEncode(String(value))}`)
    .join("&");
  return crypto.createHash("md5").update(signatureSource).digest("hex");
}

function normalizePayFastHistoryRow(input: any): Record<string, any> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const row: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    row[String(key).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")] = value;
  }
  return row;
}

function parsePayFastCsv(csv: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const text = csv.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value); value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); value = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      value += character;
    }
  }
  if (value !== "" || row.length) { row.push(value); rows.push(row); }
  if (quoted) throw new Error("Malformed PayFast history CSV");
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  if (!headers.some((header) => ["pf_payment_id", "id"].includes(header)) ||
      !headers.some((header) => ["gross", "amount_gross", "amount"].includes(header))) {
    throw new Error("Unexpected PayFast history CSV headers");
  }
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}
