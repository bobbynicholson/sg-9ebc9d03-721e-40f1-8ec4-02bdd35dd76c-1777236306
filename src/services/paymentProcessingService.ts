/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import { 
  calculateDepositAndBalance, 
  calculateBalanceDueDate,
  calculateFinalOrderChangeDate,
  canModifyOrder,
  getOrderModificationStatus
} from "@/lib/payfastService";
import { notificationService } from "./notificationService";
import { PayFastService } from "@/lib/payfastService";
import { sendEmailViaAPI } from "@/lib/emailClient";

export interface PaymentSchedule {
  orderId: string;
  totalAmount: number;
  currency: string;
  depositAmount: number;
  depositPercentage: number;
  depositPaid: boolean;
  depositPaidAt?: string;
  depositTransactionId?: string;
  balanceAmount: number;
  balanceDueDate: string;
  balancePaid: boolean;
  balancePaidAt?: string;
  balanceTransactionId?: string;
  finalOrderChangeDate: string;
  canModifyOrder: boolean;
  eventDate: string;
}

export interface PaymentReminderConfig {
  sendReminderDays: number[];
  sendFinalReminder: boolean;
  finalReminderDays: number;
}

const DEFAULT_REMINDER_CONFIG: PaymentReminderConfig = {
  sendReminderDays: [14, 7, 3],
  sendFinalReminder: true,
  finalReminderDays: 1,
};

class PaymentProcessingService {
  /**
   * Initialize payment schedule for an order
   */
  async initializePaymentSchedule(
    orderId: string,
    totalAmount: number,
    currency: string,
    eventDate: string,
    depositPercentage: number = 30,
    balanceDueDays: number = 7,
    finalOrderChangeDays: number = 7
  ): Promise<PaymentSchedule | null> {
    try {
      const { depositAmount, balanceAmount } = calculateDepositAndBalance(
        totalAmount,
        depositPercentage
      );

      const balanceDueDate = calculateBalanceDueDate(eventDate, balanceDueDays);
      const finalOrderChangeDate = calculateFinalOrderChangeDate(
        eventDate,
        finalOrderChangeDays
      );

      const schedule: PaymentSchedule = {
        orderId,
        totalAmount,
        currency,
        depositAmount,
        depositPercentage,
        depositPaid: false,
        balanceAmount,
        balanceDueDate,
        balancePaid: false,
        finalOrderChangeDate,
        canModifyOrder: canModifyOrder(finalOrderChangeDate),
        eventDate,
      };

      // Store in database
      const { error } = await supabase.from("payment_schedules").insert([{
        order_id: orderId,
        total_amount: totalAmount,
        currency,
        deposit_amount: depositAmount,
        deposit_percentage: depositPercentage,
        balance_amount: balanceAmount,
        balance_due_date: balanceDueDate,
        final_order_change_date: finalOrderChangeDate,
        event_date: eventDate,
      }]);

      if (error) {
        console.error("Error creating payment schedule:", error);
        return null;
      }

      return schedule;
    } catch (error) {
      console.error("Failed to initialize payment schedule:", error);
      return null;
    }
  }

  /**
   * Process deposit payment
   */
  async processDepositPayment(
    orderId: string,
    transactionId: string,
    gateway: string,
    userId: string
  ): Promise<boolean> {
    try {
      // Update payment schedule
      const { error: scheduleError } = await supabase
        .from("payment_schedules")
        .update({
          deposit_paid: true,
          deposit_paid_at: new Date().toISOString(),
          deposit_transaction_id: transactionId,
        })
        .eq("order_id", orderId);

      if (scheduleError) {
        console.error("Error updating payment schedule:", scheduleError);
        return false;
      }

      // Update order status
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          deposit_paid: true,
          deposit_paid_at: new Date().toISOString(),
          status: "confirmed",
        })
        .eq("id", orderId);

      if (orderError) {
        console.error("Error updating order:", orderError);
        return false;
      }

      // Get order details for notification
      const { data: order } = await supabase
        .from("orders")
        .select("*, payment_schedules!inner(*)")
        .eq("id", orderId)
        .single();

      if (order && order.payment_schedules) {
        const schedule = order.payment_schedules as any;

        // Send in-portal payment received notification
        await notificationService.createNotification({
          company_id: order.company_id,
          user_id: userId,
          recipient_id: order.user_id, // Should go to company admin
          title: `Payment Received: ${schedule.currency} ${schedule.deposit_amount.toFixed(2)}`,
          message: `A payment was successfully processed for order ${order.order_number}.`,
          notification_type: "success",
          priority: "high",
          link: `/orders/${orderId}`,
        });

        // ✅ FIX BUG #21.1: Send deposit receipt email
        if (order.client_email) {
          try {
            const subject = `Deposit Payment Received - Order #${order.order_number}`;
            const body = `Dear ${order.client_name}, your deposit of ${order.currency} ${schedule.deposit_amount.toFixed(2)} for order #${order.order_number} has been received.`;

            await sendEmailViaAPI({
              companyId: userId,
              to: order.client_email,
              subject,
              body,
              variables: {
                clientName: order.client_name || "Valued Client",
                orderNumber: order.order_number,
                companyName: "Your Catering Company"
              }
            });
            console.log("✅ Deposit receipt email sent to:", order.client_email);
          } catch (emailError) {
            console.error("⚠️ Failed to send deposit receipt email (non-blocking):", emailError);
          }
        }

        // Schedule balance payment reminders
        await this.scheduleBalanceReminders(orderId, userId);
      }

      return true;
    } catch (error) {
      console.error("Failed to process deposit payment:", error);
      return false;
    }
  }

  /**
   * Process balance payment
   */
  async processBalancePayment(
    orderId: string,
    transactionId: string,
    gateway: string,
    userId: string
  ): Promise<boolean> {
    try {
      // Update payment schedule
      const { error: scheduleError } = await supabase
        .from("payment_schedules")
        .update({
          balance_paid: true,
          balance_paid_at: new Date().toISOString(),
          balance_transaction_id: transactionId,
        })
        .eq("order_id", orderId);

      if (scheduleError) {
        console.error("Error updating payment schedule:", scheduleError);
        return false;
      }

      // Update order status to fully paid
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          balance_paid: true,
          balance_paid_at: new Date().toISOString(),
          payment_status: "completed",
          status: "confirmed",
        })
        .eq("id", orderId);

      if (orderError) {
        console.error("Error updating order:", orderError);
        return false;
      }

      // Get order details
      const { data: order } = await supabase
        .from("orders")
        .select("*, payment_schedules!inner(*)")
        .eq("id", orderId)
        .single();

      if (order && order.payment_schedules) {
        const schedule = order.payment_schedules as any;

        // Send in-portal payment received notification
        await notificationService.createNotification({
          company_id: order.company_id,
          user_id: userId,
          recipient_id: order.user_id, // Admin
          title: "Final Payment Received",
          message: `The final balance for order ${order.order_number} has been paid.`,
          notification_type: "success",
          priority: "high",
          link: `/orders/${orderId}`,
        });

        // ✅ FIX BUG #21.2: Send balance payment receipt email
        if (order.client_email) {
          try {
            const subject = `Final Payment Received - Order #${order.order_number}`;
            const body = `Dear ${order.client_name}, your final payment for order #${order.order_number} has been received. Your order is now fully confirmed.`;

            await sendEmailViaAPI({
              companyId: userId,
              to: order.client_email,
              subject,
              body,
              variables: {
                clientName: order.client_name || "Valued Client",
                orderNumber: order.order_number,
                companyName: "Your Catering Company"
              }
            });
            console.log("✅ Balance payment receipt email sent to:", order.client_email);
          } catch (emailError) {
            console.error("⚠️ Failed to send balance payment receipt email (non-blocking):", emailError);
          }
        }
      }

      return true;
    } catch (error) {
      console.error("Failed to process balance payment:", error);
      return false;
    }
  }

  /**
   * Schedule automated balance payment reminders
   */
  async scheduleBalanceReminders(
    orderId: string,
    userId: string,
    config: PaymentReminderConfig = DEFAULT_REMINDER_CONFIG
  ): Promise<void> {
    try {
      const { data: schedule } = await supabase
        .from("payment_schedules")
        .select("*")
        .eq("order_id", orderId)
        .single();

      if (!schedule || schedule.balance_paid) {
        return;
      }

      const balanceDueDate = new Date(schedule.balance_due_date);
      const today = new Date();

      // Create reminder records for each configured day
      for (const daysBeforeDue of config.sendReminderDays) {
        const reminderDate = new Date(balanceDueDate);
        reminderDate.setDate(reminderDate.getDate() - daysBeforeDue);

        if (reminderDate > today) {
          await supabase.from("payment_reminders").insert([{
            order_id: orderId,
            user_id: userId,
            reminder_date: reminderDate.toISOString(),
            reminder_type: "balance_payment",
            days_before_due: daysBeforeDue,
            sent: false,
          }]);
        }
      }

      // Schedule final reminder if enabled
      if (config.sendFinalReminder) {
        const finalReminderDate = new Date(balanceDueDate);
        finalReminderDate.setDate(
          finalReminderDate.getDate() - config.finalReminderDays
        );

        if (finalReminderDate > today) {
          await supabase.from("payment_reminders").insert([{
            order_id: orderId,
            user_id: userId,
            reminder_date: finalReminderDate.toISOString(),
            reminder_type: "final_balance_reminder",
            days_before_due: config.finalReminderDays,
            sent: false,
            is_urgent: true,
          }]);
        }
      }
    } catch (error) {
      console.error("Error scheduling balance reminders:", error);
    }
  }

  /**
   * Process due payment reminders
   */
  async processDueReminders(): Promise<number> {
    try {
      const today = new Date().toISOString().split("T")[0];

      // Get all unsent reminders due today, joining through orders to get payment_schedules
      const { data: reminders, error } = await supabase
        .from("payment_reminders")
        .select("*, order:orders!inner(*, payment_schedules!inner(*))")
        .eq("sent", false)
        .lte("reminder_date", today);

      if (error || !reminders) {
        console.error("Error fetching reminders:", error);
        return 0;
      }

      let sentCount = 0;

      for (const reminder of reminders) {
        const orderData = reminder.order as any;
        if (!orderData || !orderData.payment_schedules) continue;

        // Skip if already paid
        if (orderData.payment_schedules.balance_paid) {
          await supabase
            .from("payment_reminders")
            .update({ sent: true, sent_at: new Date().toISOString() })
            .eq("id", reminder.id);
          continue;
        }

        // Send in-portal notification
        await notificationService.createNotification({
          company_id: orderData.company_id,
          user_id: "system",
          recipient_id: orderData.user_id, // Admin
          title: `Payment Reminder Sent for Order ${orderData.order_number}`,
          message: `A payment reminder was sent to ${orderData.client_email}.`,
          notification_type: "info",
          priority: "medium",
          link: `/orders/${reminder.order_id}`,
        });

        // ✅ FIX BUG #21.3: Send balance reminder email
        if (orderData.client_email) {
          try {
            const daysUntilDue = Math.ceil(
              (new Date(orderData.payment_schedules.balance_due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
            );
            const urgency = daysUntilDue <= 1 ? "⚠️ URGENT: " : "";
            const subject = `${urgency}Payment Reminder - Balance Due ${daysUntilDue === 1 ? "Tomorrow" : `in ${daysUntilDue} Days`}`;
            
            const body = `Dear ${orderData.client_name || "Valued Client"},

${urgency}Payment Reminder

Order Number: ${orderData.order_number}
Event Date: ${new Date(orderData.event_date).toLocaleDateString()}

Balance Due: ${orderData.payment_schedules.currency} ${orderData.payment_schedules.balance_amount.toFixed(2)}
Due Date: ${new Date(orderData.payment_schedules.balance_due_date).toLocaleDateString()}
${daysUntilDue <= 1 ? "\n⚠️ THIS PAYMENT IS DUE TOMORROW!\n" : ""}
To ensure your event proceeds smoothly, please complete your payment by the due date.

Pay Now: ${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/checkout?orderId=${reminder.order_id}&type=balance

Questions? Contact us immediately.

Thank you,
Your Catering Company`;

            await sendEmailViaAPI({
              companyId: reminder.user_id,
              to: orderData.client_email,
              subject,
              body,
              variables: {
                clientName: orderData.client_name || "Valued Client",
                orderNumber: orderData.order_number,
                companyName: "Your Catering Company"
              }
            });
            console.log(`✅ Balance reminder email sent to ${orderData.client_email} - ${daysUntilDue} days until due`);
          } catch (emailError) {
            console.error("⚠️ Failed to send balance reminder email (non-blocking):", emailError);
          }
        }

        // Mark as sent
        await supabase
          .from("payment_reminders")
          .update({ sent: true, sent_at: new Date().toISOString() })
          .eq("id", reminder.id);

        sentCount++;
      }

      return sentCount;
    } catch (error) {
      console.error("Error processing reminders:", error);
      return 0;
    }
  }

  /**
   * Check and notify about order modification deadlines
   */
  async checkModificationDeadlines(): Promise<number> {
    try {
      const today = new Date();
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      // Get orders with upcoming modification deadlines
      const { data: schedules, error } = await supabase
        .from("payment_schedules")
        .select("*, order:orders!inner(*)")
        .gte("final_order_change_date", today.toISOString())
        .lte("final_order_change_date", threeDaysFromNow.toISOString())
        .eq("balance_paid", false);

      if (error || !schedules) {
        console.error("Error fetching schedules for modification deadlines:", error);
        return 0;
      }

      let notifiedCount = 0;

      for (const schedule of schedules) {
        const orderData = schedule.order as any;
        if (!orderData) continue;

        const status = getOrderModificationStatus(schedule.final_order_change_date);

        if (status.canModify && status.daysRemaining <= 3) {
          // Check if we already sent a reminder today
          const { data: existingReminder } = await supabase
            .from("payment_reminders")
            .select("*")
            .eq("order_id", schedule.order_id)
            .eq("reminder_type", "modification_deadline")
            .gte("sent_at", today.toISOString().split('T')[0])
            .single();

          if (!existingReminder) {
            // Send in-portal notification
            await notificationService.createNotification({
              company_id: orderData.company_id,
              user_id: "system",
              recipient_id: orderData.user_id, // Admin
              title: "Modification Deadline Reminder Sent",
              message: `A modification deadline reminder for order ${orderData.order_number} was sent to ${orderData.client_email}.`,
              notification_type: "info",
              priority: "medium",
              link: `/orders/${schedule.order_id}`,
            });

            // ✅ FIX BUG #21.4: Send modification deadline warning email
            if (orderData.client_email) {
              try {
                const urgency = status.daysRemaining <= 1 ? "⚠️ FINAL NOTICE: " : "";
                const subject = `${urgency}Last Chance to Modify Your Order - ${status.daysRemaining} ${status.daysRemaining === 1 ? "Day" : "Days"} Remaining`;
                
                const body = `Dear ${orderData.client_name || "Valued Client"},

${urgency}Important: Order Modification Deadline Approaching

Order Number: ${orderData.order_number}
Event Date: ${new Date(orderData.event_date).toLocaleDateString()}

⏰ Modification Deadline: ${new Date(schedule.final_order_change_date).toLocaleDateString()}
⏰ Days Remaining: ${status.daysRemaining} ${status.daysRemaining === 1 ? "day" : "days"}

After this date, we can no longer accept changes to:
- Guest numbers
- Menu selections
- Event details
- Venue address

${status.daysRemaining <= 1 ? "\n⚠️ THIS IS YOUR FINAL NOTICE - Changes MUST be made by tomorrow!\n" : ""}
Why the deadline? 
We begin preparations ${status.daysRemaining + 2} days before your event to ensure everything is perfect.

Make Changes Now: ${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/client-portal?orderId=${schedule.order_id}

Questions? Contact us immediately.

Best regards,
Your Catering Company`;

                await sendEmailViaAPI({
                  companyId: orderData.user_id,
                  to: orderData.client_email,
                  subject,
                  body,
                  variables: {
                    clientName: orderData.client_name || "Valued Client",
                    orderNumber: orderData.order_number,
                    companyName: "Your Catering Company"
                  }
                });
                console.log(`✅ Modification deadline warning email sent to ${orderData.client_email} - ${status.daysRemaining} days remaining`);
              } catch (emailError) {
                console.error("⚠️ Failed to send modification deadline email (non-blocking):", emailError);
              }
            }

            // Log the reminder
            await supabase.from("payment_reminders").insert([{
              order_id: schedule.order_id,
              user_id: orderData.user_id,
              reminder_date: new Date().toISOString(),
              reminder_type: "modification_deadline",
              days_before_due: status.daysRemaining,
              sent: true,
              sent_at: new Date().toISOString(),
            }]);

            notifiedCount++;
          }
        }
      }

      return notifiedCount;
    } catch (error) {
      console.error("Error checking modification deadlines:", error);
      return 0;
    }
  }

  /**
   * Get payment schedule for an order
   */
  async getPaymentSchedule(orderId: string): Promise<PaymentSchedule | null> {
    try {
      const { data, error } = await supabase
        .from("payment_schedules")
        .select("*")
        .eq("order_id", orderId)
        .single();

      if (error || !data) {
        console.error("Error fetching payment schedule:", error);
        return null;
      }

      return {
        orderId: data.order_id,
        totalAmount: data.total_amount,
        currency: data.currency,
        depositAmount: data.deposit_amount,
        depositPercentage: data.deposit_percentage,
        depositPaid: data.deposit_paid,
        depositPaidAt: data.deposit_paid_at,
        depositTransactionId: data.deposit_transaction_id,
        balanceAmount: data.balance_amount,
        balanceDueDate: data.balance_due_date,
        balancePaid: data.balance_paid,
        balancePaidAt: data.balance_paid_at,
        balanceTransactionId: data.balance_transaction_id,
        finalOrderChangeDate: data.final_order_change_date,
        canModifyOrder: canModifyOrder(data.final_order_change_date),
        eventDate: data.event_date,
      };
    } catch (error) {
      console.error("Error getting payment schedule:", error);
      return null;
    }
  }

  /**
   * Generate payment link for deposit or balance
   * Bug #22 FIX: Integrate with PayFast to generate actual payment form/URL
   */
  async generatePaymentLink(
    orderId: string,
    paymentType: "deposit" | "balance"
  ): Promise<string | null> {
    try {
      const schedule = await this.getPaymentSchedule(orderId);
      if (!schedule) {
        console.error("Payment schedule not found for order:", orderId);
        return null;
      }

      const amount = paymentType === "deposit" 
        ? schedule.depositAmount 
        : schedule.balanceAmount;

      // Get order details. Pull the company slug along with the
      // owner profile so the PayFast return/cancel URLs land on the
      // catering company's slug-prefixed subscription pages.
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("*, profiles!inner(*, companies:company_id(slug))")
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        console.error("Error fetching order for payment link:", orderError);
        return null;
      }

      // Check if PayFast is configured
      const merchantId = process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID;
      const merchantKey = process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY;
      const passphrase = process.env.NEXT_PUBLIC_PAYFAST_PASSPHRASE;
      const testMode = process.env.NODE_ENV !== "production";

      if (!merchantId || !merchantKey) {
        console.warn("PayFast credentials not configured - returning checkout URL");
        // Fallback to local checkout page if PayFast not configured
        return `/checkout?orderId=${orderId}&type=${paymentType}&amount=${amount}`;
      }

      // Initialize PayFast service
      const payFastService = new PayFastService({
        merchantId,
        merchantKey,
        passphrase: passphrase || "",
        testMode
      });

      // Get user details from profile
      const profile = order.profiles as any;
      const [firstName, ...lastNameParts] = (profile.full_name || "").split(" ");
      const lastName = lastNameParts.join(" ") || "Customer";

      // Resolve the catering company's slug for slug-prefixed return URLs.
      const companySlug = (profile?.companies?.slug as string | undefined)
        || (Array.isArray(profile?.companies) ? profile.companies?.[0]?.slug : undefined)
        || "";
      const slugPrefix = companySlug ? `/${companySlug}` : "";
      const baseUrl = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com");

      // Generate PayFast payment form. Webhook URL is global (/api/...)
      // and intentionally not slug-prefixed.
      const paymentParams = {
        merchant_id: merchantId,
        merchant_key: merchantKey,
        return_url: `${baseUrl}${slugPrefix}/subscription/success?orderId=${orderId}&type=${paymentType}`,
        cancel_url: `${baseUrl}${slugPrefix}/subscription/cancelled?orderId=${orderId}&type=${paymentType}`,
        notify_url: `${baseUrl}/api/webhooks/payment-confirmation`,
        name_first: firstName || "Customer",
        name_last: lastName,
        email_address: profile.email,
        amount: amount.toFixed(2),
        item_name: `Order ${order.order_number} - ${paymentType === "deposit" ? "Deposit" : "Balance"} Payment`,
        item_description: `Payment for catering order on ${new Date(order.event_date).toLocaleDateString()}`,
        custom_str1: orderId, // Order ID for webhook processing
        custom_str2: paymentType, // Payment type (deposit/balance)
        custom_str3: order.user_id, // Company user ID
        email_confirmation: "1",
        confirmation_address: profile.email,
      };

      // Generate signature
      const signature = payFastService.generateSignature(paymentParams);
      
      // Return PayFast payment form HTML
      const paymentFormHtml = payFastService.generatePaymentForm({
        ...paymentParams,
        signature
      } as any);

      console.log(`✅ PayFast payment link generated for Order ${orderId} - ${paymentType} payment (${schedule.currency} ${amount})`);
      
      return paymentFormHtml;

    } catch (error) {
      console.error("Error generating payment link:", error);
      return null;
    }
  }
}

export const paymentProcessingService = new PaymentProcessingService();
