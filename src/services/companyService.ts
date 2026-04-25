// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { User, Session } from "@supabase/supabase-js";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type CompanyInsert = Database["public"]["Tables"]["companies"]["Insert"];
type CompanyUpdate = Database["public"]["Tables"]["companies"]["Update"];

export interface CompanyWithOwner extends Company {
  owner_email?: string;
  owner_name?: string;
}

export const companyService = {
  /**
   * Create a new company (used during admin signup)
   */
  async createCompany(data: {
    name: string;
    owner_id: string;
    email?: string;
    phone?: string;
    currency?: string;
    timezone?: string;
    status?: string;
  }): Promise<{ success: boolean; company?: Company; error?: string }> {
    try {
      const companyData: CompanyInsert = {
        company_name: data.name,
        slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        owner_id: data.owner_id,
        email: data.email,
        phone: data.phone,
        currency: data.currency || "ZAR",
        timezone: data.timezone || "Africa/Johannesburg",
        subscription_status: "trial",
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        is_active: true,
        onboarding_completed: false,
      };

      const { data: company, error } = await supabase
        .from("companies")
        .insert(companyData)
        .select()
        .single();

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }
      
      if (!company) {
        return {
          success: false,
          error: "Failed to create company"
        };
      }

      // Send welcome email via API route
      if (data.email) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", data.owner_id)
            .single();

          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId: company.id,
              to: data.email,
              emailType: 'companyWelcome',
              variables: {
                companyName: data.name,
                ownerName: profile?.full_name || "there",
              }
            })
          });
          console.log("✅ Welcome email triggered for new company:", data.email);
        } catch (emailError) {
          console.error("⚠️ Failed to trigger welcome email (non-blocking):", emailError);
        }
      }

      return {
        success: true,
        company
      };
    } catch (error) {
      console.error("Error creating company:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  },

  /**
   * Get company by ID
   */
  async getCompanyById(id: string): Promise<Company | null> {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }

      return data;
    } catch (error) {
      console.error("Error fetching company by ID:", error);
      throw error;
    }
  },

  /**
   * Get user's company
   */
  async getUserCompany(userId: string): Promise<Company | null> {
    try {
      // First check if user owns a company
      const { data: ownedCompany, error: ownerError } = await supabase
        .from("companies")
        .select("*")
        .eq("owner_id", userId)
        .single();

      if (!ownerError && ownedCompany) {
        return ownedCompany;
      }

      // Otherwise check if user is part of a company via profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();

      if (profileError || !profile?.company_id) {
        return null;
      }

      return this.getCompanyById(profile.company_id);
    } catch (error) {
      console.error("Error fetching user company:", error);
      return null;
    }
  },

  /**
   * Update user's company association
   */
  async updateUserCompany(userId: string, companyId: string): Promise<void> {
    try {
      // Update the user's profile with company_id
      const { error } = await supabase
        .from("profiles")
        .update({
          company_id: companyId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating user company:", error);
      throw error;
    }
  },

  /**
   * Update company
   */
  async updateCompany(
    companyId: string,
    updates: CompanyUpdate
  ): Promise<Company> {
    try {
      const { data, error } = await supabase
        .from("companies")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", companyId)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("Failed to update company");

      return data;
    } catch (error) {
      console.error("Error updating company:", error);
      throw error;
    }
  },
  
  async createCompanyAndOwner(
    email: string,
    password: string,
    fullName: string,
    companyName: string,
    planId: string,
    trialDays: number
  ): Promise<{ user: User; company: Company; session: Session }> {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          is_owner: true,
        },
      },
    });

    if (signUpError) {
      console.error("Error signing up owner:", signUpError);
      throw signUpError;
    }

    if (!signUpData.user || !signUpData.session) {
      throw new Error("Could not create user or session.");
    }
    const user = signUpData.user;
    
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert([
        {
          owner_id: user.id,
          company_name: companyName,
          slug: companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          email: email,
          subscription_plan: planId,
          subscription_status: 'trialing',
          trial_ends_at: trialEndsAt.toISOString(),
        } as any,
      ])
      .select()
      .single();

    if (companyError) {
      console.error("Error creating company:", companyError);
      await supabase.auth.admin.deleteUser(user.id);
      throw companyError;
    }
    
    const { error: profileError } = await supabase
        .from('profiles')
        .update({ company_id: company.id, roles: ['admin', 'owner'] } as any)
        .eq('id', user.id);

    if (profileError) {
        console.error("Error updating profile with company_id:", profileError);
    }
    
    // Send welcome email via API route
    try {
      await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: company.id,
            to: email,
            emailType: 'companyWelcome',
            variables: {
              companyName: companyName,
              ownerName: fullName,
            }
          })
      });
    } catch(e) {
      console.error("Failed to trigger welcome email", e);
    }
    
    return { user, company, session: signUpData.session };
  },

  async deleteCompany(id: string): Promise<void> {
    // This is a very destructive action.
  },

  /**
   * Get all companies (for CateringMS admin portal)
   */
  async getAllCompanies(): Promise<CompanyWithOwner[]> {
    try {
      const { data: companies, error: companiesError } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false });

      if (companiesError) throw companiesError;

      const ownerIds = companies
        .map((c) => c.owner_id)
        .filter((id): id is string => id !== null);

      if (ownerIds.length === 0) return companies;

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", ownerIds);

      if (profilesError) throw profilesError;

      const companiesWithOwners: CompanyWithOwner[] = companies.map((company) => {
        const owner = profiles?.find((p) => p.id === company.owner_id);
        return {
          ...company,
          owner_email: owner?.email || undefined,
          owner_name: owner?.full_name || undefined,
        };
      });

      return companiesWithOwners;
    } catch (error) {
      console.error("Error fetching all companies:", error);
      throw error;
    }
  },

  /**
   * Get company staff members
   */
  async getCompanyStaff(companyId: string) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error("Error fetching company staff:", error);
      throw error;
    }
  },

  /**
   * Update company subscription status
   */
  async updateSubscriptionStatus(
    companyId: string,
    status: "trial" | "active" | "past_due" | "cancelled",
    plan?: string
  ): Promise<void> {
    try {
      const updates: CompanyUpdate = {
        subscription_status: status,
        updated_at: new Date().toISOString(),
      };

      if (plan) {
        updates.subscription_plan = plan;
      }

      const { error } = await supabase
        .from("companies")
        .update(updates)
        .eq("id", companyId);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating subscription status:", error);
      throw error;
    }
  },

  /**
   * Complete company onboarding
   */
  async completeOnboarding(companyId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", companyId);

      if (error) throw error;
    } catch (error) {
      console.error("Error completing onboarding:", error);
      throw error;
    }
  },

  /**
   * Deactivate company
   */
  async deactivateCompany(companyId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", companyId);

      if (error) throw error;
    } catch (error) {
      console.error("Error deactivating company:", error);
      throw error;
    }
  },
};