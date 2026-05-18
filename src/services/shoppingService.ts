/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { notificationService } from "./notificationService";
import { billingEmailService } from "./billingEmailService";

export type ShoppingList = Tables<"shopping_lists">;
export type ShoppingListItem = Tables<"shopping_list_items">;
export type PurchaseHistory = Tables<"purchase_history">;
/**
 * Supplier-pricing rows now live on the inventory_item_suppliers
 * join table. The historical `supplier_prices` table was a stub
 * that never carried real data and has been retired.
 */
export type SupplierPrice = Tables<"inventory_item_suppliers"> & {
  /** Joined from inventory_items.item_name to keep the legacy
   *  callsites (which expected an item_name column) working. */
  item_name?: string;
};

export const shoppingService = {
  async getShoppingLists(companyId: string): Promise<ShoppingList[]> {
    const { data, error } = await supabase
      .from("shopping_lists")
      .select("*")
      .eq("company_id", companyId)
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

  async createShoppingList(list: ShoppingList): Promise<ShoppingList | null> {
    const { data, error } = await supabase
      .from("shopping_lists")
      .insert([list])
      .select()
      .single();

    if (error) {
      console.error("Error creating shopping list:", error);
      throw error;
    }

    if (data) {
       await notificationService.createNotification({
        company_id: data.company_id,
        user_id: data.user_id,
        recipient_id: data.user_id, // Admin
        title: "New Shopping List Created",
        message: `A new shopping list for ${new Date(data.list_date).toLocaleDateString()} has been created.`,
        notification_type: "info",
        priority: "low",
        link: `/admin/shopping?listId=${data.id}`,
        related_entity_type: "shopping_list",
        related_entity_id: data.id,
      });
    }

    return data;
  },

  async assignShoppingList(listId: string, shopperId: string, shopperEmail?: string, shopperPhone?: string): Promise<ShoppingList | null> {
    const { data, error } = await supabase
      .from("shopping_lists")
      .update({ 
        shopper_id: shopperId,
        updated_at: new Date().toISOString()
      })
      .eq("id", listId)
      .select()
      .single();

    if (error) {
      console.error("Error assigning shopping list:", error);
      throw error;
    }

    if (data && data.shopper_id) {
        const { data: shopperProfile, error: shopperProfileErr } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", data.shopper_id)
            .single();
        if (shopperProfileErr) console.error("[shoppingService] shopper profile lookup failed:", shopperProfileErr);

        if (shopperProfile?.email) {
            await billingEmailService.sendStaffInvitationEmail(
                shopperProfile.email,
                "Admin", // placeholder
                "Your Company", // placeholder
                `${window.location.origin}/shopping?list_id=${listId}`,
                data.company_id
            );
        }

        await notificationService.createNotification({
            company_id: data.company_id,
            user_id: data.user_id,
            recipient_id: data.shopper_id,
            title: "You've been assigned a shopping list",
            message: `You have been assigned the shopping list for ${new Date(data.list_date).toLocaleDateString()}`,
            notification_type: "info",
            priority: "medium",
            link: `/team-portal/shopping/orders?listId=${listId}`,
            related_entity_type: "shopping_list",
            related_entity_id: listId,
        });
    }

    return data;
  },

  async startShopping(listId: string): Promise<ShoppingList | null> {
    const { data, error } = await supabase
      .from("shopping_lists")
      .update({ 
        status: "in_progress",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", listId)
      .select()
      .single();

    if (error) {
      console.error("Error starting shopping:", error);
      throw error;
    }

    if (data) {
       // Admin-facing notification - deep-link to the admin shopping
       // page filtered to this list.
       await notificationService.createNotification({
        company_id: data.company_id,
        user_id: data.user_id,
        recipient_id: data.user_id, // Admin
        title: "Shopping Has Started",
        message: `Shopping for list ${new Date(data.list_date).toLocaleDateString()} has begun.`,
        notification_type: "shopping_started",
        priority: "low",
        link: `/admin/shopping?listId=${listId}`,
        related_entity_type: "shopping_list",
        related_entity_id: listId,
      });
    }

    return data;
  },

  async completeShopping(listId: string, totalCost?: number): Promise<ShoppingList | null> {
    const { data, error } = await supabase
      .from("shopping_lists")
      .update({ 
        status: "completed",
        completed_at: new Date().toISOString(),
        total_cost: totalCost || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", listId)
      .select()
      .single();

    if (error) {
      console.error("Error completing shopping:", error);
      throw error;
    }

    if (data) {
        // Admin-facing completion ping - deep-link to the admin
        // shopping page so they can verify receipts + close out the
        // list.
        await notificationService.createNotification({
            company_id: data.company_id,
            user_id: data.user_id,
            recipient_id: data.user_id, // Admin
            title: "Shopping Completed",
            message: `Shopping for list ${new Date(data.list_date).toLocaleDateString()} is complete.`,
            notification_type: "shopping_completed",
            priority: "medium",
            link: `/admin/shopping?listId=${listId}`,
            related_entity_type: "shopping_list",
            related_entity_id: listId,
        });
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

  async addShoppingListItem(item: ShoppingListItem): Promise<ShoppingListItem | null> {
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

    // NOTIFICATION: Shopping item purchased → Real-time update to admin
    if (data && updates.purchased === true) {
      await this.sendItemPurchasedNotification(data);
    }

    return data;
  },

  async uploadShoppingReceipt(listId: string, receiptUrl: string, totalCost: number): Promise<ShoppingList | null> {
    const { data, error } = await supabase
      .from("shopping_lists")
      .update({ 
        receipt_url: receiptUrl,
        total_cost: totalCost,
        updated_at: new Date().toISOString()
      })
      .eq("id", listId)
      .select()
      .single();

    if (error) {
      console.error("Error uploading receipt:", error);
      throw error;
    }

    // NOTIFICATION: Shopping receipt uploaded → Notification to admin for approval
    if (data) {
      await this.sendReceiptUploadedNotification(data);
    }

    return data;
  },

  async checkBudgetExceeded(listId: string, estimatedBudget: number, actualCost: number): Promise<void> {
    if (actualCost > estimatedBudget) {
      // NOTIFICATION: Shopping budget exceeded → Alert to admin
      await this.sendBudgetExceededNotification(listId, estimatedBudget, actualCost);
    }
  },

  async getPurchaseHistory(companyId: string): Promise<PurchaseHistory[]> {
    const { data, error } = await supabase
      .from("purchase_history")
      .select("*")
      .eq("company_id", companyId)
      .order("purchase_date", { ascending: false });

    if (error) {
      console.error("Error fetching purchase history:", error);
      return [];
    }

    return data || [];
  },

  async addPurchaseHistory(purchase: PurchaseHistory): Promise<PurchaseHistory | null> {
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

  async getSupplierPrices(companyId: string, itemName?: string): Promise<SupplierPrice[]> {
    let query = (supabase as any)
      .from("inventory_item_suppliers")
      .select("*, inventory_items!inner(item_name, company_id)")
      .eq("company_id", companyId);

    if (itemName) {
      query = query.ilike("inventory_items.item_name", `%${itemName}%`);
    }

    const { data, error } = await query
      .order("unit_price");

    if (error) {
      console.error("Error fetching supplier prices:", error);
      return [];
    }

    return (data || []).map((row: any) => ({
      ...row,
      item_name: row.inventory_items?.item_name,
    })) as SupplierPrice[];
  },

  async getBestSupplierPrice(companyId: string, itemName: string): Promise<SupplierPrice | null> {
    const { data, error } = await (supabase as any)
      .from("inventory_item_suppliers")
      .select("*, inventory_items!inner(item_name, company_id)")
      .eq("company_id", companyId)
      .ilike("inventory_items.item_name", `%${itemName}%`)
      .not("unit_price", "is", null)
      .order("unit_price")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching best supplier price:", error);
      return null;
    }

    if (!data) return null;
    return { ...data, item_name: (data as any).inventory_items?.item_name } as SupplierPrice;
  },
};
