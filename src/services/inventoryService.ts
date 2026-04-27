/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Inventory = Tables<"inventory">;

export const inventoryService = {
  async getInventory(companyId: string, regionId?: string): Promise<Inventory[]> {
    let query = supabase
      .from("inventory")
      .select("*")
      .eq("company_id", companyId);

    if (regionId) {
      query = query.eq("region_id", regionId);
    }

    const { data, error } = await query.order("name");

    if (error) {
      console.error("Error fetching inventory:", error);
      return [];
    }

    return data || [];
  },

  async getInventoryItem(itemId: string): Promise<Inventory | null> {
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .eq("id", itemId)
      .single();

    if (error) {
      console.error("Error fetching inventory item:", error);
      return null;
    }

    return data;
  },

  async createInventoryItem(item: Inventory): Promise<Inventory | null> {
    const { data, error } = await supabase
      .from("inventory")
      .insert([item])
      .select()
      .single();

    if (error) {
      console.error("Error creating inventory item:", error);
      throw error;
    }

    return data;
  },

  async updateInventoryItem(itemId: string, updates: Partial<Inventory>): Promise<Inventory | null> {
    const { data, error } = await supabase
      .from("inventory")
      .update(updates)
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      console.error("Error updating inventory item:", error);
      throw error;
    }

    return data;
  },

  async deleteInventoryItem(itemId: string): Promise<boolean> {
    const { error } = await supabase
      .from("inventory")
      .delete()
      .eq("id", itemId);

    if (error) {
      console.error("Error deleting inventory item:", error);
      throw error;
    }

    return true;
  },

  async getLowStockItems(companyId: string): Promise<Inventory[]> {
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "low_stock")
      .order("name");

    if (error) {
      console.error("Error fetching low stock items:", error);
      return [];
    }

    return data || [];
  },

  async getExpiringItems(companyId: string, daysAhead: number = 7): Promise<Inventory[]> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + daysAhead);

    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .eq("company_id", companyId)
      .lte("expiry_date", expiryDate.toISOString().split("T")[0])
      .order("expiry_date");

    if (error) {
      console.error("Error fetching expiring items:", error);
      return [];
    }

    return data || [];
  }
};
