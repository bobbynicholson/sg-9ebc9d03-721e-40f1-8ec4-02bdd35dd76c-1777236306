import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Region = Tables<"regions">;

export const regionService = {
  async getRegions(userId: string): Promise<Region[]> {
    const { data, error } = await supabase
      .from("regions")
      .select("*")
      .eq("user_id", userId)
      .order("name");

    if (error) {
      console.error("Error fetching regions:", error);
      return [];
    }

    return data || [];
  },

  async getRegion(regionId: string): Promise<Region | null> {
    const { data, error } = await supabase
      .from("regions")
      .select("*")
      .eq("id", regionId)
      .single();

    if (error) {
      console.error("Error fetching region:", error);
      return null;
    }

    return data;
  },

  async createRegion(region: Omit<Region, "id" | "created_at" | "updated_at">): Promise<Region | null> {
    const { data, error } = await supabase
      .from("regions")
      .insert([region])
      .select()
      .single();

    if (error) {
      console.error("Error creating region:", error);
      throw error;
    }

    return data;
  },

  async updateRegion(regionId: string, updates: Partial<Region>): Promise<Region | null> {
    const { data, error } = await supabase
      .from("regions")
      .update(updates)
      .eq("id", regionId)
      .select()
      .single();

    if (error) {
      console.error("Error updating region:", error);
      throw error;
    }

    return data;
  },

  async deleteRegion(regionId: string): Promise<boolean> {
    const { error } = await supabase
      .from("regions")
      .delete()
      .eq("id", regionId);

    if (error) {
      console.error("Error deleting region:", error);
      throw error;
    }

    return true;
  }
};
