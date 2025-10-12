
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
type SubscriptionInsert = Database["public"]["Tables"]["subscriptions"]["Insert"];

export const subscriptionService = {
  async getSubscription(userId: string): Promise<Subscription | null> {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (error) {
      console.error("Error fetching subscription:", error);
      return null;
    }

    return data;
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

  async updateSubscription(subscriptionId: string, updates: Partial<Subscription>): Promise<Subscription | null> {
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

  async cancelSubscription(subscriptionId: string, immediate: boolean = false): Promise<Subscription | null> {
    const updates: Partial<Subscription> = {
      cancel_at_period_end: !immediate,
      updated_at: new Date().toISOString()
    };

    if (immediate) {
      updates.status = "cancelled";
      updates.cancelled_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("subscriptions")
      .update(updates)
      .eq("id", subscriptionId)
      .select()
      .single();

    if (error) {
      console.error("Error cancelling subscription:", error);
      throw error;
    }

    return data;
  },

  async checkTrialStatus(userId: string): Promise<{
    isInTrial: boolean;
    daysRemaining: number;
    trialEndsAt: string | null;
  }> {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("trial_ends_at, subscription_status")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      return { isInTrial: false, daysRemaining: 0, trialEndsAt: null };
    }

    if (profile.subscription_status !== "trial" || !profile.trial_ends_at) {
      return { isInTrial: false, daysRemaining: 0, trialEndsAt: profile.trial_ends_at };
    }

    const now = new Date();
    const trialEnd = new Date(profile.trial_ends_at);
    const daysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      isInTrial: daysRemaining > 0,
      daysRemaining,
      trialEndsAt: profile.trial_ends_at
    };
  },

  getPricingPlans() {
    return [
      {
        id: "starter",
        name: "Starter",
        price: 499,
        currency: "ZAR",
        billingCycle: "monthly",
        features: [
          "Up to 20 events per month",
          "Basic inventory management",
          "Email templates",
          "Client portal access",
          "Mobile driver app",
          "GPS tracking",
          "Basic reporting"
        ],
        limits: {
          events: 20,
          users: 5,
          regions: 1
        }
      },
      {
        id: "professional",
        name: "Professional",
        price: 999,
        currency: "ZAR",
        billingCycle: "monthly",
        popular: true,
        features: [
          "Up to 50 events per month",
          "Advanced inventory with alerts",
          "Email automation",
          "After-sales campaigns",
          "Multi-region support",
          "Driver earnings tracking",
          "Receipt scanning",
          "Advanced analytics",
          "Priority support"
        ],
        limits: {
          events: 50,
          users: 15,
          regions: 3
        }
      },
      {
        id: "enterprise",
        name: "Enterprise",
        price: 1999,
        currency: "ZAR",
        billingCycle: "monthly",
        features: [
          "Unlimited events",
          "Unlimited users",
          "Unlimited regions",
          "White-label option",
          "Custom integrations",
          "Dedicated account manager",
          "Custom workflows",
          "API access",
          "24/7 support"
        ],
        limits: {
          events: null,
          users: null,
          regions: null
        }
      }
    ];
  }
};
