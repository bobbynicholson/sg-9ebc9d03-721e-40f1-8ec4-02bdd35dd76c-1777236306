import { SubscriptionPlan, PaymentGatewayConfig } from "@/types/payments";
import crypto from "crypto";

export interface PayFastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  testMode: boolean;
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
    const sortedKeys = Object.keys(data).sort();
    const paramString = sortedKeys
      .map((key) => `${key}=${encodeURIComponent(data[key].trim())}`)
      .join("&");

    const signatureString = this.config.passphrase
      ? `${paramString}&passphrase=${encodeURIComponent(this.config.passphrase)}`
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
    billingCycle: "monthly" | "annual"
  ): PayFastSubscriptionParams {
    const amount =
      billingCycle === "monthly" ? plan.monthlyPrice : plan.annualPrice;
    const frequency = billingCycle === "monthly" ? "3" : "6";
    const today = new Date();
    const billingDate = new Date(today.setDate(today.getDate() + 14))
      .toISOString()
      .split("T")[0];

    const params: Record<string, string> = {
      merchant_id: this.config.merchantId,
      merchant_key: this.config.merchantKey,
      return_url: `${window.location.origin}/subscription/success`,
      cancel_url: `${window.location.origin}/subscription/cancelled`,
      notify_url: `${window.location.origin}/api/payfast/notify`,
      name_first: user.firstName,
      name_last: user.lastName,
      email_address: user.email,
      subscription_type: "1",
      billing_date: billingDate,
      recurring_amount: amount.toString(),
      frequency: frequency,
      cycles: "0",
      item_name: `${plan.name} Plan - ${billingCycle}`,
      item_description: `${plan.name} subscription (${billingCycle} billing)`,
      custom_str1: user.userId,
      custom_str2: plan.id,
      custom_str3: billingCycle,
      email_confirmation: "1",
      confirmation_address: user.email,
    };

    const signature = this.generateSignature(params);

    return {
      ...params,
      signature,
    } as unknown as PayFastSubscriptionParams;
  }

  getPaymentFormUrl(): string {
    return this.baseUrl;
  }

  generatePaymentForm(params: PayFastSubscriptionParams): string {
    const formFields = Object.entries(params)
      .map(
        ([key, value]) =>
          `<input type="hidden" name="${key}" value="${value}" />`
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

  async cancelSubscription(token: string): Promise<boolean> {
    try {
      const response = await fetch(
        "https://api.payfast.co.za/subscriptions/" + token + "/cancel",
        {
          method: "PUT",
          headers: {
            "merchant-id": this.config.merchantId,
            version: "v1",
            timestamp: new Date().toISOString(),
          },
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
        "https://api.payfast.co.za/subscriptions/" + token + "/fetch",
        {
          method: "GET",
          headers: {
            "merchant-id": this.config.merchantId,
            version: "v1",
            timestamp: new Date().toISOString(),
          },
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
        `https://api.payfast.co.za/subscriptions/${token}/pause`,
        {
          method: "PUT",
          headers: {
            "merchant-id": this.config.merchantId,
            "Content-Type": "application/json",
            version: "v1",
            timestamp: new Date().toISOString(),
          },
          body: JSON.stringify({ cycles }),
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
        `https://api.payfast.co.za/subscriptions/${token}/unpause`,
        {
          method: "PUT",
          headers: {
            "merchant-id": this.config.merchantId,
            version: "v1",
            timestamp: new Date().toISOString(),
          },
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
   * TODO: PayFast's public refund API spec is not exhaustively documented
   * at https://developers.payfast.co.za/api -- the field names below
   * (`amount`, `reason`) match common community implementations but should
   * be re-verified against PayFast's onboarded merchant documentation.
   * The amount unit is sent as cents (integer); confirm before going live.
   */
  async refundTransaction(
    pfPaymentId: string,
    amountCents: number,
    reason: string,
  ): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
    try {
      const baseHost = this.config.testMode
        ? "https://sandbox.payfast.co.za"
        : "https://api.payfast.co.za";
      const url = `${baseHost}/refunds/${encodeURIComponent(pfPaymentId)}`;
      const timestamp = new Date().toISOString();

      // Body params PayFast expects in the refund call. PayFast docs are
      // thin on this endpoint -- if your account requires additional
      // fields (e.g. `merchant_reference`, `currency`) extend this map.
      const bodyParams: Record<string, string> = {
        amount: String(Math.max(0, Math.round(amountCents))),
        reason: (reason || "").slice(0, 255),
      };

      // Signature params include the auth headers PayFast verifies.
      const signParams: Record<string, string> = {
        ...bodyParams,
        "merchant-id": this.config.merchantId,
        version: "v1",
        timestamp,
      };
      const signature = this.generateSignature(signParams);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "merchant-id": this.config.merchantId,
          version: "v1",
          timestamp,
          signature,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(bodyParams).toString(),
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

      return { ok: true, status: response.status, body: parsed };
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
    id: "starter",
    name: "Starter",
    monthlyPrice: 299,
    annualPrice: 2990,
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
    name: "Professional",
    monthlyPrice: 599,
    annualPrice: 5990,
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
    monthlyPrice: 1299,
    annualPrice: 12990,
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
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === planId);
}

export function formatCurrency(amount: number, currency: string = "ZAR"): string {
  if (currency === "USD") {
    return `$${Math.round(amount * 0.054)}`;
  }
  return `R${amount}`;
}

export function calculateTrialEndDate(days: number = 14): Date {
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
 * for the active tenant) -- no env-var lookup happens here. The
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
  if (input.customStr1) params.custom_str1 = input.customStr1;
  if (input.customStr2) params.custom_str2 = input.customStr2;
  if (input.customStr3) params.custom_str3 = input.customStr3;
  if (input.customStr4) params.custom_str4 = input.customStr4;

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
    message = `You can modify your order until ${changeDeadline.toLocaleDateString()}`;
  } else if (daysRemaining > 0) {
    message = `Last chance! Order modifications close in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;
  } else {
    message = `Order modifications are no longer allowed (deadline was ${changeDeadline.toLocaleDateString()})`;
  }
  
  return {
    canModify,
    daysRemaining,
    message
  };
}
