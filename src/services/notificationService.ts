import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { UserRole } from "@/types/app";

export type Notification = Tables<"notifications">;

export const notificationService = {
  async getNotifications(
    userId: string, 
    unreadOnly: boolean = false,
    activeRole?: string
  ): Promise<Notification[]> {
    let query = supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    if (activeRole) {
      query = query.or(`target_role.eq.${activeRole},target_role.is.null`);
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

  async markAllAsRead(userId: string, activeRole?: string): Promise<boolean> {
    let query = supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq("recipient_id", userId)
      .eq("is_read", false);

    if (activeRole) {
      query = query.or(`target_role.eq.${activeRole},target_role.is.null`);
    }

    const { error } = await query;

    if (error) {
      console.error("Error marking all notifications as read:", error);
      throw error;
    }

    return true;
  },

  async createNotification(
    notification: {
      recipient_id: string;
      user_id?: string;
      type: string;
      title: string;
      message: string;
      link?: string;
      priority?: string;
      target_role?: UserRole;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Notification | null> {
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        recipient_id: notification.recipient_id,
        user_id: notification.user_id,
        notification_type: notification.type,
        title: notification.title,
        message: notification.message,
        link: notification.link || null,
        priority: notification.priority || "normal",
        target_role: notification.target_role || null,
        metadata: (notification.metadata || {}) as unknown as never
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating notification:", error);
      throw error;
    }

    return data;
  },

  async subscribeToNotifications(
    userId: string, 
    callback: (notification: Notification) => void,
    activeRole?: string
  ) {
    const channel = supabase
      .channel(`notifications:${userId}:${activeRole || "all"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`
        },
        (payload) => {
          const notification = payload.new as Notification;
          if (!activeRole || !notification.target_role || notification.target_role === activeRole) {
            callback(notification);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  async getUnreadCount(userId: string, activeRole?: string): Promise<number> {
    let query = supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("is_read", false);

    if (activeRole) {
      query = query.or(`target_role.eq.${activeRole},target_role.is.null`);
    }

    const { count, error } = await query;

    if (error) {
      console.error("Error getting unread count:", error);
      return 0;
    }

    return count || 0;
  }
};