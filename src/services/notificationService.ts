/* eslint-disable @typescript-eslint/no-explicit-any */
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
  // to the underlying record. Optional - omit and the row falls back
  // to the generic `link` button.
  related_entity_type?: string;
  related_entity_id?: string;
  // Wave 24: optional soft-dedup. When set, the service checks for
  // an existing notification with the same recipient_id +
  // notification_type + related_entity_id (when present) created
  // within the last `dedupWindowMinutes` (default 60) and skips the
  // insert if found. Use when the same trigger can legitimately fire
  // twice in quick succession (status flip flip-back, debounced UI
  // submission, cron re-tick). Omit and behaviour is unchanged.
  dedup?: boolean;
  dedupWindowMinutes?: number;
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
  /**
   * Wave 24: optional soft-dedup, mirrors createNotification's gate.
   * When true, the broadcaster checks for an existing notification of
   * the same type pointing at the same relatedEntityId within the
   * dedupWindowMinutes (default 60). When found, the whole broadcast
   * is skipped - existing recipients keep their original row instead
   * of getting a duplicate. Use when the same trigger can legitimately
   * fire twice (review approve flicker, status retick, double-submit).
   * Omit and behaviour is unchanged.
   */
  dedup?: boolean;
  dedupWindowMinutes?: number;
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
  companyId?: string | null;
  /** Throw on query failure instead of returning []. Lets callers
   *  (e.g. /admin/notifications) show a real error + Retry state
   *  rather than a silently empty inbox. */
  throwOnError?: boolean;
}

/**
 * Postgres enum values for `notifications.type`. When a broadcast's
 * type string matches one of these, we set both the text column
 * (`notification_type`) and the enum column (`type`) so reports that
 * group by `type` see the row. Anything not on this list leaves
 * `type` NULL - safer than failing the broadcast on an enum cast
 * error when a new type ships before its enum migration.
 */
/**
 * Phase 4/6 follow-up: per-user notification preferences are now
 * persisted on `email_notification_preferences.preferences` (jsonb).
 * The /admin/notification-settings UI shape lives there:
 *
 *   {
 *     email: { orderConfirmation, orderUpdates, paymentReceived, dailySummary },
 *     push:  { urgentAlerts, newOrders, staffUpdates, inventoryAlerts },
 *     sms:   { criticalAlerts, paymentReminders },
 *     whatsapp: { urgentAlerts, newOrders, staffUpdates, inventoryAlerts },
 *   }
 *
 * broadcastNotification fan-out reads each candidate recipient's
 * preferences and skips those whose `push.<category>` is explicitly
 * false. Missing rows = allow (default-on for legacy users).
 *
 * The mapping below is conservative: each notification_type maps to
 * AT MOST ONE category. Types without a matching category bypass the
 * filter (always sent). Priority=urgent OR urgent-class types route
 * through push.urgentAlerts regardless of their content category.
 *
 * Categories that don't apply to in-app (email-only, sms-only) are
 * out of scope here - broadcastNotification only produces in-app
 * notifications.
 */
type PushCategory = "urgentAlerts" | "newOrders" | "staffUpdates" | "inventoryAlerts";

function resolvePushCategory(
  notificationType: string,
  priority: string,
): PushCategory | null {
  // Priority gate: explicitly urgent always honours the urgent toggle.
  if (priority === "urgent") return "urgentAlerts";

  switch (notificationType) {
    // New orders + claimable jobs
    case "order_confirmed":
    case "new_job_available":
    case "order_ready":
    case "out_for_delivery":
    case "delivered":
      return "newOrders";

    // Staff lifecycle
    case "driver_assigned":
    case "driver_replacement_needed":
    case "kitchen_clock_in":
    case "kitchen_clock_out":
    case "amendment_requested":
    case "amendment_approved":
    case "amendment_partial_approved":
    case "amendment_rejected":
    case "cancellation_requested":
    case "cancellation_approved":
    case "cancellation_rejected":
    case "postponement_requested":
    case "postponement_approved":
    case "postponement_rejected":
      return "staffUpdates";

    // Inventory + shortages
    case "stock_low":
    case "equipment_shortage":
      return "inventoryAlerts";

    // Payments are surfaced via email category, not push. Don't filter
    // them here - default allow.
    default:
      return null;
  }
}

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
  // Added in 20260520080000_notification_type_enum_new_job_available.
  // Broadcast to drivers when a confirmed order is still unassigned
  // and so eligible for self-claim via /team-portal/driver/dashboard.
  "new_job_available",
  // XSC-A: payment_rejected is emitted by /api/payments/verify-claim
  // when a client EFT claim can't be matched against an invoice.
  // Pre-fix it was missing from both this Set and the DB enum, so
  // direct inserts kept the type column NULL and group-by reports
  // dropped the row.
  "payment_rejected",
]);

/** True when an insert error is the notifications.metadata column being absent
 *  on this deploy (PostgREST PGRST204 schema-cache miss, or Postgres 42703).
 *  Lets createNotification retry without metadata instead of dropping the
 *  notification entirely. */
function isMissingMetadataColumn(
  error: { code?: string | null; message?: string | null } | null,
): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  if (!msg.includes("metadata")) return false;
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    msg.includes("schema cache") ||
    msg.includes("does not exist")
  );
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

    if (filters?.companyId) {
      query = query.eq("company_id", filters.companyId);
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
      if (filters?.throwOnError) throw error;
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

  async markAllAsRead(userId: string, activeRole?: string, companyId?: string | null): Promise<boolean> {
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

    if (companyId) {
      query = query.eq("company_id", companyId);
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

    // Wave 24: optional soft-dedup. The same trigger can legitimately
    // fire twice in quick succession (status flip then flip-back,
    // debounced UI submission landing twice, cron retick crossing a
    // status update). Without this guard two identical rows land and
    // the recipient sees the same message twice. Opt-in via dedup=true
    // so existing callers behave unchanged.
    if (notification.dedup === true) {
      try {
        const windowMin = Math.max(1, notification.dedupWindowMinutes ?? 60);
        const sinceIso = new Date(Date.now() - windowMin * 60 * 1000).toISOString();
        let probe = sb
          .from("notifications")
          .select("id")
          .eq("recipient_id", notification.recipient_id)
          .eq("notification_type", resolvedType)
          .gte("created_at", sinceIso)
          .limit(1);
        if (notification.related_entity_id) {
          probe = probe.eq("related_entity_id", notification.related_entity_id);
        }
        const { data: existing, error: existingErr } = await probe.maybeSingle();
        if (existingErr) console.error("[notificationService/createNotification] dedup probe failed:", existingErr);
        if (existing) {
          // Match - skip the insert. Returning null mirrors the
          // "soft no-op" shape callers already handle for RLS rejects.
          return null;
        }
      } catch (dedupErr) {
        // Probe failure shouldn't block the legitimate insert. Worst
        // case the row is duplicated, which the recipient can dismiss.
        console.warn("[createNotification] dedup probe failed; inserting anyway:", dedupErr);
      }
    }
    const insertRow: Record<string, any> = {
      company_id: companyId,
      // recipient_id is what RLS + getNotifications filter reads on, so a
      // null here writes a row NOBODY can read. user_id is NOT NULL and is
      // the same auth uid, so default each from the other - the row is only
      // unreadable/invalid if BOTH are missing (then the NOT NULL user_id
      // insert fails loudly instead of silently creating an orphan).
      recipient_id: notification.recipient_id ?? notification.user_id,
      user_id: notification.user_id ?? notification.recipient_id,
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
    let { data, error } = await sb
      .from("notifications")
      .insert(insertRow as any)
      .select()
      .single();

    // Resilience: the `metadata` column isn't present on every deploy's
    // notifications table (it's added by migration; hand-applied DBs drift).
    // Without this, a missing column made EVERY notification insert fail
    // (PGRST204 "Could not find the 'metadata' column ... in the schema
    // cache"), silently breaking in-app notifications app-wide. Retry once
    // without metadata so notifications still get delivered; the payload in
    // metadata is supplementary (related_entity_id/type carry the key refs).
    if (error && isMissingMetadataColumn(error) && "metadata" in insertRow) {
      console.warn(
        "[createNotification] notifications.metadata column missing; " +
          "retrying without it (run the notifications metadata migration). detail:",
        error.message,
      );
      delete insertRow.metadata;
      ({ data, error } = await sb
        .from("notifications")
        .insert(insertRow as any)
        .select()
        .single());
    }

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
    activeRole?: string,
    companyId?: string | null,
  ) {
    // Unique suffix per subscription instance. Supabase reuses an
    // existing channel object when the name collides, so a remount
    // (route nav, StrictMode) would land on an already-subscribed
    // channel and throw "cannot add postgres_changes callbacks after
    // subscribe()" - which crashed the whole admin layout. A random
    // suffix guarantees a fresh channel every time.
    const channelKey = `notifications:${userId}:${activeRole || "all"}:${companyId || "all"}:${Math.random().toString(36).slice(2, 10)}`;
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
          if (companyId && notification.company_id !== companyId) return;
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

    // Notifications backbone follow-up: per-tenant type-level mute.
    // Tenants set companies.notification_settings.mutedTypes[] (jsonb)
    // to silence whole notification types - useful for types that
    // become noise after the tenant settles in (domain_verified,
    // subscription_renewed, etc). When the broadcast's type is in
    // the muted list, the whole fan-out is skipped (returns 0).
    // Missing column / null value / empty array = no mutes.
    //
    // Single-flight lookup per broadcast. Probe failure (column not
    // yet migrated, transient DB blip) opens the gate so a misconfig
    // can't silently drop legitimate alerts.
    try {
      const { data: companyRow } = await sb
        .from("companies")
        .select("notification_settings")
        .eq("id", params.companyId)
        .maybeSingle();
      const muted = (companyRow as any)?.notification_settings?.mutedTypes;
      if (Array.isArray(muted) && muted.includes(params.type)) {
        return 0;
      }
    } catch (muteErr) {
      console.warn("[broadcastNotification] tenant mute probe failed; sending:", muteErr);
    }

    // Wave 24: optional soft-dedup. Mirrors createNotification's gate
    // but at broadcast scope: if ANY notification of the same type
    // pointing at the same relatedEntityId exists for this company
    // within the dedup window, skip the whole broadcast. The same
    // amendment_requested event firing twice from the React Query
    // refetch + the manual review wouldn't otherwise be de-duped
    // before fanning out to every admin profile.
    if (params.dedup === true && params.relatedEntityId) {
      try {
        const windowMin = Math.max(1, params.dedupWindowMinutes ?? 60);
        const sinceIso = new Date(Date.now() - windowMin * 60 * 1000).toISOString();
        const { data: existing, error: existingErr } = await sb
          .from("notifications")
          .select("id")
          .eq("company_id", params.companyId)
          .eq("notification_type", params.type)
          .eq("related_entity_id", params.relatedEntityId)
          .gte("created_at", sinceIso)
          .limit(1)
          .maybeSingle();
        if (existingErr) console.error("[notificationService/broadcast] dedup lookup failed:", existingErr);
        if (existing) {
          // Match - skip the entire fan-out.
          return 0;
        }
      } catch (dedupErr) {
        // Probe failure shouldn't block legitimate broadcasts.
        console.warn("[broadcastNotification] dedup probe failed; inserting anyway:", dedupErr);
      }
    }

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

      const roleAndRegionFiltered = profiles
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
          // Profile has no region scoping data - preserve existing
          // behaviour (treat as cross-branch) so legacy users don't
          // silently miss notifications.
          return true;
        });

      // Phase 4/6 follow-up: per-user push category preferences. Resolve
      // the category once for this broadcast; then look up each
      // candidate's preferences.push.<category> and skip recipients
      // whose toggle is explicitly false. Missing rows = allow (so
      // legacy users who never visited /admin/notification-settings
      // keep getting everything).
      const pushCategory = resolvePushCategory(
        String(params.type || ""),
        String(params.priority || "normal"),
      );
      let recipientFilteredProfiles = roleAndRegionFiltered;
      if (pushCategory) {
        try {
          const candidateIds = roleAndRegionFiltered.map((p: any) => p.id);
          if (candidateIds.length > 0) {
            const { data: prefRows } = await sb
              .from("email_notification_preferences")
              .select("user_id, preferences")
              .in("user_id", candidateIds);
            // Map userId -> push.<category> bool, only when explicitly set.
            const disabledFor = new Set<string>();
            for (const row of (prefRows || []) as Array<any>) {
              const prefs = row?.preferences;
              const value = prefs?.push?.[pushCategory];
              if (value === false) disabledFor.add(row.user_id);
            }
            if (disabledFor.size > 0) {
              recipientFilteredProfiles = roleAndRegionFiltered.filter(
                (p: any) => !disabledFor.has(p.id),
              );
            }
          }
        } catch (prefErr) {
          // Probe failure should never block a broadcast - prefer
          // false-positive notifications over silent drop. Log once.
          console.warn("[broadcastNotification] preference lookup failed; sending unfiltered:", prefErr);
        }
      }

      const notifications = recipientFilteredProfiles
        .map((profile: any) => {
          const row: Record<string, any> = {
            company_id: params.companyId,
            recipient_id: profile.id,
            user_id: profile.id, // self-originated row - INSERT RLS allows it
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

      // WA-A (task #99, 2026-05-24): WhatsApp fan-out for the
      // same recipients. Enqueue rows into whatsapp_messages
      // when:
      //   - recipient profile has phone_number AND whatsapp_opt_in
      //   - their email pref shows whatsapp.<category> != false
      //     (default opt-in unless they explicitly toggled off)
      // The drain cron (/api/cron/whatsapp-drain) then sends.
      // No-op silently if WhatsApp isn't connected for the
      // tenant - the drain skips disconnected tenants.
      try {
        const recipientIds = recipientFilteredProfiles.map((p: { id: string }) => p.id);
        if (recipientIds.length === 0) return notifications.length;

        const { data: contactRows } = await sb
          .from("profiles")
          .select("id, phone_number, whatsapp_opt_in, full_name")
          .in("id", recipientIds);

        const phoneByUserId = new Map<string, { phone: string; name: string | null }>();
        for (const row of (contactRows || []) as Array<{ id: string; phone_number: string | null; whatsapp_opt_in: boolean | null; full_name: string | null }>) {
          if (!row.phone_number) continue;
          if (row.whatsapp_opt_in === false) continue;
          phoneByUserId.set(row.id, { phone: row.phone_number, name: row.full_name });
        }
        if (phoneByUserId.size === 0) return notifications.length;

        // Honour the same per-user pref bucket - if the user
        // explicitly turned WhatsApp off for this category, skip.
        if (pushCategory) {
          const { data: prefRows } = await sb
            .from("email_notification_preferences")
            .select("user_id, preferences")
            .in("user_id", Array.from(phoneByUserId.keys()));
          for (const row of (prefRows || []) as Array<{ user_id: string; preferences: { whatsapp?: Record<string, boolean> } | null }>) {
            const value = row.preferences?.whatsapp?.[pushCategory];
            if (value === false) phoneByUserId.delete(row.user_id);
          }
        }
        if (phoneByUserId.size === 0) return notifications.length;

        // Lazy import to keep notificationService free of a hard
        // dependency on the WhatsApp service module path. Avoids
        // circular service-module loads.
        const { whatsappIntegrationService } = await import("@/services/whatsappIntegrationService");
        const body = `${params.title}\n\n${params.message}`;
        const dedupBase = `${params.type}:${params.relatedEntityId || "_"}`;

        await Promise.all(
          Array.from(phoneByUserId.entries()).map(([userId, contact]) =>
            whatsappIntegrationService.enqueueWhatsAppMessage({
              companyId: params.companyId,
              recipientPhone: contact.phone,
              recipientName: contact.name,
              body,
              relatedEntityType: params.relatedEntityType ?? null,
              relatedEntityId: params.relatedEntityId ?? null,
              dedupKey: `${dedupBase}:${userId}`,
              enqueuedBy: null,
            }),
          ),
        );
      } catch (waErr) {
        // WhatsApp fan-out is best-effort. Don't let it dent the
        // in-app notification count or block the function. The
        // drain cron will retry anything that does land.
        console.warn("[broadcastNotification] WhatsApp fan-out failed:", waErr);
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
   * /api/cron/process-pending-reviews - this method just inserts a
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
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, company_id, client_id, client_email, client_name")
        .eq("id", orderId)
        .maybeSingle();
      if (orderErr) console.error("[notificationService/sendReviewRequest] orders lookup failed:", orderErr);

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
