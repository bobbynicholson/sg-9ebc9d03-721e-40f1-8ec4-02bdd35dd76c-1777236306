import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;

export const profileService = {
  // Get user profile
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId);

    if (error) {
      // Don't throw if the error is that the row doesn't exist, just return null.
      if (error.code === 'PGRST116') {
        console.warn("Profile not found for user:", userId);
        return null;
      }
      console.error("Error fetching profile:", error);
      return null;
    }

    // If data is an array, return the first element. Otherwise, return null.
    return data && data.length > 0 ? data[0] : null;
  },

  // Create or update user profile (upsert)
  async createProfile(profileData: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    currency: string;
    phone_number?: string;
    company_name?: string;
    subscription_status?: string;
    subscription_plan?: string;
    trial_ends_at?: string;
    is_active?: boolean;
  }) {
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: profileData.id,
          email: profileData.email,
          full_name: profileData.full_name,
          role: profileData.role,
          currency: profileData.currency,
          phone_number: profileData.phone_number || null,
          company_name: profileData.company_name || null,
          subscription_status: profileData.subscription_status || "trial",
          subscription_plan: profileData.subscription_plan || "trial",
          trial_ends_at: profileData.trial_ends_at || null,
          is_active: profileData.is_active !== undefined ? profileData.is_active : true,
        },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error creating/updating profile:", error);
      throw error;
    }

    return data;
  },

  async getProfiles(filters: { role: string }): Promise<Profile[]> {
    let query = supabase.from("profiles").select("*");

    if (filters.role) {
      query = query.eq("role", filters.role);
    }

    const { data, error } = await query.order("full_name");

    if (error) {
      console.error("Error fetching profiles:", error);
      return [];
    }

    return data || [];
  },

  async updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating profile:", error);
      throw error;
    }

    return data;
  },

  async getUsersByRole(userId: string, role: string): Promise<Profile[]> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", role)
      .order("full_name");

    if (error) {
      console.error("Error fetching users by role:", error);
      return [];
    }

    return data || [];
  },

  async searchClients(searchTerm: string): Promise<Profile[]> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,company_name.ilike.%${searchTerm}%`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error searching clients:", error);
      return [];
    }

    return data || [];
  },

  async getAllClients(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching all clients:", error);
      return [];
    }

    return data || [];
  },

  async getClientsByRegion(region: string): Promise<Profile[]> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("region", region)
      .order("full_name");

    if (error) {
      console.error("Error fetching clients by region:", error);
      return [];
    }

    return data || [];
  }
};
