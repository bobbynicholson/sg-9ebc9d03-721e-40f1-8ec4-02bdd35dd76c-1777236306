import { supabase } from "@/integrations/supabase/client";

/**
 * Menu Operations Module
 * Handles menu item management and pricing
 */

export interface MenuItem {
  id: string;
  itemName: string;
  description: string;
  category: string;
  basePrice: number;
  preparationTime: number;
  servingSize: number;
  allergens: string[];
  isAvailable: boolean;
}

export async function getMenuItemsByCompany(companyId: string) {
  try {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("company_id", companyId)
      .order("category")
      .order("item_name");

    if (error) throw error;

    return { success: true, items: data || [] };
  } catch (error: any) {
    console.error("Error fetching menu items:", error);
    return { success: false, error: error.message, items: [] };
  }
}

export async function createMenuItem(
  companyId: string,
  itemData: Omit<MenuItem, "id">
) {
  try {
    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        company_id: companyId,
        item_name: itemData.itemName,
        description: itemData.description,
        category: itemData.category,
        base_price: itemData.basePrice,
        preparation_time: itemData.preparationTime,
        serving_size: itemData.servingSize,
        allergens: itemData.allergens,
        is_available: itemData.isAvailable,
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, item: data };
  } catch (error: any) {
    console.error("Error creating menu item:", error);
    return { success: false, error: error.message };
  }
}

export async function updateMenuItem(
  itemId: string,
  updates: Partial<Omit<MenuItem, "id">>
) {
  try {
    const { data, error } = await supabase
      .from("menu_items")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, item: data };
  } catch (error: any) {
    console.error("Error updating menu item:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteMenuItem(itemId: string) {
  try {
    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", itemId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting menu item:", error);
    return { success: false, error: error.message };
  }
}