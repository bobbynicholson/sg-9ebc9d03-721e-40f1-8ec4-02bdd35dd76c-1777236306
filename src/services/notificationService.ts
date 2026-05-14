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
  // Source-record pointer so the client / admin notification UIs can
  // render contextual CTAs ("Open order", "View quote") that deep-link
  // to the underlying record. Optional -- omit and the row falls back
  // to the generic `link` button.
  related_entity_type?: string;
  related_entity_id?: string;
}

interface BroadcastNotificationParams {
  /**
   * The tenant whose profiles receive the broadcast. Used to filter
   * profiles by company_id and stamped onto each notification row.
   * (Previously misnamed `userId` because the call site used the
   * caller's user_id as a company_id, which compiled but lied.)
   */
  companyId: string;
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
  /**
   * Optional source-record pointer. Stamped onto notifications.related_entity_*
   * so the bell / notifications page can render a contextual "Edit X" /
   * "Review request" CTA that jumps straight to the underlying record.
   * Skip these and the row falls back to the generic `link` button only.
   */
  relatedEntityType?: string;
  relatedEntityId?: string;
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

/**
 * Postgres enum values for `notifications.type`. When a broadcast's
 * type string matches one of these, we set both the text column
 * (`notification_type`) and the enum column (`type`) so reports that
 * group by `type` see the row. Anything not on this list leaves
 * `type` NULL -- safer than failing the broadcast on an enum cast
 * error when a new type ships before its enum migration.
 */
const NOTIFICATION_TYPE_ENUM_VALUES = new Set<string>([
  "order_confirmed", "order_ready", "driver_assigned", "out_for_delivery",
  "delivered", "payment_received", "payment_reminder",
  "driver_replacement_needed", "equipment_shortage", "stock_low",
  "quote_expiring", "trial_expiring", "subscription_renewed",
  "payment_claimed",
  // Added in 20260505160000_notification_type_enum_amendments.
  "amendment_requested", "cancellation_requested", "postponement_requested",
  // Added in 20260505170000_notification_type_enum_review_outcomes.
  "amendment_approved", "amendment_partial_approved", "amendment_rejected",
  "cancellation_approved", "cancellation_rejected",
  "postponement_approved", "postponement_rejected",
  // Added in 20260506170000_notification_type_enum_domain_verified.
  "domain_verified",
  // Added in 20260514170000_notification_type_enum_quote_rejected.
  "quote_rejected",
]);

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

  /**
   * Insert a notification row.
   *
   * Accepts an optional `client` so server-side callers can pass a
   * service-role client. Without this, the function used the global
   * browser anon supabase, which fails silently from a Node API
   * route (no authenticated session => RLS blocks the insert).
   *
   * Browser callers omit the client and get the existing behaviour.
   * Server callers (post-order cascade, webhook handlers, RPC-after
   * hooks) pass the service-role instance and the in-app push lands
   * regardless of session state.
   */
  async createNotification(
    notification: CreateNotificationParams,
    client?: any,
  ): Promise<Notification | null> {
    const sb = client || supabase;

    // Backfill company_id from the recipient's profile when the caller
    // didn't supply it. The notifications INSERT RLS policy requires
    // company_id to match the caller's tenant (or the row to be
    // self-targeted), so leaving company_id null on cross-user inserts
    // would silently get rejected. Recipient is always in the same
    // tenant as the broadcaster in normal flows, so deriving from
    // recipient is safe and doesn't depend on auth context.
    let companyId = notification.company_id || null;
    if (!companyId && notification.recipient_id) {
      try {
        const { data: profile } = await sb
          .from("profiles")
          .select("company_id")
          .eq("id", notification.recipient_id)
          .maybeSingle();
        companyId = (profile as { company_id?: string } | null)?.company_id ?? null;
      } catch (e) {
        // Best-effort backfill; if it fails the row may still insert
        // for self-targeted notifications.
        console.warn("[createNotification] failed to derive company_id from recipient:", e);
      }
    }

    const resolvedType = notification.type || notification.notification_type || "system_alert";
    const insertRow: Record<string, any> = {
      company_id: companyId,
      recipient_id: notification.recipient_id,
      user_id: notification.user_id,
      notification_type: resolvedType,
      title: notification.title,
      message: notification.message,
      link: notification.link || null,
      priority: notification.priority || "normal",
      target_role: notification.target_role || null,
      metadata: (notification.metadata || {}) as unknown as never,
    };
    // Mirror to the enum column when the value is recognised. Reports
    // that group by `type` rely on this; rows whose type is off-enum
    // still insert (text column unchanged).
    if (NOTIFICATION_TYPE_ENUM_VALUES.has(resolvedType)) {
      insertRow.type = resolvedType;
    }
    if (notification.related_entity_type) {
      insertRow.related_entity_type = notification.related_entity_type;
    }
    if (notification.related_entity_id) {
      insertRow.related_entity_id = notification.related_entity_id;
    }
    const { data, error } = await sb
      .from("notifications")
      .insert(insertRow as any)
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
    // Unique suffix per subscription instance. Supabase reuses an
    // existing channel object when the name collides, so a remount
    // (route nav, StrictMode) would land on an already-subscribed
    // channel and throw "cannot add postgres_changes callbacks after
    // subscribe()" -- which crashed the whole admin layout. A random
    // suffix guarantees a fresh channel every time.
    const channelKey = `notifications:${userId}:${activeRole || "all"}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelKey)
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

  /**
   * Fan a notification out to every profile in a company that matches
   * the role + region filters.
   *
   * Same client-injection pattern as createNotification: server-side
   * callers pass the service-role client so the broadcast lands even
   * without an authenticated session.
   */
  async broadcastNotification(
    params: BroadcastNotificationParams,
    client?: any,
  ): Promise<number> {
    const sb = client || supabase;
    try {
      const { data: profiles, error: profileError } = await sb
        .from("profiles")
        .select("id, role, region_id, regions_covered")
        .eq("company_id", params.companyId);

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
        .map(profile => {
          const row: Record<string, any> = {
            company_id: params.companyId,
            recipient_id: profile.id,
            user_id: profile.id, // self-originated row -- INSERT RLS allows it
            notification_type: params.type,
            title: params.title,
            message: params.message,
            link: params.link || null,
            priority: params.priority || "normal",
            target_role: profile.role as UserRole,
            is_read: false,
          };
          // Populate the enum column when the type matches a known
          // value. Reports that group by `type` need this.
          if (NOTIFICATION_TYPE_ENUM_VALUES.has(params.type)) {
            row.type = params.type;
          }
          // Source-record pointer for contextual CTAs in the bell /
          // notifications page.
          if (params.relatedEntityType) row.related_entity_type = params.relatedEntityType;
          if (params.relatedEntityId) row.related_entity_id = params.relatedEntityId;
          return row;
        });

      if (notifications.length === 0) {
        return 0;
      }

      const { error: insertError } = await sb
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

  /**
   * Queue the 24h post-delivery review prompt on pending_reviews.
   *
   * Previously this method created the in-app notification immediately
   * and triggerAutomatedEmailSequence wrapped it in a setTimeout(24h).
   * Vercel serverless functions don't survive 24 hours, so the timer
   * never fired and the prompt was never sent.
   *
   * The actual send now happens via the cron worker at
   * /api/cron/process-pending-reviews -- this method just inserts a
   * pending_reviews row that the worker picks up once due_at passes.
   *
   * Idempotent on order_id via a unique index, so safe to call on
   * retry / manual override.
   */
  async sendReviewRequest(
    orderId: string,
    clientEmail: string,
    clientName: string,
    recipientId: string
  ): Promise<void> {
    try {
      // Resolve company_id + delivered_at off the order so the cron
      // worker has everything it needs without a re-resolve.
      const { data: order } = await supabase
        .from("orders")
        .select("id, company_id, client_id, client_email, client_name")
        .eq("id", orderId)
        .maybeSingle();

      if (!order || !(order as any).company_id) {
        console.warn("[sendReviewRequest] order not found or missing company_id, skipping queue");
        return;
      }

      const deliveredAt = new Date();
      const dueAt = new Date(deliveredAt.getTime() + 24 * 60 * 60 * 1000);

      await (supabase as any)
        .from("pending_reviews")
        .upsert(
          {
            company_id: (order as any).company_id,
            order_id: orderId,
            client_id: (order as any).client_id || null,
            client_user_id: recipientId || null,
            client_email: clientEmail || (order as any).client_email || null,
            client_name: clientName || (order as any).client_name || null,
            delivered_at: deliveredAt.toISOString(),
            due_at: dueAt.toISOString(),
          },
          { onConflict: "order_id", ignoreDuplicates: true },
        );
    } catch (e) {
      console.warn("[sendReviewRequest] queue insert failed:", e);
    }
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
    // Queue the review request on pending_reviews. The cron worker at
    // /api/cron/process-pending-reviews drains it once due_at passes.
    // Replaces the old setTimeout(24h) which never fired on Vercel.
    await this.sendReviewRequest(orderId, clientEmail, clientName, recipientId);
    console.log(`Automated email sequence queued for order ${orderId}`);
  }
};