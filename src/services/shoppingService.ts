import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ShoppingList = Tables<"shopping_lists">;
export type ShoppingListItem = Tables<"shopping_list_items">;
export type PurchaseHistory = Tables<"purchase_history">;
export type SupplierPrice = Tables<"supplier_prices">;

export const shoppingService = {
  async getShoppingLists(userId: string): Promise<ShoppingList[]> {
    const { data, error } = await supabase
      .from("shopping_lists")
      .select("*")
      .eq("user_id", userId)
      .order("list_date", { ascending: false });

    if (error) {
      console.error("Error fetching shopping lists:", error);
      return [];
    }

    return data || [];
  },

  async getShoppingList(listId: string): Promise<ShoppingList | null> {
    const { data, error } = await supabase
      .from("shopping_lists")
      .select("*")
      .eq("id", listId)
      .single();

    if (error) {
      console.error("Error fetching shopping list:", error);
      return null;
    }

    return data;
  },

  async createShoppingList(list: Omit<ShoppingList, "id" | "created_at" | "updated_at">): Promise<ShoppingList | null> {
    const { data, error } = await supabase
      .from("shopping_lists")
      .insert([list])
      .select()
      .single();

    if (error) {
      console.error("Error creating shopping list:", error);
      throw error;
    }

    return data;
  },

  async getShoppingListItems(listId: string): Promise<ShoppingListItem[]> {
    const { data, error } = await supabase
      .from("shopping_list_items")
      .select("*")
      .eq("shopping_list_id", listId)
      .order("item_name");

    if (error) {
      console.error("Error fetching shopping list items:", error);
      return [];
    }

    return data || [];
  },

  async addShoppingListItem(item: Omit<ShoppingListItem, "id" | "created_at" | "updated_at">): Promise<ShoppingListItem | null> {
    const { data, error } = await supabase
      .from("shopping_list_items")
      .insert([item])
      .select()
      .single();

    if (error) {
      console.error("Error adding shopping list item:", error);
      throw error;
    }

    return data;
  },

  async updateShoppingListItem(itemId: string, updates: Partial<ShoppingListItem>): Promise<ShoppingListItem | null> {
    const { data, error } = await supabase
      .from("shopping_list_items")
      .update(updates)
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      console.error("Error updating shopping list item:", error);
      throw error;
    }

    return data;
  },

  async getPurchaseHistory(userId: string): Promise<PurchaseHistory[]> {
    const { data, error } = await supabase
      .from("purchase_history")
      .select("*")
      .eq("user_id", userId)
      .order("purchase_date", { ascending: false });

    if (error) {
      console.error("Error fetching purchase history:", error);
      return [];
    }

    return data || [];
  },

  async addPurchaseHistory(purchase: Omit<PurchaseHistory, "id" | "created_at" | "updated_at">): Promise<PurchaseHistory | null> {
    const { data, error } = await supabase
      .from("purchase_history")
      .insert([purchase])
      .select()
      .single();

    if (error) {
      console.error("Error adding purchase history:", error);
      throw error;
    }

    return data;
  },

  async getSupplierPrices(userId: string, itemName?: string): Promise<SupplierPrice[]> {
    let query = supabase
      .from("supplier_prices")
      .select("*")
      .eq("user_id", userId);

    if (itemName) {
      query = query.ilike("item_name", `%${itemName}%`);
    }

    const { data, error } = await query
      .order("item_name")
      .order("unit_price");

    if (error) {
      console.error("Error fetching supplier prices:", error);
      return [];
    }

    return data || [];
  },

  async getBestSupplierPrice(userId: string, itemName: string): Promise<SupplierPrice | null> {
    const { data, error } = await supabase
      .from("supplier_prices")
      .select("*")
      .eq("user_id", userId)
      .ilike("item_name", `%${itemName}%`)
      .order("unit_price")
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching best supplier price:", error);
      return null;
    }

    return data;
  }
};
