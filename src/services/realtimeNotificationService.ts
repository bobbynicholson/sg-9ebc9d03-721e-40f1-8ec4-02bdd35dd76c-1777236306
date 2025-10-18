import { supabase } from "@/integrations/supabase/client";
import type { Tables, Json } from "@/integrations/supabase/types";

export type Notification = Tables<"notifications">;
export type NotificationInsert = Database["public"]["Tables"]["notifications"]["Insert"];

class RealtimeNotificationService {
  private subscriptions: Map<string, any> = new Map();

  /**
   * Create and send a notification to a user
   */
  async createNotification(payload: NotificationInsert): Promise<Notification | null> {
    try {
      const { data, error } = await supabase
        .from("notifications")
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error("Error creating notification:", error);
        return null;
      }

      // Trigger real-time update
      if (data && payload.user_id) {
         await this.broadcastNotification(payload.user_id, data);
      }

      return data;
    } catch (error) {
      console.error("Failed to create notification:", error);
      return null;
    }
  }

  /**
   * Subscribe to real-time notifications for a user
   */
  subscribeToNotifications(
    userId: string,
    callback: (notification: Notification) => void
  ): () => void {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          callback(payload.new as Notification);
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
        .eq("user_id", userId)
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
        .eq("user_id", userId)
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
        .eq("user_id", userId)
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
