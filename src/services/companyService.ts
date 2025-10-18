import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { emailAutomationService } from "./emailAutomationService";
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
    slug: string;
    owner_id: string;
    email?: string;
    phone?: string;
    currency?: string;
    timezone?: string;
    status?: string;
  }): Promise<{ success: boolean; company?: Company; error?: string }> {
    try {
      // CRITICAL: Validate slug availability before creating company
      const slugAvailable = await this.isSlugAvailable(data.slug);
      if (!slugAvailable) {
        return {
          success: false,
          error: `The company slug "${data.slug}" is already taken. Please choose a different company name.`
        };
      }

      const companyData: CompanyInsert = {
        company_name: data.name,
        slug: data.slug,
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
        // Handle unique constraint violation specifically
        if (error.code === "23505" && error.message.includes("slug")) {
          return {
            success: false,
            error: `The company slug "${data.slug}" is already taken. Please choose a different company name.`
          };
        }
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

      // ✅ FIX BUG #18: Send welcome email to company admin
      if (data.email) {
        try {
          // Get admin name from profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", data.owner_id)
            .single();

          await emailAutomationService.sendCompanyWelcomeEmail(
            data.email,
            data.name,
            company.id, // Pass companyId
            data.slug,
            profile?.full_name || "there"
          );
          console.log("✅ Welcome email sent to new company:", data.email);
        } catch (emailError) {
          // Log but don't block signup if email fails
          console.error("⚠️ Failed to send welcome email (non-blocking):", emailError);
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
   * Get company by slug
   */
  async getCompanyBySlug(slug: string): Promise<Company | null> {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw error;
      }

      return data;
    } catch (error) {
      console.error("Error fetching company by slug:", error);
      throw error;
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
   * Check if slug is available (alias for isSlugAvailable)
   */
  async checkSlugAvailability(slug: string): Promise<boolean> {
    return this.isSlugAvailable(slug);
  },

  /**
   * Check if slug is available
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (error) throw error;

      return !data; // Available if no data found
    } catch (error) {
      console.error("Error checking slug availability:", error);
      return false;
    }
  },

  /**
   * Update user's company association
   */
  async updateUserCompany(userId: string, companySlug: string): Promise<void> {
    try {
      // First, get the company by slug
      const company = await this.getCompanyBySlug(companySlug);
      
      if (!company) {
        throw new Error(`Company with slug "${companySlug}" not found`);
      }

      // Update the user's profile with company_id and company_slug
      const { error } = await supabase
        .from("profiles")
        .update({
          company_id: company.id,
          company_slug: companySlug,
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
    companySlug: string,
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
          slug: companySlug,
          email: email,
          subscription_plan_id: planId,
          subscription_status: 'trialing',
          trial_ends_at: trialEndsAt.toISOString(),
        },
      ])
      .select()
      .single();

    if (companyError) {
      console.error("Error creating company:", companyError);
      // Attempt to clean up the created user if company creation fails
      // This is important to avoid orphaned users.
      // In a production app, you might want a more robust cleanup mechanism.
      await supabase.auth.admin.deleteUser(user.id);
      throw companyError;
    }
    
    // Update profile with company_id
    const { error: profileError } = await supabase
        .from('profiles')
        .update({ company_id: company.id, roles: ['admin', 'owner'] })
        .eq('id', user.id);

    if (profileError) {
        // Handle error - maybe rollback company creation
        console.error("Error updating profile with company_id:", profileError);
    }
    
    // Send welcome email
    await emailAutomationService.sendCompanyWelcomeEmail(
      email,
      companyName,
      company.id,
      company.slug,
      fullName
    );
    
    return { user, company, session: signUpData.session };
  },

  async deleteCompany(id: string): Promise<void> {
    // This is a very destructive action.
  },

  /**
   * Update company slug (with validation)
   */
  async updateCompanySlug(companyId: string, newSlug: string): Promise<Company> {
    try {
      // Check if new slug is available
      const available = await this.isSlugAvailable(newSlug);
      if (!available) {
        throw new Error("This company slug is already in use. Please choose a different name.");
      }

      return await this.updateCompany(companyId, { slug: newSlug });
    } catch (error) {
      console.error("Error updating company slug:", error);
      throw error;
    }
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

      // Get owner profiles for each company
      const ownerIds = companies
        .map((c) => c.owner_id)
        .filter((id): id is string => id !== null);

      if (ownerIds.length === 0) return companies;

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", ownerIds);

      if (profilesError) throw profilesError;

      // Merge owner data with companies
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

  /**
   * Generate a unique slug from company name
   */
  generateSlug(companyName: string): string {
    return companyName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single
      .replace(/^-|-$/g, "") // Remove leading/trailing hyphens
      .trim();
  },

  /**
   * Generate a unique slug (checks availability)
   */
  async generateUniqueSlug(companyName: string): Promise<string> {
    let slug = this.generateSlug(companyName);
    let counter = 1;

    while (!(await this.isSlugAvailable(slug))) {
      slug = `${this.generateSlug(companyName)}-${counter}`;
      counter++;
    }

    return slug;
  },
};
