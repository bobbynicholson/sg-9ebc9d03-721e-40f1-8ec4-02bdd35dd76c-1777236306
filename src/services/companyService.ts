/* eslint-disable @typescript-eslint/no-explicit-any */
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

// Map a currency to its ISO 3166 country code. Used by the default
// region seed so a USD tenant doesn't get country='ZA' (Agent 7
// audit). Falls back to ZA because the platform's primary tenant
// pool is South African catering operators.
function countryFromCurrency(currency: string | null | undefined): string {
  switch ((currency || "").toUpperCase()) {
    case "USD": return "US";
    case "GBP": return "GB";
    case "EUR": return "EU";
    case "AUD": return "AU";
    case "CAD": return "CA";
    case "ZAR":
    default: return "ZA";
  }
}

// Build a default region code that's collision-resistant per company.
// regions.code is unique per company; two new tenants both signing up
// with short slugs that collapse to the same prefix would clash. We
// suffix the slug-derived prefix with a random 4-char tail so two
// signups can't race onto the same code.
function buildDefaultRegionCode(slug: string | null | undefined): string {
  const base = (slug || "main").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "MAIN";
  const tail = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${tail}`.slice(0, 12);
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
  company_slug?: string;
  }): Promise<{ success: boolean; company?: Company; error?: string }> {
    try {
      // Companies has `slug`, not `company_slug`, and no `onboarding_completed`.
      const slug = (data.company_slug || data.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      // 30-day trial - matches the platform-wide policy and the figure shown
      // in /admin/platform/trial-management. The previous 14-day window was
      // out of step with the rest of the codebase.
      const companyData: CompanyInsert = {
        company_name: data.name,
        slug,
        owner_id: data.owner_id,
        email: data.email,
        phone: data.phone,
        currency: data.currency || "ZAR",
        timezone: data.timezone || "Africa/Johannesburg",
        subscription_status: "trial",
        trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        is_active: true,
      } as any;

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

      // Seed a default region (the "Main" kitchen / branch) so every
      // tenant has at least one regions row from day one. Lifecycle
      // artifacts (leads, quotes, orders) carry region_id from the
      // moment of creation, which means single-branch tenants don't
      // need to think about regions and multi-branch tenants only
      // create extras on top. Coords stay null until the owner sets
      // an HQ address; useCompanyKitchens filters regions without
      // coords, so the picker only surfaces real, deliverable origins.
      try {
        const regionCode = buildDefaultRegionCode(slug);
        await supabase.from("regions").insert({
          company_id: company.id,
          code: regionCode,
          name: "Main kitchen",
          country: countryFromCurrency(company.currency),
          currency: company.currency,
          timezone: company.timezone,
          is_active: true,
        } as any);
      } catch (seedErr) {
        // Non-blocking. If the seed fails (e.g. unique-code clash)
        // the tenant still works - HQ fallback in useCompanyKitchens
        // covers them until they add a region manually.
        console.warn("[companyService] default region seed failed (non-blocking):", seedErr);
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
          // A.13 #3 sweep: was 'trialing' (Stripe convention) which
          // every reader filter missed - analyticsService,
          // financial-dashboard, TrialExpiryBanner,
          // subscriptionService.isInTrial all compare against 'trial'.
          // Migration 20260518740000 dropped 'trialing' from the
          // enum so 'trial' is now the only legal value.
          subscription_status: 'trial',
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
        .update({
          company_id: company.id,
          role: 'company_admin',
          active_role: 'company_admin',
        } as any)
        .eq('id', user.id);

    if (profileError) {
        console.error("Error updating profile with company_id:", profileError);
    }

    // Seed the default "Main kitchen" region. See companyService.createCompany
    // for the rationale - this keeps every tenant region-aware from day one.
    try {
      const regionCode = buildDefaultRegionCode(company.slug);
      await supabase.from("regions").insert({
        company_id: company.id,
        code: regionCode,
        name: "Main kitchen",
        country: countryFromCurrency(company.currency),
        currency: company.currency,
        timezone: company.timezone,
        is_active: true,
      } as any);
    } catch (seedErr) {
      console.warn("[companyService] default region seed failed (non-blocking):", seedErr);
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

  /**
   * Create a new company with an admin user from super admin dashboard
   */
  async createCompanyWithAdmin(data: {
    company_name: string;
    company_slug: string;
    email: string;
    phone: string;
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    billing_currency: string;
    admin_name: string;
    admin_email: string;
    admin_password?: string;
  }): Promise<{ success: boolean; company?: Company; error?: string }> {
    try {
      // FIX (2026-06-12): chicken-and-egg. /api/admin/create-user
      // REQUIRES company_id, but the old order created the admin user
      // FIRST (no company_id yet) -> the API rejected it with "we
      // couldn't tell which company to add this user to" and no tenant
      // could be created. owner_id on companies is nullable, so create
      // the company FIRST, then the user with that company_id, then
      // back-link owner_id. Roll back the orphan company if user
      // creation fails.
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 30);

      // 1. Create the company (owner_id back-filled in step 3).
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert([{
          company_name: data.company_name,
          slug: data.company_slug,
          email: data.email,
          phone: data.phone,
          address_line1: data.address_line1,
          address_line2: data.address_line2,
          city: data.city,
          state_province: data.state,
          postal_code: data.postal_code,
          country: data.country,
          billing_currency: data.billing_currency,
          owner_id: null,
          subscription_status: 'trial',
          trial_ends_at: trialEndsAt.toISOString(),
          is_active: true
        } as any])
        .select()
        .single();

      if (companyError) {
        console.error("Error creating company:", companyError);
        throw new Error(companyError.message);
      }

      // 2. Create the admin user, now that we have a company_id to
      // attach. create-user generates a temp password server-side.
      const userRes = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.admin_email,
          full_name: data.admin_name,
          role: 'company_admin',
          company_id: company.id,
        })
      });

      const userData = await userRes.json();
      if (!userRes.ok) {
        // Roll back the orphan company so a retry with the same slug
        // doesn't hit the unique-slug constraint.
        await supabase.from("companies").delete().eq("id", company.id);
        throw new Error(userData.error || "Failed to create the company's admin user");
      }

      const userId = userData.user.id;
      const tempPassword: string | null = (userData as any)?.tempPassword || null;
      // Surface the password once - the super admin needs to hand
      // it to the new tenant owner via a secure channel.
      if (tempPassword && typeof window !== "undefined") {
        try { await navigator.clipboard.writeText(tempPassword); } catch { /* clipboard blocked */ }
        window.prompt(
          `Temporary password for ${data.admin_name} (copied to clipboard).\nShare it via your secure channel - the owner must change it on first login.`,
          tempPassword,
        );
      }

      // 3. Back-link the company to its owner.
      const { error: ownerLinkErr } = await supabase
        .from("companies")
        .update({ owner_id: userId } as any)
        .eq("id", company.id);
      if (ownerLinkErr) {
        console.error("Error linking company owner:", ownerLinkErr);
      }

      // 4. Ensure the user's profile carries the company link (create-user
      // sets this, but belt-and-braces in case its profile write lagged).
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          company_id: company.id,
          company_slug: data.company_slug
        } as any)
        .eq('id', userId);

      if (profileError) {
        console.error("Error updating profile:", profileError);
      }

      // 4. Seed the default "Main kitchen" region.
      try {
        const regionCode = buildDefaultRegionCode(data.company_slug);
        await supabase.from("regions").insert({
          company_id: company.id,
          code: regionCode,
          name: "Main kitchen",
          country: data.country || countryFromCurrency(data.billing_currency || "ZAR"),
          city: data.city || null,
          address: data.address_line1 || null,
          postal_code: data.postal_code || null,
          currency: data.billing_currency || "ZAR",
          is_active: true,
        } as any);
      } catch (seedErr) {
        console.warn("[companyService] default region seed failed (non-blocking):", seedErr);
      }

      return { success: true, company };
    } catch (error: any) {
      console.error("Failed to create company with admin:", error);
      return { success: false, error: error.message };
    }
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
        } as any)
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