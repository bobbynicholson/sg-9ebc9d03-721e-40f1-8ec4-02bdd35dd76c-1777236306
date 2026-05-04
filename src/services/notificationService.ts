/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { UserRole } from "@/types/app";

export type Notification = Tables<"notifications">;

/**
 * UNIFIED NOTIFICATION SERVICE - CateringMS
 * 
 * Consolidated from 3 separate services:
 * - lib/notificationService.ts (email templates)
 * - services/notificationService.ts (base Supabase)
 * - services/realtimeNotificationService.ts (realtime features)
 * 
 * Features:
 * - Supabase database storage (NOT localStorage)
 * - Real-time subscriptions
 * - Role-based filtering
 * - Email template generation
 * - Cleanup utilities
 * - Broadcast capabilities
 * - After-sales automation integration
 */

interface EmailTemplate {
  type: "review" | "feedback" | "delivery_update" | "driver_assigned";
  subject: string;
  body: string;
}

interface CreateNotificationParams {
  company_id?: string;
  recipient_id: string;
  user_id?: string;
  type?: string;
  notification_type?: string;
  title: string;
  message: string;
  link?: string;
  priority?: string;
  target_role?: UserRole;
  metadata?: Record<string, unknown>;
  order_id?: string;
}

interface BroadcastNotificationParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  targetRoles?: UserRole[];
  priority?: string;
  link?: string;
  /**
   * Optional region scoping. When set, only profiles that can access
   * this region receive the broadcast:
   *   * super_admin / company_admin / sales_admin always receive (cross-branch)
   *   * region_admin receives if regionId is in their regions_covered or
   *     matches their primary region_id
   *   * driver / kitchen / shopping / cleaning staff receive on the
   *     same scoping rule
   * Leave undefined for company-wide broadcasts (existing behaviour).
   */
  regionId?: string | null;
}

interface CleanupOptions {
  daysOld?: number;
  targetUserId?: string;
}

interface NotificationFilters {
  limit?: number;
  offset?: number;
  priority?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}

export const notificationService = {
  // ==================== CORE CRUD OPERATIONS ====================
  
  async getNotifications(
    userId: string, 
    unreadOnly: boolean = false,
    activeRole?: string,
    filters?: NotificationFilters
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

    if (filters?.priority) {
      query = query.eq("priority", filters.priority);
    }

    if (filters?.type) {
      query = query.eq("notification_type", filters.type);
    }

    if (filters?.startDate) {
      query = query.gte("created_at", filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte("created_at", filters.endDate);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
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

  async createNotification(notification: CreateNotificationParams): Promise<Notification | null> {
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        company_id: notification.company_id || null,
        recipient_id: notification.recipient_id,
        user_id: notification.user_id,
        notification_type: notification.type || notification.notification_type || "system_alert",
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

  async deleteNotification(notificationId: string): Promise<boolean> {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notificationId);

    if (error) {
      console.error("Error deleting notification:", error);
      throw error;
    }

    return true;
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
  },

  // ==================== REALTIME SUBSCRIPTIONS ====================

  subscribeToNotifications(
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

  // ==================== BROADCAST & BULK OPERATIONS ====================

  async broadcastNotification(params: BroadcastNotificationParams): Promise<number> {
    try {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, region_id, regions_covered")
        .eq("company_id", params.userId);

      if (profileError) {
        console.error("Error fetching company profiles:", profileError);
        return 0;
      }

      if (!profiles || profiles.length === 0) {
        return 0;
      }

      // Region-aware fan-out. Cross-branch roles always receive; everyone
      // else receives only if the broadcast is unscoped, or their
      // regions_covered/region_id covers the target region.
      const CROSS_BRANCH_ROLES = new Set([
        "super_admin", "company_admin", "sales_admin",
      ]);
      const regionScope = params.regionId ?? null;

      const notifications = profiles
        .filter(profile => {
          if (!params.targetRoles || params.targetRoles.length === 0) {
            // No role restriction; still apply region scoping below.
          } else if (!params.targetRoles.includes(profile.role as UserRole)) {
            return false;
          }
          if (!regionScope) return true;  // company-wide broadcast
          if (CROSS_BRANCH_ROLES.has(profile.role as string)) return true;
          const covered = (profile as any).regions_covered as string[] | null;
          const primary = (profile as any).region_id as string | null;
          if (covered && covered.length > 0) return covered.includes(regionScope);
          if (primary) return primary === regionScope;
          // Profile has no region scoping data -- preserve existing
          // behaviour (treat as cross-branch) so legacy users don't
          // silently miss notifications.
          return true;
        })
        .map(profile => ({
          recipient_id: profile.id,
          user_id: params.userId,
          notification_type: params.type,
          title: params.title,
          message: params.message,
          link: params.link || null,
          priority: params.priority || "normal",
          target_role: profile.role as UserRole,
          is_read: false
        }));

      if (notifications.length === 0) {
        return 0;
      }

      const { error: insertError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (insertError) {
        console.error("Error broadcasting notifications:", insertError);
        return 0;
      }

      return notifications.length;
    } catch (error) {
      console.error("Error in broadcastNotification:", error);
      return 0;
    }
  },

  // ==================== CLEANUP & MAINTENANCE ====================

  async cleanupOldNotifications(options: CleanupOptions = {}): Promise<number> {
    const daysOld = options.daysOld || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    let query = supabase
      .from("notifications")
      .delete()
      .lt("created_at", cutoffDate.toISOString())
      .eq("is_read", true);

    if (options.targetUserId) {
      query = query.eq("recipient_id", options.targetUserId);
    }

    const { data, error } = await query.select();

    if (error) {
      console.error("Error cleaning up notifications:", error);
      return 0;
    }

    return data?.length || 0;
  },

  // ==================== DELIVERY TRACKING NOTIFICATIONS ====================

  async sendDeliveryUpdate(
    orderId: string,
    clientEmail: string,
    clientName: string,
    status: string,
    recipientId: string
  ): Promise<void> {
    const statusMessages: Record<string, { title: string; message: string; priority: string }> = {
      driver_logged_in: {
        title: "Driver En Route",
        message: "Your driver has logged in and is preparing for pickup",
        priority: "normal"
      },
      food_collected: {
        title: "Food Collected",
        message: "Your food has been collected and is on the way",
        priority: "high"
      },
      driver_arrived: {
        title: "Driver Arrived",
        message: "Your driver has arrived at the venue",
        priority: "urgent"
      },
      delivery_complete: {
        title: "Delivery Complete",
        message: "Your order has been delivered successfully",
        priority: "high"
      },
    };

    const notificationData = statusMessages[status];
    
    if (notificationData) {
      await this.createNotification({
        recipient_id: recipientId,
        type: status,
        title: notificationData.title,
        message: notificationData.message,
        priority: notificationData.priority,
        link: `/client-portal/tracking?orderId=${orderId}`,
        metadata: { orderId, clientEmail, clientName, status }
      });
    }
  },

  async sendReviewRequest(
    orderId: string,
    clientEmail: string,
    clientName: string,
    recipientId: string
  ): Promise<void> {
    // Idempotency guard. The order workflow re-fires "completed" on
    // retry / manual override, which previously sent a fresh review
    // request every time -- spammy at best, harassing at worst. Look
    // for an existing review_request notification on this order and
    // skip if one already landed (regardless of recipient, since the
    // intent of the message is one-per-order, not one-per-user).
    try {
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("notification_type", "review_request")
        .filter("metadata->>orderId", "eq", orderId)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return;
      }
    } catch (e) {
      console.warn("[sendReviewRequest] idempotency check failed (proceeding):", e);
    }

    const message = `Thank you for using our catering service! We'd love to hear your feedback about order #${orderId}. Please take a moment to rate your experience.`;

    await this.createNotification({
      recipient_id: recipientId,
      type: "review_request",
      title: "How was your experience?",
      message: message,
      priority: "normal",
      link: `/client-portal/feedback?orderId=${orderId}`,
      metadata: { orderId, clientEmail, clientName }
    });
  },

  // ==================== EMAIL TEMPLATE GENERATION ====================

  getEmailTemplate(type: string, data: Record<string, string>): string {
    const templates: Record<string, string> = {
      review: `
        Dear ${data.clientName},
        
        Thank you for choosing our catering service for your recent event!
        
        We hope everything went smoothly with order #${data.orderId}. Your feedback is incredibly valuable to us and helps us continue to improve our service.
        
        Please take a moment to share your experience:
        - How was the quality of the food?
        - Was the delivery timely and professional?
        - Did everything meet your expectations?
        
        Click here to leave your review: [Review Link]
        
        Thank you for your business!
        
        Best regards,
        The Catering Team
      `,
      feedback: `
        Dear ${data.clientName},
        
        We'd love to hear your thoughts about your recent catering experience with order #${data.orderId}.
        
        Your feedback helps us serve you better in the future.
        
        Best regards,
        The Catering Team
      `,
      delivery_update: `
        Dear ${data.clientName},
        
        Your order #${data.orderId} status has been updated: ${data.status}
        
        Track your delivery in real-time at: [Tracking Link]
        
        Thank you for choosing our service!
        
        Best regards,
        The Catering Team
      `,
    };

    return templates[type] || "";
  },

  // ==================== AUTOMATED EMAIL SEQUENCES ====================

  async triggerAutomatedEmailSequence(
    orderId: string,
    clientEmail: string,
    clientName: string,
    recipientId: string
  ): Promise<void> {
    // Schedule review request for 24 hours after delivery
    setTimeout(async () => {
      await this.sendReviewRequest(orderId, clientEmail, clientName, recipientId);
    }, 1000);

    console.log(`Automated email sequence triggered for order ${orderId}`);
  }
};