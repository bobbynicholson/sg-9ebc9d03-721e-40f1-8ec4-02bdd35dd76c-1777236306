import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

export type NotificationType = 
  | "payment_received"
  | "payment_reminder"
  | "order_confirmed"
  | "order_updated"
  | "driver_assigned"
  | "delivery_started"
  | "delivery_completed"
  | "equipment_shortage"
  | "balance_due_reminder"
  | "order_modification_deadline"
  | "quote_sent"
  | "quote_accepted"
  | "system_alert"
  | "driver_arrived"
  | "driver_10_minutes_away"
  | "driver_departure"
  | "bad_review_alert"
  | "event_complete"
  | "delivery_arrived";

export type NotificationPriority = "low" | "medium" | "high" | "urgent";

export interface NotificationPayload {
  userId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  actionUrl?: string;
  metadata?: Record<string, any>;
  orderId?: string;
  quoteId?: string;
}

export interface NotificationPreferences {
  userId: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  inAppNotifications: boolean;
  notificationTypes: {
    [key in NotificationType]?: boolean;
  };
}

class RealtimeNotificationService {
  private subscriptions: Map<string, any> = new Map();

  /**
   * Send a notification to a user
   */
  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from("notifications")
        .insert([{
          user_id: payload.userId,
          recipient_id: payload.recipientId,
          notification_type: payload.type,
          title: payload.title,
          message: payload.message,
          priority: payload.priority,
          action_url: payload.actionUrl,
          metadata: payload.metadata,
          order_id: payload.orderId,
          quote_id: payload.quoteId,
          is_read: false,
        }])
        .select()
        .single();

      if (error) {
        console.error("Error sending notification:", error);
        return false;
      }

      // Trigger real-time update
      await this.broadcastNotification(payload.recipientId, data);

      return true;
    } catch (error) {
      console.error("Failed to send notification:", error);
      return false;
    }
  }

  /**
   * Subscribe to real-time notifications for a user
   */
  subscribeToNotifications(
    userId: string,
    callback: (notification: any) => void
  ): () => void {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          callback(payload.new);
        }
      )
      .subscribe();

    this.subscriptions.set(userId, channel);

    // Return unsubscribe function
    return () => {
      channel.unsubscribe();
      this.subscriptions.delete(userId);
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq("id", notificationId);

      return !error;
    } catch (error) {
      console.error("Error marking notification as read:", error);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq("recipient_id", userId)
        .eq("is_read", false);

      return !error;
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      return false;
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .eq("is_read", false);

      if (error) {
        console.error("Error getting unread count:", error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error("Failed to get unread count:", error);
      return 0;
    }
  }

  /**
   * Get user notifications with pagination
   */
  async getUserNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
    } = {}
  ): Promise<any[]> {
    try {
      let query = supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false });

      if (options.unreadOnly) {
        query = query.eq("is_read", false);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error getting notifications:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("Failed to get notifications:", error);
      return [];
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId);

      return !error;
    } catch (error) {
      console.error("Error deleting notification:", error);
      return false;
    }
  }

  /**
   * Send payment received notification
   */
  async sendPaymentReceivedNotification(
    userId: string,
    orderId: string,
    paymentType: "deposit" | "balance",
    amount: number,
    currency: string
  ): Promise<boolean> {
    const title = paymentType === "deposit" 
      ? "Deposit Payment Received"
      : "Balance Payment Received";
    
    const message = paymentType === "deposit"
      ? `Deposit payment of ${currency} ${amount} received. Balance due before event.`
      : `Full payment of ${currency} ${amount} received. Your booking is confirmed!`;

    return this.sendNotification({
      userId,
      recipientId: userId,
      type: "payment_received",
      title,
      message,
      priority: "high",
      orderId,
      actionUrl: `/client-portal?orderId=${orderId}`,
    });
  }

  /**
   * Send payment reminder notification
   */
  async sendPaymentReminderNotification(
    userId: string,
    orderId: string,
    amount: number,
    currency: string,
    dueDate: string
  ): Promise<boolean> {
    return this.sendNotification({
      userId,
      recipientId: userId,
      type: "payment_reminder",
      title: "Payment Reminder",
      message: `Balance payment of ${currency} ${amount} is due by ${new Date(dueDate).toLocaleDateString()}`,
      priority: "high",
      orderId,
      actionUrl: `/client-portal?orderId=${orderId}`,
    });
  }

  /**
   * Send order modification deadline reminder
   */
  async sendModificationDeadlineReminder(
    userId: string,
    orderId: string,
    deadlineDate: string,
    daysRemaining: number
  ): Promise<boolean> {
    const urgency = daysRemaining <= 3 ? "urgent" : "high";
    
    return this.sendNotification({
      userId,
      recipientId: userId,
      type: "order_modification_deadline",
      title: "Order Modification Deadline Approaching",
      message: `Last chance to modify your order! Deadline is ${new Date(deadlineDate).toLocaleDateString()} (${daysRemaining} days remaining)`,
      priority: urgency,
      orderId,
      actionUrl: `/client-portal?orderId=${orderId}`,
    });
  }

  /**
   * Send driver assignment notification
   */
  async sendDriverAssignedNotification(
    clientUserId: string,
    driverUserId: string,
    orderId: string,
    driverName: string
  ): Promise<boolean> {
    // Notify client
    await this.sendNotification({
      userId: clientUserId,
      recipientId: clientUserId,
      type: "driver_assigned",
      title: "Driver Assigned",
      message: `${driverName} has been assigned to your order`,
      priority: "medium",
      orderId,
      actionUrl: `/tracking/client?orderId=${orderId}`,
    });

    // Notify driver
    await this.sendNotification({
      userId: driverUserId,
      recipientId: driverUserId,
      type: "driver_assigned",
      title: "New Delivery Assignment",
      message: "You have been assigned to a new delivery",
      priority: "high",
      orderId,
      actionUrl: `/tracking/driver?orderId=${orderId}`,
    });

    return true;
  }

  /**
   * Send delivery status update notification
   */
  async sendDeliveryStatusNotification(
    userId: string,
    orderId: string,
    status: "collected" | "in_transit" | "delivered" | "completed"
  ): Promise<boolean> {
    const statusMessages = {
      collected: "Food has been collected from kitchen",
      in_transit: "Driver is on the way to your venue",
      delivered: "Food has been delivered to your venue",
      completed: "Delivery completed successfully",
    };

    return this.sendNotification({
      userId,
      recipientId: userId,
      type: "delivery_started",
      title: "Delivery Update",
      message: statusMessages[status],
      priority: "medium",
      orderId,
      actionUrl: `/tracking/client?orderId=${orderId}`,
    });
  }

  /**
   * Broadcast notification via real-time channel
   */
  private async broadcastNotification(userId: string, notification: any): Promise<void> {
    try {
      const channel = supabase.channel(`user:${userId}`);
      await channel.send({
        type: "broadcast",
        event: "notification",
        payload: notification,
      });
    } catch (error) {
      console.error("Error broadcasting notification:", error);
    }
  }

  /**
   * Clean up old notifications
   */
  async cleanupOldNotifications(daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data, error } = await supabase
        .from("notifications")
        .delete()
        .lt("created_at", cutoffDate.toISOString())
        .eq("is_read", true)
        .select();

      if (error) {
        console.error("Error cleaning up notifications:", error);
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error("Failed to cleanup notifications:", error);
      return 0;
    }
  }
}

export const realtimeNotificationService = new RealtimeNotificationService();
