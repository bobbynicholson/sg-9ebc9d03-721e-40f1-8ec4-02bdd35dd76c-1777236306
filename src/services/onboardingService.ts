import { supabase } from "@/integrations/supabase/client";

interface OnboardingData {
  userId: string;
  companyName: string;
  email: string;
  fullName: string;
  currency: string;
}

export const onboardingService = {
  async initializeUserData(data: OnboardingData) {
    try {
      console.log("Starting user onboarding initialization...");

      await Promise.all([
        this.createWelcomeNotification(data),
        this.sendWelcomeEmail(data)
      ]);

      console.log("User onboarding completed successfully");
      return { success: true };
    } catch (error) {
      console.error("Error during onboarding:", error);
      return { success: false, error };
    }
  },

  async createWelcomeNotification(data: OnboardingData) {
    console.log("Welcome notification would be sent to:", data.email);
    return { success: true };
  },

  async sendWelcomeEmail(data: OnboardingData) {
    console.log("Sending welcome email to:", data.email);
    return { success: true };
  },

  async getOnboardingProgress(userId: string) {
    const [
      profileComplete,
      firstQuoteCreated
    ] = await Promise.all([
      this.checkProfileComplete(userId),
      this.checkFirstQuoteCreated(userId)
    ]);

    const steps = [
      { 
        id: "profile", 
        label: "Complete Company Profile", 
        completed: profileComplete,
        action: { label: "Complete Profile", href: "/admin/settings" }
      },
      { 
        id: "quote", 
        label: "Create First Quote", 
        completed: firstQuoteCreated,
        action: { label: "Create Quote", href: "/quotes/new" }
      }
    ];

    const completedCount = steps.filter(s => s.completed).length;
    const progress = Math.round((completedCount / steps.length) * 100);

    return { steps, progress };
  },

  async checkProfileComplete(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("company_name, phone")
      .eq("id", userId)
      .single();

    return !!(data?.company_name && data?.phone);
  },

  async checkFirstQuoteCreated(userId: string) {
    const { count } = await supabase
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .limit(1);

    return (count || 0) > 0;
  }
};
