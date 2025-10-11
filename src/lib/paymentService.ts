
import { PaymentGateway, PaymentGatewayConfig, PaymentIntent, PaymentResult, PaymentTransaction } from "@/types/payments";

export class PaymentService {
  private static getActiveGateway(): PaymentGatewayConfig | null {
    const stored = localStorage.getItem("payment_gateway_config");
    if (!stored) return null;
    
    const configs: PaymentGatewayConfig[] = JSON.parse(stored);
    return configs.find(c => c.enabled) || null;
  }

  static async initiatePayment(intent: PaymentIntent): Promise<PaymentResult> {
    const gateway = this.getActiveGateway();
    
    if (!gateway) {
      return {
        success: false,
        errorMessage: "No payment gateway configured. Please contact support."
      };
    }

    try {
      switch (gateway.gateway) {
        case "payfast":
          return await this.processPayFast(intent, gateway);
        case "yoco":
          return await this.processYoco(intent, gateway);
        case "peach":
          return await this.processPeach(intent, gateway);
        case "stripe":
          return await this.processStripe(intent, gateway);
        case "paypal":
          return await this.processPayPal(intent, gateway);
        case "square":
          return await this.processSquare(intent, gateway);
        default:
          return {
            success: false,
            errorMessage: "Unsupported payment gateway"
          };
      }
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : "Payment processing failed"
      };
    }
  }

  private static async processPayFast(
    intent: PaymentIntent, 
    config: PaymentGatewayConfig
  ): Promise<PaymentResult> {
    const transaction = this.createTransaction(intent, config.gateway);
    
    const paymentData = {
      merchant_id: config.credentials.merchantId,
      merchant_key: config.credentials.merchantKey,
      return_url: config.successUrl,
      cancel_url: config.cancelUrl,
      notify_url: config.notifyUrl,
      name_first: intent.customerName.split(" ")[0],
      name_last: intent.customerName.split(" ").slice(1).join(" "),
      email_address: intent.customerEmail,
      m_payment_id: intent.orderId,
      amount: intent.amount.toFixed(2),
      item_name: intent.description,
      custom_str1: intent.orderId,
    };

    const paymentUrl = config.isTest 
      ? "https://sandbox.payfast.co.za/eng/process"
      : "https://www.payfast.co.za/eng/process";

    this.saveTransaction(transaction);

    return {
      success: true,
      transactionId: transaction.id,
      paymentUrl: `${paymentUrl}?${new URLSearchParams(paymentData as Record<string, string>).toString()}`,
      transaction
    };
  }

  private static async processYoco(
    intent: PaymentIntent,
    config: PaymentGatewayConfig
  ): Promise<PaymentResult> {
    const transaction = this.createTransaction(intent, config.gateway);
    
    this.saveTransaction(transaction);

    return {
      success: true,
      transactionId: transaction.id,
      paymentUrl: `/payment/yoco?orderId=${intent.orderId}&amount=${intent.amount}`,
      transaction
    };
  }

  private static async processPeach(
    intent: PaymentIntent,
    config: PaymentGatewayConfig
  ): Promise<PaymentResult> {
    const transaction = this.createTransaction(intent, config.gateway);
    
    this.saveTransaction(transaction);

    return {
      success: true,
      transactionId: transaction.id,
      paymentUrl: `/payment/peach?orderId=${intent.orderId}&amount=${intent.amount}`,
      transaction
    };
  }

  private static async processStripe(
    intent: PaymentIntent,
    config: PaymentGatewayConfig
  ): Promise<PaymentResult> {
    const transaction = this.createTransaction(intent, config.gateway);
    
    this.saveTransaction(transaction);

    return {
      success: true,
      transactionId: transaction.id,
      paymentUrl: `/payment/stripe?orderId=${intent.orderId}&amount=${intent.amount}`,
      transaction
    };
  }

  private static async processPayPal(
    intent: PaymentIntent,
    config: PaymentGatewayConfig
  ): Promise<PaymentResult> {
    const transaction = this.createTransaction(intent, config.gateway);
    
    this.saveTransaction(transaction);

    return {
      success: true,
      transactionId: transaction.id,
      paymentUrl: `/payment/paypal?orderId=${intent.orderId}&amount=${intent.amount}`,
      transaction
    };
  }

  private static async processSquare(
    intent: PaymentIntent,
    config: PaymentGatewayConfig
  ): Promise<PaymentResult> {
    const transaction = this.createTransaction(intent, config.gateway);
    
    this.saveTransaction(transaction);

    return {
      success: true,
      transactionId: transaction.id,
      paymentUrl: `/payment/square?orderId=${intent.orderId}&amount=${intent.amount}`,
      transaction
    };
  }

  private static createTransaction(
    intent: PaymentIntent,
    gateway: PaymentGateway
  ): PaymentTransaction {
    return {
      id: `TXN-${Date.now()}`,
      orderId: intent.orderId,
      quoteId: intent.metadata?.quoteId as string || "",
      amount: intent.amount,
      currency: intent.currency,
      gateway,
      status: "pending",
      customerEmail: intent.customerEmail,
      customerName: intent.customerName,
      metadata: intent.metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private static saveTransaction(transaction: PaymentTransaction): void {
    const stored = localStorage.getItem("payment_transactions");
    const transactions: PaymentTransaction[] = stored ? JSON.parse(stored) : [];
    transactions.push(transaction);
    localStorage.setItem("payment_transactions", JSON.stringify(transactions));
  }

  static getTransactions(): PaymentTransaction[] {
    const stored = localStorage.getItem("payment_transactions");
    return stored ? JSON.parse(stored) : [];
  }

  static getTransactionById(id: string): PaymentTransaction | null {
    const transactions = this.getTransactions();
    return transactions.find(t => t.id === id) || null;
  }

  static updateTransactionStatus(
    id: string, 
    status: PaymentTransaction["status"],
    transactionId?: string,
    errorMessage?: string
  ): void {
    const stored = localStorage.getItem("payment_transactions");
    if (!stored) return;

    const transactions: PaymentTransaction[] = JSON.parse(stored);
    const index = transactions.findIndex(t => t.id === id);
    
    if (index !== -1) {
      transactions[index].status = status;
      transactions[index].updatedAt = new Date().toISOString();
      
      if (transactionId) {
        transactions[index].transactionId = transactionId;
      }
      
      if (errorMessage) {
        transactions[index].errorMessage = errorMessage;
      }
      
      if (status === "completed") {
        transactions[index].completedAt = new Date().toISOString();
      }
      
      localStorage.setItem("payment_transactions", JSON.stringify(transactions));
    }
  }
}
