import { supabase } from "@/integrations/supabase/client";

/**
 * Inventory Operations Module
 * Handles inventory tracking, stock management, and low stock alerts
 */

export interface InventoryItem {
  id: string;
  itemName: string;
  category: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
  costPerUnit: number;
  supplierId?: string;
}

export async function getInventoryByCompany(companyId: string) {
  try {
    const { data, error } = await supabase
      .from("inventory_items")
      .select(`
        *,
        supplier:suppliers(supplier_name, contact_person, phone, email)
      `)
      .eq("company_id", companyId)
      .order("item_name");

    if (error) throw error;

    return { success: true, items: data || [] };
  } catch (error: any) {
    console.error("Error fetching inventory:", error);
    return { success: false, error: error.message, items: [] };
  }
}

export async function getLowStockItems(companyId: string) {
  try {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("company_id", companyId)
      .filter("current_stock", "lt", "minimum_stock")
      .order("current_stock", { ascending: true });

    if (error) throw error;

    return { success: true, items: data || [] };
  } catch (error: any) {
    console.error("Error fetching low stock items:", error);
    return { success: false, error: error.message, items: [] };
  }
}

export async function updateInventoryStock(
  itemId: string,
  newStock: number,
  reason: "restock" | "usage" | "adjustment" | "waste"
) {
  try {
    const { data, error } = await supabase
      .from("inventory_items")
      .update({
        current_stock: newStock,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .select()
      .single();

    if (error) throw error;

    // Log the stock change
    await supabase.from("inventory_transactions").insert({
      inventory_item_id: itemId,
      quantity_change: newStock,
      transaction_type: reason,
      notes: `Stock updated to ${newStock}`,
    });

    return { success: true, item: data };
  } catch (error: any) {
    console.error("Error updating inventory stock:", error);
    return { success: false, error: error.message };
  }
}

export async function createInventoryItem(
  companyId: string,
  itemData: Omit<InventoryItem, "id">
) {
  try {
    const { data, error } = await supabase
      .from("inventory_items")
      .insert({
        company_id: companyId,
        item_name: itemData.itemName,
        category: itemData.category,
        unit: itemData.unit,
        current_stock: itemData.currentStock,
        minimum_stock: itemData.minimumStock,
        cost_per_unit: itemData.costPerUnit,
        supplier_id: itemData.supplierId,
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, item: data };
  } catch (error: any) {
    console.error("Error creating inventory item:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteInventoryItem(itemId: string) {
  try {
    const { error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", itemId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting inventory item:", error);
    return { success: false, error: error.message };
  }
}