import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;
type UserRoleEnum = Database["public"]["Enums"]["user_role"];

export const profileService = {
  // Get user profile
  async getProfile(userId: string) {
    try {
      if (!userId || typeof userId !== "string" || userId.trim() === "") {
        console.error("Invalid userId provided to getProfile:", userId);
        return null;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile:", error);
        return null;
      }

      if (!data) {
        console.warn("No profile found for user:", userId);
        return null;
      }

      return data;
    } catch (error) {
      console.error("Fatal error in getProfile:", error);
      return null;
    }
  },

  async getProfiles(filters: { role: string }): Promise<Profile[]> {
    let query = supabase.from("profiles").select("*");

    if (filters.role) {
      query = query.eq("role", filters.role as UserRoleEnum);
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
      .eq("role", role as UserRoleEnum)
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

  async getAllClients(companyId?: string): Promise<Profile[]> {
    let query = supabase
      .from("profiles")
      .select("*")
      .eq("role", "client")
      .order("created_at", { ascending: false });
    if (companyId) query = query.eq("company_id", companyId);
    const { data, error } = await query;

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
