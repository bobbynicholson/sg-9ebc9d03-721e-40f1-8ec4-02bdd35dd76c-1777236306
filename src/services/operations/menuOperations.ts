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
        prep_time_minutes: itemData.preparationTime,
        base_servings: itemData.servingSize,
        dietary_tags: itemData.allergens,
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
    const dbUpdates: any = { updated_at: new Date().toISOString() };
    if (updates.itemName !== undefined) dbUpdates.item_name = updates.itemName;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.basePrice !== undefined) dbUpdates.base_price = updates.basePrice;
    if (updates.preparationTime !== undefined) dbUpdates.prep_time_minutes = updates.preparationTime;
    if (updates.servingSize !== undefined) dbUpdates.base_servings = updates.servingSize;
    if (updates.allergens !== undefined) dbUpdates.dietary_tags = updates.allergens;
    if (updates.isAvailable !== undefined) dbUpdates.is_available = updates.isAvailable;

    const { data, error } = await supabase
      .from("menu_items")
      .update(dbUpdates)
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