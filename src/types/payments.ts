
export type PaymentGateway = 
  | "payfast"
  | "yoco" 
  | "peach"
  | "stripe"
  | "paypal"
  | "square";

export type PaymentStatus = 
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "refunded"
  | "cancelled";

export interface PaymentGatewayConfig {
  id: string;
  gateway: PaymentGateway;
  name: string;
  enabled: boolean;
  isTest: boolean;
  region: "south-africa" | "international";
  credentials: {
    merchantId?: string;
    merchantKey?: string;
    passphrase?: string;
    publicKey?: string;
    secretKey?: string;
    apiKey?: string;
    clientId?: string;
    clientSecret?: string;
  };
  webhookUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
  notifyUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  orderId: string;
  quoteId: string;
  amount: number;
  currency: string;
  gateway: PaymentGateway;
  status: PaymentStatus;
  transactionId?: string;
  paymentMethod?: string;
  customerEmail: string;
  customerName: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface PaymentIntent {
  orderId: string;
  amount: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  paymentUrl?: string;
  errorMessage?: string;
  transaction?: PaymentTransaction;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  limits: {
    orders: number;
    regions: number;
    users: number;
    inventory: number;
  };
  recommended?: boolean;
}
