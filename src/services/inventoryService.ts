/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Inventory = Tables<"inventory_items">;

export const inventoryService = {
  async getInventory(companyId: string): Promise<Inventory[]> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("item_name");

    if (error) {
      console.error("Error fetching inventory:", error);
      return [];
    }

    return data || [];
  },

  async getInventoryItem(itemId: string): Promise<Inventory | null> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (error) {
      console.error("Error fetching inventory item:", error);
      return null;
    }

    return data;
  },

  async createInventoryItem(item: Partial<Inventory>): Promise<Inventory | null> {
    const { data, error } = await supabase
      .from("inventory_items")
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
      .from("inventory_items")
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
      .from("inventory_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", itemId);

    if (error) {
      console.error("Error deleting inventory item:", error);
      throw error;
    }

    return true;
  },

  /**
   * Update current_stock and write an audit row to inventory_transactions
   * with transaction_type='adjustment'. Quantity stored is the delta
   * (positive = stock added, negative = stock removed).
   */
  async adjustStock(
    itemId: string,
    newStock: number,
    performedBy: string,
    notes?: string,
  ): Promise<Inventory | null> {
    const current = await this.getInventoryItem(itemId);
    if (!current) throw new Error("Inventory item not found");

    const previous = Number(current.current_stock || 0);
    const delta = Number(newStock) - previous;

    const { data, error } = await supabase
      .from("inventory_items")
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      console.error("Error adjusting stock:", error);
      throw error;
    }

    if (delta !== 0) {
      await supabase.from("inventory_transactions").insert([{
        company_id: current.company_id,
        inventory_item_id: itemId,
        transaction_type: "adjustment",
        quantity: delta,
        performed_by: performedBy,
        notes: notes ?? `Manual adjustment from ${previous} to ${newStock}`,
      }]);
    }

    return data;
  },

  async getLowStockItems(companyId: string): Promise<Inventory[]> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("item_name");

    if (error) {
      console.error("Error fetching low stock items:", error);
      return [];
    }

    return (data || []).filter(
      (i: any) => Number(i.current_stock || 0) <= Number(i.minimum_stock || 0),
    );
  },
};
