import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Equipment = Tables<"equipment">;

export const equipmentService = {
  async getEquipment(userId: string, regionId?: string): Promise<Equipment[]> {
    let query = supabase
      .from("equipment")
      .select("*")
      .eq("user_id", userId);

    if (regionId) {
      query = query.eq("region_id", regionId);
    }

    const { data, error } = await query.order("name");

    if (error) {
      console.error("Error fetching equipment:", error);
      return [];
    }

    return data || [];
  },

  async getEquipmentItem(itemId: string): Promise<Equipment | null> {
    const { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("id", itemId)
      .single();

    if (error) {
      console.error("Error fetching equipment item:", error);
      return null;
    }

    return data;
  },

  async createEquipmentItem(item: Omit<Equipment, "id" | "created_at" | "updated_at">): Promise<Equipment | null> {
    const { data, error } = await supabase
      .from("equipment")
      .insert([item])
      .select()
      .single();

    if (error) {
      console.error("Error creating equipment item:", error);
      throw error;
    }

    return data;
  },

  async updateEquipmentItem(itemId: string, updates: Partial<Equipment>): Promise<Equipment | null> {
    const { data, error } = await supabase
      .from("equipment")
      .update(updates)
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      console.error("Error updating equipment item:", error);
      throw error;
    }

    return data;
  },

  async deleteEquipmentItem(itemId: string): Promise<boolean> {
    const { error } = await supabase
      .from("equipment")
      .delete()
      .eq("id", itemId);

    if (error) {
      console.error("Error deleting equipment item:", error);
      throw error;
    }

    return true;
  },

  async getAvailableEquipment(userId: string, startDate: string, endDate: string): Promise<Equipment[]> {
    const { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "available")
      .order("name");

    if (error) {
      console.error("Error fetching available equipment:", error);
      return [];
    }

    return data || [];
  }
};
