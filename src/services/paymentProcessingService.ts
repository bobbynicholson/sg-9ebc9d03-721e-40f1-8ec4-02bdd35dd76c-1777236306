import { supabase } from "@/integrations/supabase/client";
import { 
  calculateDepositAndBalance, 
  calculateBalanceDueDate,
  calculateFinalOrderChangeDate,
  canModifyOrder,
  getOrderModificationStatus
} from "@/lib/payfastService";
import { realtimeNotificationService } from "./realtimeNotificationService";

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
        .select("*, payment_schedules(*)")
        .eq("id", orderId)
        .single();

      if (order && order.payment_schedules) {
        // Send payment received notification
        await realtimeNotificationService.sendPaymentReceivedNotification(
          userId,
          orderId,
          "deposit",
          order.payment_schedules.deposit_amount,
          order.payment_schedules.currency
        );

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
        .select("*, payment_schedules(*)")
        .eq("id", orderId)
        .single();

      if (order && order.payment_schedules) {
        // Send payment received notification
        await realtimeNotificationService.sendPaymentReceivedNotification(
          userId,
          orderId,
          "balance",
          order.payment_schedules.balance_amount,
          order.payment_schedules.currency
        );
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

      // Get all unsent reminders due today
      const { data: reminders, error } = await supabase
        .from("payment_reminders")
        .select("*, orders(*), payment_schedules(*)")
        .eq("sent", false)
        .lte("reminder_date", today);

      if (error || !reminders) {
        console.error("Error fetching reminders:", error);
        return 0;
      }

      let sentCount = 0;

      for (const reminder of reminders) {
        if (!reminder.orders || !reminder.payment_schedules) continue;

        // Skip if already paid
        if (reminder.payment_schedules.balance_paid) {
          await supabase
            .from("payment_reminders")
            .update({ sent: true, sent_at: new Date().toISOString() })
            .eq("id", reminder.id);
          continue;
        }

        // Send notification
        await realtimeNotificationService.sendPaymentReminderNotification(
          reminder.user_id,
          reminder.order_id,
          reminder.payment_schedules.balance_amount,
          reminder.payment_schedules.currency,
          reminder.payment_schedules.balance_due_date
        );

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
        .select("*, orders(*)")
        .gte("final_order_change_date", today.toISOString())
        .lte("final_order_change_date", threeDaysFromNow.toISOString())
        .eq("balance_paid", false);

      if (error || !schedules) {
        console.error("Error fetching schedules:", error);
        return 0;
      }

      let notifiedCount = 0;

      for (const schedule of schedules) {
        if (!schedule.orders) continue;

        const status = getOrderModificationStatus(schedule.final_order_change_date);

        if (status.canModify && status.daysRemaining <= 3) {
          // Check if we already sent a reminder today
          const { data: existingReminder } = await supabase
            .from("payment_reminders")
            .select("*")
            .eq("order_id", schedule.order_id)
            .eq("reminder_type", "modification_deadline")
            .gte("sent_at", today.toISOString())
            .single();

          if (!existingReminder) {
            await realtimeNotificationService.sendModificationDeadlineReminder(
              schedule.orders.user_id,
              schedule.order_id,
              schedule.final_order_change_date,
              status.daysRemaining
            );

            // Log the reminder
            await supabase.from("payment_reminders").insert([{
              order_id: schedule.order_id,
              user_id: schedule.orders.user_id,
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
   */
  async generatePaymentLink(
    orderId: string,
    paymentType: "deposit" | "balance"
  ): Promise<string | null> {
    try {
      const schedule = await this.getPaymentSchedule(orderId);
      if (!schedule) return null;

      const amount = paymentType === "deposit" 
        ? schedule.depositAmount 
        : schedule.balanceAmount;

      // Generate PayFast payment form
      // This would integrate with the PayFast service
      return `/checkout?orderId=${orderId}&type=${paymentType}&amount=${amount}`;
    } catch (error) {
      console.error("Error generating payment link:", error);
      return null;
    }
  }
}

export const paymentProcessingService = new PaymentProcessingService();
