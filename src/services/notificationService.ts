
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Notification = Tables<"notifications">;

export const notificationService = {
  async getNotifications(userId: string, unreadOnly: boolean = false): Promise<Notification[]> {
    let query = supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching notifications:", error);
      return [];
    }

    return data || [];
  },

  async markAsRead(notificationId: string): Promise<Notification | null> {
    const { data, error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq("id", notificationId)
      .select()
      .single();

    if (error) {
      console.error("Error marking notification as read:", error);
      throw error;
    }

    return data;
  },

  async markAllAsRead(userId: string): Promise<boolean> {
    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq("recipient_id", userId)
      .eq("is_read", false);

    if (error) {
      console.error("Error marking all notifications as read:", error);
      throw error;
    }

    return true;
  },

  async createNotification(
    userId: string,
    recipientId: string,
    notification: {
      type: string;
      title: string;
      message: string;
      link?: string;
      priority?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Notification | null> {
    const { data, error } = await supabase
      .from("notifications")
      .insert([
        {
          user_id: userId,
          recipient_id: recipientId,
          notification_type: notification.type,
          title: notification.title,
          message: notification.message,
          link: notification.link,
          priority: notification.priority || "normal",
          metadata: notification.metadata || {}
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating notification:", error);
      throw error;
    }

    return data;
  },

  async subscribeToNotifications(userId: string, callback: (notification: Notification) => void) {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`
        },
        (payload) => {
          callback(payload.new as Notification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  async getUnreadCount(userId: string): Promise<number> {
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
  }
};
