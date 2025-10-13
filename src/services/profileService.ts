import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;

export const profileService = {
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
      return null;
    }

    return data;
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

  async createProfile(profile: Omit<Profile, "created_at" | "updated_at">): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .insert([profile])
      .select()
      .single();

    if (error) {
      console.error("Error creating profile:", error);
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
