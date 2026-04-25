import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
type SubscriptionInsert = Database["public"]["Tables"]["subscriptions"]["Insert"];
type SubscriptionUpdate = Database["public"]["Tables"]["subscriptions"]["Update"];
type BillingHistory = Database["public"]["Tables"]["billing_history"]["Row"];
type CancellationRequest = Database["public"]["Tables"]["cancellation_requests"]["Row"];
type AccountDeletionRequest = Database["public"]["Tables"]["account_deletion_requests"]["Row"];

export const subscriptionService = {
  // ==================== SUBSCRIPTION MANAGEMENT ====================
  
  async getSubscription(userId: string): Promise<Subscription | null> {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["trial", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching subscription:", error);
      return null;
    }

    return data;
  },

  async getAllSubscriptions(): Promise<(Subscription & { profiles: { full_name: string | null, email: string | null } | null })[]> {
    const { data, error } = await supabase
      .from("subscriptions")
      .select(`
        *,
        profiles (
          full_name,
          email
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching all subscriptions:", error);
      return [];
    }

    return data as any;
  },

  async createSubscription(subscription: SubscriptionInsert): Promise<Subscription | null> {
    const { data, error } = await supabase
      .from("subscriptions")
      .insert([subscription])
      .select()
      .single();

    if (error) {
      console.error("Error creating subscription:", error);
      throw error;
    }

    return data;
  },

  async updateSubscription(subscriptionId: string, updates: SubscriptionUpdate): Promise<Subscription | null> {
    const { data, error } = await supabase
      .from("subscriptions")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", subscriptionId)
      .select()
      .single();

    if (error) {
      console.error("Error updating subscription:", error);
      throw error;
    }

    return data;
  },

  async upgradePlan(subscriptionId: string, newPlanId: string, newAmount: number): Promise<Subscription | null> {
    const now = new Date();
    const updates: SubscriptionUpdate = {
      plan_id: newPlanId,
      plan_name: this.getPlanName(newPlanId),
      amount: newAmount,
      updated_at: now.toISOString()
    };

    return this.updateSubscription(subscriptionId, updates);
  },

  async downgradePlan(subscriptionId: string, newPlanId: string, newAmount: number): Promise<Subscription | null> {
    const now = new Date();
    const subscription = await supabase
      .from("subscriptions")
      .select("current_period_end")
      .eq("id", subscriptionId)
      .single();

    if (!subscription.data) {
      throw new Error("Subscription not found");
    }

    const updates: SubscriptionUpdate = {
      plan_id: newPlanId,
      plan_name: this.getPlanName(newPlanId),
      pending_price_change: true,
      new_amount: newAmount,
      price_change_effective_date: subscription.data.current_period_end,
      updated_at: now.toISOString()
    };

    return this.updateSubscription(subscriptionId, updates);
  },

  // ==================== CANCELLATION MANAGEMENT ====================

  async requestCancellation(
    subscriptionId: string, 
    userId: string, 
    immediate: boolean,
    reason?: string,
    feedback?: string
  ): Promise<CancellationRequest | null> {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("id", subscriptionId)
      .single();

    const { data, error } = await supabase
      .from("cancellation_requests")
      .insert([{
        subscription_id: subscriptionId,
        user_id: userId,
        cancellation_type: immediate ? "immediate" : "end_of_period",
        reason: reason || null,
        feedback: feedback || null,
        status: "pending"
      }])
      .select()
      .single();

    if (error) {
      console.error("Error creating cancellation request:", error);
      throw error;
    }

    const updates: SubscriptionUpdate = {
      cancel_at_period_end: !immediate,
      cancelled_at: immediate ? new Date().toISOString() : null,
      status: immediate ? "cancelled" : (subscription?.status || "active"),
      cancellation_reason: reason || null,
      cancellation_feedback: feedback || null
    };

    await this.updateSubscription(subscriptionId, updates);

    return data;
  },

  async reactivateSubscription(subscriptionId: string): Promise<Subscription | null> {
    const updates: SubscriptionUpdate = {
      cancel_at_period_end: false,
      status: "active",
      cancelled_at: null,
      cancellation_reason: null,
      updated_at: new Date().toISOString()
    };

    return this.updateSubscription(subscriptionId, updates);
  },

  async getCancellationRequests(userId: string): Promise<CancellationRequest[]> {
    const { data, error } = await supabase
      .from("cancellation_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching cancellation requests:", error);
      return [];
    }

    return data || [];
  },

  // ==================== BILLING HISTORY ====================

  async getBillingHistory(userId: string): Promise<BillingHistory[]> {
    const { data, error } = await supabase
      .from("billing_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching billing history:", error);
      return [];
    }

    return data || [];
  },

  async createBillingRecord(record: Database["public"]["Tables"]["billing_history"]["Insert"]): Promise<BillingHistory | null> {
    const { data, error } = await supabase
      .from("billing_history")
      .insert([record])
      .select()
      .single();

    if (error) {
      console.error("Error creating billing record:", error);
      throw error;
    }

    return data;
  },

  // ==================== ACCOUNT DELETION ====================

  async requestAccountDeletion(
    userId: string, 
    reason?: string, 
    exportData: boolean = false
  ): Promise<AccountDeletionRequest | null> {
    const scheduledDeletion = new Date();
    scheduledDeletion.setDate(scheduledDeletion.getDate() + 30);

    const { data, error } = await supabase
      .from("account_deletion_requests")
      .insert([{
        user_id: userId,
        reason: reason || null,
        data_export_requested: exportData,
        status: "pending",
        scheduled_deletion_date: scheduledDeletion.toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error("Error creating account deletion request:", error);
      throw error;
    }

    return data;
  },

  async cancelAccountDeletion(requestId: string): Promise<boolean> {
    const { error } = await supabase
      .from("account_deletion_requests")
      .update({ status: "cancelled" })
      .eq("id", requestId);

    if (error) {
      console.error("Error cancelling account deletion:", error);
      return false;
    }

    return true;
  },

  async getAccountDeletionRequest(userId: string): Promise<AccountDeletionRequest | null> {
    const { data, error } = await supabase
      .from("account_deletion_requests")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching account deletion request:", error);
      return null;
    }

    return data;
  },

  // ==================== TRIAL MANAGEMENT ====================

  async checkTrialStatus(userId: string): Promise<{
    isInTrial: boolean;
    daysRemaining: number;
    trialEndsAt: string | null;
    hasUnreadNotifications: boolean;
  }> {
    const subscription = await this.getSubscription(userId);

    if (!subscription || subscription.status !== "trial" || !subscription.trial_ends_at) {
      return { 
        isInTrial: false, 
        daysRemaining: 0, 
        trialEndsAt: null,
        hasUnreadNotifications: false 
      };
    }

    const now = new Date();
    const trialEnd = new Date(subscription.trial_ends_at);
    const daysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    // Check for unread trial notifications
    const { data: user } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user?.user?.id || "")
      .single();

    let hasUnreadNotifications = false;
    if (profile?.company_id) {
      const { data: notifications } = await supabase
        .from("trial_expiry_notifications")
        .select("id")
        .eq("company_id", profile.company_id)
        .eq("dashboard_seen", false)
        .limit(1)
        .maybeSingle();

      hasUnreadNotifications = !!notifications;
    }

    return {
      isInTrial: daysRemaining > 0,
      daysRemaining,
      trialEndsAt: subscription.trial_ends_at,
      hasUnreadNotifications
    };
  },

  async getTrialExpiryNotifications(companyId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("trial_expiry_notifications")
      .select("*")
      .eq("company_id", companyId)
      .order("sent_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Error fetching trial notifications:", error);
      return [];
    }

    return data || [];
  },

  async markTrialNotificationSeen(notificationId: string): Promise<boolean> {
    const { error } = await supabase
      .from("trial_expiry_notifications")
      .update({
        dashboard_seen: true,
        dashboard_seen_at: new Date().toISOString()
      })
      .eq("id", notificationId);

    if (error) {
      console.error("Error marking notification as seen:", error);
      return false;
    }

    return true;
  },

  async triggerTrialExpiryCheck(): Promise<{ success: boolean; message: string }> {
    try {
      const { error } = await supabase.rpc("check_trial_expiry_notifications");

      if (error) {
        console.error("Error triggering trial expiry check:", error);
        return {
          success: false,
          message: `Failed to check trial expirations: ${error.message}`
        };
      }

      return {
        success: true,
        message: "Trial expiry notifications checked successfully"
      };
    } catch (err) {
      console.error("Error in triggerTrialExpiryCheck:", err);
      return {
        success: false,
        message: "An unexpected error occurred while checking trial expirations"
      };
    }
  },

  async getCompanyTrialStatus(companyId: string): Promise<{
    isInTrial: boolean;
    daysRemaining: number;
    trialEndsAt: string | null;
    subscriptionStatus: string;
    notificationsSent: number;
    lastNotificationType: string | null;
  }> {
    // Get company info
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("trial_ends_at, subscription_status")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return {
        isInTrial: false,
        daysRemaining: 0,
        trialEndsAt: null,
        subscriptionStatus: "unknown",
        notificationsSent: 0,
        lastNotificationType: null
      };
    }

    const now = new Date();
    const trialEnd = company.trial_ends_at ? new Date(company.trial_ends_at) : null;
    const daysRemaining = trialEnd 
      ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    // Get notification stats
    const { data: notifications } = await supabase
      .from("trial_expiry_notifications")
      .select("notification_type")
      .eq("company_id", companyId)
      .order("sent_at", { ascending: false });

    return {
      isInTrial: company.subscription_status === "trial" && daysRemaining > 0,
      daysRemaining,
      trialEndsAt: company.trial_ends_at,
      subscriptionStatus: company.subscription_status || "unknown",
      notificationsSent: notifications?.length || 0,
      lastNotificationType: notifications?.[0]?.notification_type || null
    };
  },

  // ==================== USAGE TRACKING ====================

  async updateUsageMetrics(subscriptionId: string, activeClients: number, ordersThisQuarter: number): Promise<void> {
    await supabase
      .from("subscriptions")
      .update({
        active_clients_count: activeClients,
        orders_this_quarter: ordersThisQuarter,
        updated_at: new Date().toISOString()
      })
      .eq("id", subscriptionId);
  },

  async checkUsageLimits(subscription: Subscription): Promise<{
    withinLimits: boolean;
    activeClientsLimit: number;
    ordersLimit: number;
    currentActiveClients: number;
    currentOrders: number;
    limitReachedType?: "clients" | "orders";
  }> {
    const planLimits = this.getPlanLimits(subscription.plan_id || 'starter');
    
    const currentActiveClients = subscription.active_clients_count || 0;
    const currentOrders = subscription.orders_this_quarter || 0;

    const activeClientsWithinLimit = currentActiveClients <= planLimits.activeClients;
    const ordersWithinLimit = currentOrders <= planLimits.ordersPerQuarter;
    
    const withinLimits = activeClientsWithinLimit && ordersWithinLimit;
    
    let limitReachedType: "clients" | "orders" | undefined;
    if (!activeClientsWithinLimit) limitReachedType = "clients";
    if (!ordersWithinLimit) limitReachedType = "orders";

    return {
      withinLimits,
      activeClientsLimit: planLimits.activeClients,
      ordersLimit: planLimits.ordersPerQuarter,
      currentActiveClients: currentActiveClients,
      currentOrders: currentOrders,
      limitReachedType
    };
  },

  // ==================== PRICE CHANGE MANAGEMENT ====================

  async getPendingPriceChanges(userId: string): Promise<Subscription | null> {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("pending_price_change", true)
      .maybeSingle();

    if (error) {
      console.error("Error fetching pending price changes:", error);
      return null;
    }

    return data;
  },

  async acceptPriceChange(subscriptionId: string): Promise<boolean> {
    const { error } = await supabase
      .rpc('accept_price_change', {
        p_subscription_id: subscriptionId
      });
      
    if (error) {
      console.error("Error accepting price change:", error);
    }
    return !error;
  },

  // ==================== PRICING PLANS ====================

  getPricingPlans() {
    return [
      {
        id: "starter",
        name: "Starter",
        monthlyPriceZAR: 399,
        annualPriceZAR: 3990,
        features: [
          "Up to 50 active clients OR 150 orders/quarter",
          "Unlimited client database storage",
          "Lead & quote management",
          "Order processing & calendar",
          "Basic inventory tracking",
          "Email automation (quotes & follow-ups)",
          "Driver management & GPS tracking",
          "Client portal",
          "Kitchen & shopping lists",
          "Email support"
        ],
        limits: {
          activeClients: 50,
          ordersPerQuarter: 150,
          users: 5,
          regions: 1
        }
      },
      {
        id: "professional",
        name: "Professional",
        monthlyPriceZAR: 699,
        annualPriceZAR: 6990,
        popular: true,
        features: [
          "Up to 200 active clients OR 600 orders/quarter",
          "Everything in Starter, plus:",
          "Multi-region support",
          "Advanced inventory with expiry alerts",
          "Receipt scanning & price tracking",
          "Equipment shortage management",
          "After-sales email automation (6 campaigns)",
          "Priority email support",
          "Custom branding (logo & colors)",
          "Advanced analytics dashboard"
        ],
        limits: {
          activeClients: 200,
          ordersPerQuarter: 600,
          users: 15,
          regions: 5
        }
      },
      {
        id: "enterprise",
        name: "Enterprise",
        monthlyPriceZAR: null,
        annualPriceZAR: null,
        features: [
          "Unlimited active clients & orders",
          "Everything in Professional, plus:",
          "White-label branding (remove CateringMS)",
          "Dedicated account manager",
          "Priority phone & email support",
          "Custom integrations",
          "API access",
          "Custom training sessions",
          "SLA guarantee"
        ],
        limits: {
          activeClients: 999999,
          ordersPerQuarter: 999999,
          users: 999999,
          regions: 999999
        }
      }
    ];
  },

  getPlanLimits(planId: string) {
    const plans = this.getPricingPlans();
    const plan = plans.find(p => p.id === planId);
    return plan?.limits || { activeClients: 50, ordersPerQuarter: 150, users: 5, regions: 1 };
  },

  getPlanName(planId: string): string {
    const plans = this.getPricingPlans();
    const plan = plans.find(p => p.id === planId);
    return plan?.name || "Unknown Plan";
  },

  // ==================== UTILITY FUNCTIONS ====================

  calculateNextBillingDate(currentDate: Date, billingCycle: "monthly" | "annual"): Date {
    const nextDate = new Date(currentDate);
    if (billingCycle === "monthly") {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    }
    return nextDate;
  },

  calculateProration(
    currentAmount: number,
    newAmount: number,
    daysRemaining: number,
    totalDaysInPeriod: number
  ): number {
    const dailyCurrentRate = currentAmount / totalDaysInPeriod;
    const dailyNewRate = newAmount / totalDaysInPeriod;
    const currentPeriodCost = dailyCurrentRate * daysRemaining;
    const newPeriodCost = dailyNewRate * daysRemaining;
    return newPeriodCost - currentPeriodCost;
  },

  getCurrentQuarter(): { start: Date; end: Date; quarter: number } {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    
    let quarter: number;
    let startMonth: number;
    
    if (month < 3) {
      quarter = 1;
      startMonth = 0;
    } else if (month < 6) {
      quarter = 2;
      startMonth = 3;
    } else if (month < 9) {
      quarter = 3;
      startMonth = 6;
    } else {
      quarter = 4;
      startMonth = 9;
    }
    
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    
    return { start, end, quarter };
  }
};
