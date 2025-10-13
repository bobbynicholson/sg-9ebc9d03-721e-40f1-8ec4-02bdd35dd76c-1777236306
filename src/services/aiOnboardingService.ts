import { supabase } from "@/integrations/supabase/client";

export interface OnboardingChecklistItem {
  id: string;
  label: string;
  description: string;
  isCompleted: boolean;
  category: "initial_setup" | "customization" | "team" | "first_order";
  estimatedTime: number; // in minutes
  actionUrl: string;
}

class AiOnboardingService {
  /**
   * Generate a personalized onboarding checklist using an AI model.
   * This is a mock implementation. In a real scenario, this would call an external AI service.
   */
  async generateOnboardingChecklist(userId: string): Promise<OnboardingChecklistItem[]> {
    // In a real implementation, you would get user details to personalize the checklist
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("company_name, role")
      .eq("id", userId)
      .single();

    // Mock AI response based on user role or company type
    const baseChecklist: Omit<OnboardingChecklistItem, "id" | "isCompleted">[] = [
      {
        label: "Complete Company Profile",
        description: "Fill in your company details to personalize invoices and quotes.",
        category: "initial_setup",
        estimatedTime: 5,
        actionUrl: "/admin/settings",
      },
      {
        label: "Set Up Branding",
        description: "Upload your logo and choose brand colors for a white-labeled client experience.",
        category: "customization",
        estimatedTime: 10,
        actionUrl: "/admin/white-label",
      },
      {
        label: "Invite Your Team",
        description: "Add your kitchen staff, drivers, and admin users to the platform.",
        category: "team",
        estimatedTime: 15,
        actionUrl: "/admin/users",
      },
      {
        label: "Create Your First Quote",
        description: "Learn how to build and send a professional quote to a client.",
        category: "first_order",
        estimatedTime: 10,
        actionUrl: "/quotes/new",
      },
      {
        label: "Configure Payment Gateways",
        description: "Connect your payment provider to accept online payments for deposits and balances.",
        category: "initial_setup",
        estimatedTime: 20,
        actionUrl: "/admin/payment-gateways",
      },
      {
        label: "Customize Email Templates",
        description: "Personalize the automated emails sent to your clients.",
        category: "customization",
        estimatedTime: 15,
        actionUrl: "/admin/email-templates",
      },
    ];

    const checklist = baseChecklist.map((item, index) => ({
      ...item,
      id: `task-${index + 1}`,
      isCompleted: false,
    }));
    
    // Store this checklist against the user's profile or in a dedicated onboarding table
    await supabase.from("onboarding_state").upsert({
      user_id: userId,
      checklist: checklist as any,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });


    return checklist;
  }

  async getOnboardingState(userId: string): Promise<OnboardingChecklistItem[]> {
    const { data, error } = await supabase
      .from("onboarding_state")
      .select("checklist")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      // If no state, generate a new one
      return this.generateOnboardingChecklist(userId);
    }
    
    return data.checklist as unknown as OnboardingChecklistItem[];
  }

  async updateChecklistItem(userId: string, taskId: string, isCompleted: boolean): Promise<OnboardingChecklistItem[] | null> {
    const currentChecklist = await this.getOnboardingState(userId);
    
    const updatedChecklist = currentChecklist.map(item => 
      item.id === taskId ? { ...item, isCompleted } : item
    );

    const { error } = await supabase
      .from("onboarding_state")
      .update({ checklist: updatedChecklist as any })
      .eq("user_id", userId);

    if (error) {
      console.error("Error updating checklist item:", error);
      return null;
    }

    return updatedChecklist;
  }
}

export const aiOnboardingService = new AiOnboardingService();
