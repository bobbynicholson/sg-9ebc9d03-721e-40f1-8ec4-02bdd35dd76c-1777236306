import { SubscriptionPlan, PaymentGatewayConfig } from "@/types/payments";

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

    return require("crypto")
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