import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { emailAutomationService } from "./emailAutomationService";
import { realtimeNotificationService } from "./realtimeNotificationService";

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

    // NOTIFICATION: Shopping list created → Notification to shopper
    if (data) {
      await this.sendShoppingListCreatedNotification(data);
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

    // NOTIFICATION: Shopping list assigned → Email + WhatsApp to assigned shopper
    if (data && shopperEmail) {
      await this.sendShoppingListAssignedNotification(data, shopperEmail, shopperPhone);
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

    // NOTIFICATION: Shopping started → Notification to admin
    if (data) {
      await this.sendShoppingStartedNotification(data);
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

    // NOTIFICATION: Shopping completed → Notification to admin + kitchen
    if (data) {
      await this.sendShoppingCompletedNotification(data);
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
  },

  // NOTIFICATION METHODS

  async sendShoppingListCreatedNotification(list: ShoppingList): Promise<void> {
    try {
      // Get company details
      const { data: company } = await supabase
        .from("companies")
        .select("id, company_name")
        .eq("id", list.company_id)
        .single();

      if (!company) return;

      // Portal notification to admin
      await realtimeNotificationService.createNotification({
        company_id: list.company_id,
        user_id: list.user_id,
        recipient_id: list.user_id,
        title: "Shopping List Created",
        message: `A new shopping list has been created for ${list.list_date}`,
        notification_type: "info",
        priority: "medium",
        link: `/shopping/${list.id}`,
      });
    } catch (error) {
      console.error("Error sending shopping list created notification:", error);
    }
  },

  async sendShoppingListAssignedNotification(list: ShoppingList, shopperEmail: string, shopperPhone?: string): Promise<void> {
    try {
      // Get company details
      const { data: company } = await supabase
        .from("companies")
        .select("id, company_name")
        .eq("id", list.company_id)
        .single();

      if (!company) return;

      // Email to assigned shopper
      await emailAutomationService.sendEmail({
        to: shopperEmail,
        subject: "Shopping Assignment",
        template: "shopping_assignment",
        variables: {
          companyName: company.company_name,
          listDate: list.list_date,
          listUrl: `${window.location.origin}/shopping/${list.id}`,
        },
        companyId: list.company_id,
      });

      // WhatsApp to assigned shopper (if phone provided)
      if (shopperPhone) {
        // WhatsApp integration would go here
        console.log("WhatsApp notification to shopper:", shopperPhone);
      }

      // Portal notification to shopper
      if (list.shopper_id) {
        await realtimeNotificationService.createNotification({
          company_id: list.company_id,
          user_id: list.user_id,
          recipient_id: list.shopper_id,
          title: "Shopping Assignment",
          message: `You have been assigned a shopping list for ${list.list_date}`,
          notification_type: "info",
          priority: "high",
          link: `/shopping/${list.id}`,
        });
      }
    } catch (error) {
      console.error("Error sending shopping list assigned notification:", error);
    }
  },

  async sendShoppingStartedNotification(list: ShoppingList): Promise<void> {
    try {
      // Portal notification to admin
      await realtimeNotificationService.createNotification({
        company_id: list.company_id,
        user_id: list.user_id,
        recipient_id: list.user_id,
        title: "Shopping Started",
        message: `Shopping has started for the list dated ${list.list_date}`,
        notification_type: "info",
        priority: "medium",
        link: `/shopping/${list.id}`,
      });
    } catch (error) {
      console.error("Error sending shopping started notification:", error);
    }
  },

  async sendShoppingCompletedNotification(list: ShoppingList): Promise<void> {
    try {
      // Get company details
      const { data: company } = await supabase
        .from("companies")
        .select("id, company_name, admin_email")
        .eq("id", list.company_id)
        .single();

      if (!company) return;

      // Email to admin
      if (company.admin_email) {
        await emailAutomationService.sendEmail({
          to: company.admin_email,
          subject: "Shopping Completed",
          template: "shopping_completed",
          variables: {
            companyName: company.company_name,
            listDate: list.list_date,
            totalCost: list.total_cost?.toString() || "N/A",
            listUrl: `${window.location.origin}/shopping/${list.id}`,
          },
          companyId: list.company_id,
        });
      }

      // Portal notification to admin
      await realtimeNotificationService.createNotification({
        company_id: list.company_id,
        user_id: list.user_id,
        recipient_id: list.user_id,
        title: "Shopping Completed",
        message: `Shopping has been completed for ${list.list_date}. Total cost: ${list.total_cost || "N/A"}`,
        notification_type: "success",
        priority: "high",
        link: `/shopping/${list.id}`,
      });

      // Portal notification to kitchen staff
      const { data: kitchenStaff } = await supabase
        .from("profiles")
        .select("id")
        .eq("company_id", list.company_id)
        .eq("role", "kitchen");

      if (kitchenStaff) {
        for (const staff of kitchenStaff) {
          await realtimeNotificationService.createNotification({
            company_id: list.company_id,
            user_id: list.user_id,
            recipient_id: staff.id,
            title: "Shopping Delivered",
            message: `Shopping for ${list.list_date} has been completed and is ready for use`,
            notification_type: "info",
            priority: "medium",
            link: `/shopping/${list.id}`,
          });
        }
      }
    } catch (error) {
      console.error("Error sending shopping completed notification:", error);
    }
  },

  async sendItemPurchasedNotification(item: ShoppingListItem): Promise<void> {
    try {
      // Get shopping list details
      const { data: list } = await supabase
        .from("shopping_lists")
        .select("company_id, user_id")
        .eq("id", item.shopping_list_id)
        .single();

      if (!list) return;

      // Real-time portal notification to admin
      await realtimeNotificationService.createNotification({
        company_id: list.company_id,
        user_id: list.user_id,
        recipient_id: list.user_id,
        title: "Item Purchased",
        message: `${item.item_name} has been purchased - ${item.quantity} ${item.unit}`,
        notification_type: "info",
        priority: "low",
        link: `/shopping/${item.shopping_list_id}`,
      });
    } catch (error) {
      console.error("Error sending item purchased notification:", error);
    }
  },

  async sendReceiptUploadedNotification(list: ShoppingList): Promise<void> {
    try {
      // Get company details
      const { data: company } = await supabase
        .from("companies")
        .select("id, company_name, admin_email")
        .eq("id", list.company_id)
        .single();

      if (!company) return;

      // Email to admin for approval
      if (company.admin_email) {
        await emailAutomationService.sendEmail({
          to: company.admin_email,
          subject: "Receipt Uploaded - Approval Required",
          template: "receipt_uploaded",
          variables: {
            companyName: company.company_name,
            listDate: list.list_date,
            totalCost: list.total_cost?.toString() || "N/A",
            receiptUrl: list.receipt_url || "",
            listUrl: `${window.location.origin}/shopping/${list.id}`,
          },
          companyId: list.company_id,
        });
      }

      // Portal notification to admin
      await realtimeNotificationService.createNotification({
        company_id: list.company_id,
        user_id: list.user_id,
        recipient_id: list.user_id,
        title: "Receipt Uploaded",
        message: `Shopping receipt for ${list.list_date} has been uploaded. Total: ${list.total_cost || "N/A"}. Please review.`,
        notification_type: "info",
        priority: "high",
        link: `/shopping/${list.id}`,
      });
    } catch (error) {
      console.error("Error sending receipt uploaded notification:", error);
    }
  },

  async sendBudgetExceededNotification(listId: string, estimatedBudget: number, actualCost: number): Promise<void> {
    try {
      // Get shopping list and company details
      const { data: list } = await supabase
        .from("shopping_lists")
        .select("company_id, user_id, list_date")
        .eq("id", listId)
        .single();

      if (!list) return;

      const { data: company } = await supabase
        .from("companies")
        .select("id, company_name, admin_email")
        .eq("id", list.company_id)
        .single();

      if (!company) return;

      const overage = actualCost - estimatedBudget;
      const overagePercentage = ((overage / estimatedBudget) * 100).toFixed(1);

      // Email alert to admin
      if (company.admin_email) {
        await emailAutomationService.sendEmail({
          to: company.admin_email,
          subject: "⚠️ Shopping Budget Exceeded",
          template: "budget_exceeded",
          variables: {
            companyName: company.company_name,
            listDate: list.list_date,
            estimatedBudget: estimatedBudget.toString(),
            actualCost: actualCost.toString(),
            overage: overage.toString(),
            overagePercentage: overagePercentage,
            listUrl: `${window.location.origin}/shopping/${listId}`,
          },
          companyId: list.company_id,
        });
      }

      // Portal notification to admin
      await realtimeNotificationService.createNotification({
        company_id: list.company_id,
        user_id: list.user_id,
        recipient_id: list.user_id,
        title: "⚠️ Budget Exceeded",
        message: `Shopping for ${list.list_date} exceeded budget by ${overagePercentage}%. Estimated: ${estimatedBudget}, Actual: ${actualCost}`,
        notification_type: "warning",
        priority: "urgent",
        link: `/shopping/${listId}`,
      });
    } catch (error) {
      console.error("Error sending budget exceeded notification:", error);
    }
  },
};
