export type PaymentGatewayProvider = "payfast" | "yoco" | "stripe";

export interface PaymentGatewayProviderCatalogueEntry {
  provider: PaymentGatewayProvider;
  name: string;
  description: string;
  fields: Array<{ key: string; label: string; type: "text" | "password"; required: boolean }>;
}

/** Browser-safe provider metadata; contains no credential or server code. */
export function getPaymentGatewayCatalogue(): PaymentGatewayProviderCatalogueEntry[] {
  return [
    {
      provider: "payfast",
      name: "PayFast",
      description: "South Africa's leading payment gateway",
      fields: [
        { key: "merchantId", label: "Merchant ID", type: "text", required: true },
        { key: "merchantKey", label: "Merchant Key", type: "password", required: true },
        { key: "passphrase", label: "Passphrase", type: "password", required: false },
      ],
    },
    {
      provider: "yoco",
      name: "Yoco",
      description: "Simple, affordable card payments for South African businesses",
      fields: [
        { key: "secretKey", label: "Secret Key", type: "password", required: true },
        { key: "publicKey", label: "Public Key", type: "text", required: true },
        { key: "webhookSecret", label: "Webhook Signing Secret (auto-registered if blank)", type: "password", required: false },
      ],
    },
    {
      provider: "stripe",
      name: "Stripe",
      description: "International card payments via Stripe Checkout",
      fields: [
        { key: "secretKey", label: "Secret Key (sk_...)", type: "password", required: true },
        { key: "publishableKey", label: "Publishable Key (pk_...)", type: "text", required: true },
        { key: "webhookSigningSecret", label: "Webhook Signing Secret (whsec_...)", type: "password", required: true },
      ],
    },
  ];
}
