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
   * Update current_stock and write an audit row to inventory_transactions.
   * `transactionType` defaults to "adjustment" but should be one of the proper
   * enum values (adjustment | usage | waste | transfer | return) so the
   * movement history reads truthfully. Quantity stored is the delta.
   */
  async adjustStock(
    itemId: string,
    newStock: number,
    performedBy: string,
    notes?: string,
    transactionType: "adjustment" | "usage" | "waste" | "transfer" | "return" = "adjustment",
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
        transaction_type: transactionType,
        quantity: delta,
        performed_by: performedBy,
        notes: notes ?? `Manual ${transactionType} from ${previous} to ${newStock}`,
      }]);
    }

    return data;
  },

  /**
   * Restore a soft-deleted inventory item (powers the Undo on Delete toast).
   */
  async restoreInventoryItem(itemId: string): Promise<boolean> {
    const { error } = await supabase
      .from("inventory_items")
      .update({ deleted_at: null })
      .eq("id", itemId);
    if (error) {
      console.error("Error restoring inventory item:", error);
      throw error;
    }
    return true;
  },

  /**
   * Inventory list with the preferred supplier name joined in.
   * Use this on the admin inventory page so the supplier column shows real
   * names instead of a placeholder.
   */
  async getInventoryWithSuppliers(companyId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*, suppliers:preferred_supplier_id(supplier_name)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("item_name");
    if (error) {
      console.error("Error fetching inventory with suppliers:", error);
      return [];
    }
    return data || [];
  },

  /**
   * Which recipes reference this inventory item.
   * Used by the row-expand drawer to show "this item is in N recipes".
   */
  async getRecipesUsingItem(itemId: string): Promise<Array<{ recipe_id: string; recipe_name: string; quantity: number; unit: string }>> {
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .select("quantity, unit, recipes:recipe_id(id, recipe_name)")
      .eq("inventory_item_id", itemId);
    if (error) {
      console.error("Error fetching recipes for item:", error);
      return [];
    }
    return (data || []).map((row: any) => ({
      recipe_id: row.recipes?.id ?? "",
      recipe_name: row.recipes?.recipe_name ?? "Unnamed recipe",
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "unit",
    })).filter((r: any) => r.recipe_id);
  },

  /**
   * Last N inventory_transactions for a single item, newest first.
   * Used by the row-expand drawer to show movement history.
   */
  async getMovementsForItem(itemId: string, limit = 10): Promise<any[]> {
    const { data, error } = await supabase
      .from("inventory_transactions")
      .select("id, transaction_type, quantity, notes, performed_by, created_at")
      .eq("inventory_item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("Error fetching movements for item:", error);
      return [];
    }
    return data || [];
  },

  /**
   * Most recent inventory_transaction for the company. Powers the
   * "Last activity" stat card -- a recency signal for the team.
   */
  async getLastActivity(companyId: string): Promise<{ created_at: string; transaction_type: string; item_name?: string } | null> {
    const { data, error } = await supabase
      .from("inventory_transactions")
      .select("created_at, transaction_type, inventory_items:inventory_item_id(item_name)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Error fetching last activity:", error);
      return null;
    }
    if (!data) return null;
    return {
      created_at: data.created_at,
      transaction_type: data.transaction_type,
      item_name: (data as any).inventory_items?.item_name,
    };
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
