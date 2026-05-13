import { supabase } from "@/integrations/supabase/client";

/**
 * Recipe Mapping: Menu Item → Inventory Ingredients
 * Each menu item maps to required inventory items with quantities per serving
 */
export interface RecipeIngredient {
  inventory_item_name: string;  // Match to inventory_items.item_name
  quantity_per_serving: number;  // Amount needed per guest
  unit: string;                  // Should match inventory unit
}

export interface Recipe {
  menu_item_name: string;
  ingredients: RecipeIngredient[];
}

/**
 * SPIT BRAAI DELIVERY - RECIPE MAPPINGS
 * Based on actual menu from spitbraaidelivery.co.za
 * 
 * Maps menu items to their required inventory ingredients with quantities per serving
 */
export const RECIPE_MAPPINGS: Recipe[] = [
  // ============================================
  // MEATS - MAIN DISHES
  // ============================================
  {
    menu_item_name: "Lamb Spit (200g)",
    ingredients: [
      { inventory_item_name: "Lamb Leg (whole)", quantity_per_serving: 0.2, unit: "kg" },
      { inventory_item_name: "BBQ Marinade", quantity_per_serving: 0.03, unit: "L" },
      { inventory_item_name: "Mixed Herbs & Spices", quantity_per_serving: 0.005, unit: "kg" },
    ],
  },
  {
    menu_item_name: "Lamb Spit (100g)",
    ingredients: [
      { inventory_item_name: "Lamb Leg (whole)", quantity_per_serving: 0.1, unit: "kg" },
      { inventory_item_name: "BBQ Marinade", quantity_per_serving: 0.015, unit: "L" },
      { inventory_item_name: "Mixed Herbs & Spices", quantity_per_serving: 0.003, unit: "kg" },
    ],
  },
  {
    menu_item_name: "Chicken Quarter",
    ingredients: [
      { inventory_item_name: "Chicken Quarters", quantity_per_serving: 1, unit: "units" },
      { inventory_item_name: "Chicken Marinade", quantity_per_serving: 0.025, unit: "L" },
      { inventory_item_name: "Mixed Herbs & Spices", quantity_per_serving: 0.003, unit: "kg" },
    ],
  },
  {
    menu_item_name: "Lamb Ribs (300g)",
    ingredients: [
      { inventory_item_name: "Lamb Ribs", quantity_per_serving: 0.3, unit: "kg" },
      { inventory_item_name: "BBQ Marinade", quantity_per_serving: 0.02, unit: "L" },
      { inventory_item_name: "Mixed Herbs & Spices", quantity_per_serving: 0.005, unit: "kg" },
    ],
  },
  {
    menu_item_name: "Lamb Ribs (600g)",
    ingredients: [
      { inventory_item_name: "Lamb Ribs", quantity_per_serving: 0.6, unit: "kg" },
      { inventory_item_name: "BBQ Marinade", quantity_per_serving: 0.04, unit: "L" },
      { inventory_item_name: "Mixed Herbs & Spices", quantity_per_serving: 0.008, unit: "kg" },
    ],
  },
  {
    menu_item_name: "Boerewors",
    ingredients: [
      { inventory_item_name: "Boerewors", quantity_per_serving: 0.15, unit: "kg" },
    ],
  },
  {
    menu_item_name: "Beef Burgers",
    ingredients: [
      { inventory_item_name: "Beef Mince (Premium)", quantity_per_serving: 0.15, unit: "kg" },
      { inventory_item_name: "Bread Loaves", quantity_per_serving: 0.1, unit: "units" },
      { inventory_item_name: "Mixed Herbs & Spices", quantity_per_serving: 0.003, unit: "kg" },
    ],
  },
  {
    menu_item_name: "Vegetarian Lasagne",
    ingredients: [
      { inventory_item_name: "Pasta (various)", quantity_per_serving: 0.12, unit: "kg" },
      { inventory_item_name: "Mixed Vegetables", quantity_per_serving: 0.15, unit: "kg" },
      { inventory_item_name: "Tomatoes", quantity_per_serving: 0.08, unit: "kg" },
      { inventory_item_name: "Feta Cheese", quantity_per_serving: 0.04, unit: "kg" },
    ],
  },

  // ============================================
  // STARTERS
  // ============================================
  {
    menu_item_name: "Lamb Rib Starter",
    ingredients: [
      { inventory_item_name: "Lamb Ribs", quantity_per_serving: 0.15, unit: "kg" },
      { inventory_item_name: "BBQ Marinade", quantity_per_serving: 0.015, unit: "L" },
      { inventory_item_name: "Mixed Herbs & Spices", quantity_per_serving: 0.003, unit: "kg" },
    ],
  },
  {
    menu_item_name: "Sticky Chicken Wings",
    ingredients: [
      { inventory_item_name: "Chicken Wings", quantity_per_serving: 0.2, unit: "kg" },
      { inventory_item_name: "Chicken Marinade", quantity_per_serving: 0.03, unit: "L" },
      { inventory_item_name: "Sugar", quantity_per_serving: 0.01, unit: "kg" },
    ],
  },
  {
    menu_item_name: "Spicy Beef Strips",
    ingredients: [
      { inventory_item_name: "Beef Strips", quantity_per_serving: 0.12, unit: "kg" },
      { inventory_item_name: "BBQ Marinade", quantity_per_serving: 0.02, unit: "L" },
      { inventory_item_name: "Mixed Herbs & Spices", quantity_per_serving: 0.005, unit: "kg" },
    ],
  },

  // ============================================
  // SIDES - STARCH
  // ============================================
  {
    menu_item_name: "Baby Potatoes",
    ingredients: [
      { inventory_item_name: "Potatoes", quantity_per_serving: 0.2, unit: "kg" },
      { inventory_item_name: "Olive Oil", quantity_per_serving: 0.01, unit: "L" },
      { inventory_item_name: "Mixed Herbs & Spices", quantity_per_serving: 0.003, unit: "kg" },
    ],
  },
  {
    menu_item_name: "Potato Salad",
    ingredients: [
      { inventory_item_name: "Potatoes", quantity_per_serving: 0.18, unit: "kg" },
      { inventory_item_name: "Mayonnaise", quantity_per_serving: 0.03, unit: "L" },
      { inventory_item_name: "Red Onions", quantity_per_serving: 0.02, unit: "kg" },
      { inventory_item_name: "Mixed Herbs & Spices", quantity_per_serving: 0.002, unit: "kg" },
    ],
  },

  // ============================================
  // SIDES - SALADS
  // ============================================
  {
    menu_item_name: "Green Salad",
    ingredients: [
      { inventory_item_name: "Lettuce", quantity_per_serving: 0.08, unit: "kg" },
      { inventory_item_name: "Cucumbers", quantity_per_serving: 0.04, unit: "kg" },
      { inventory_item_name: "Olive Oil", quantity_per_serving: 0.01, unit: "L" },
      { inventory_item_name: "Balsamic Vinegar", quantity_per_serving: 0.005, unit: "L" },
    ],
  },
  {
    menu_item_name: "Greek Salad",
    ingredients: [
      { inventory_item_name: "Lettuce", quantity_per_serving: 0.05, unit: "kg" },
      { inventory_item_name: "Tomatoes", quantity_per_serving: 0.1, unit: "kg" },
      { inventory_item_name: "Cucumbers", quantity_per_serving: 0.05, unit: "kg" },
      { inventory_item_name: "Feta Cheese", quantity_per_serving: 0.03, unit: "kg" },
      { inventory_item_name: "Red Onions", quantity_per_serving: 0.02, unit: "kg" },
      { inventory_item_name: "Olive Oil", quantity_per_serving: 0.01, unit: "L" },
    ],
  },
  {
    menu_item_name: "Pasta Vinaigrette",
    ingredients: [
      { inventory_item_name: "Pasta (various)", quantity_per_serving: 0.1, unit: "kg" },
      { inventory_item_name: "Mixed Vegetables", quantity_per_serving: 0.06, unit: "kg" },
      { inventory_item_name: "Olive Oil", quantity_per_serving: 0.015, unit: "L" },
      { inventory_item_name: "Balsamic Vinegar", quantity_per_serving: 0.01, unit: "L" },
    ],
  },
  {
    menu_item_name: "Curry-Noodle Pasta",
    ingredients: [
      { inventory_item_name: "Pasta (various)", quantity_per_serving: 0.1, unit: "kg" },
      { inventory_item_name: "Mixed Vegetables", quantity_per_serving: 0.05, unit: "kg" },
      { inventory_item_name: "Mayonnaise", quantity_per_serving: 0.02, unit: "L" },
      { inventory_item_name: "Mixed Herbs & Spices", quantity_per_serving: 0.003, unit: "kg" },
    ],
  },
  {
    menu_item_name: "Pasta Salad",
    ingredients: [
      { inventory_item_name: "Pasta (various)", quantity_per_serving: 0.1, unit: "kg" },
      { inventory_item_name: "Tomatoes", quantity_per_serving: 0.05, unit: "kg" },
      { inventory_item_name: "Cucumbers", quantity_per_serving: 0.03, unit: "kg" },
      { inventory_item_name: "Mayonnaise", quantity_per_serving: 0.02, unit: "L" },
    ],
  },
  {
    menu_item_name: "Coleslaw",
    ingredients: [
      { inventory_item_name: "Cabbage", quantity_per_serving: 0.1, unit: "kg" },
      { inventory_item_name: "Carrots", quantity_per_serving: 0.05, unit: "kg" },
      { inventory_item_name: "Mayonnaise", quantity_per_serving: 0.02, unit: "L" },
    ],
  },
  {
    menu_item_name: "Rice Salad",
    ingredients: [
      { inventory_item_name: "Rice", quantity_per_serving: 0.08, unit: "kg" },
      { inventory_item_name: "Mixed Vegetables", quantity_per_serving: 0.06, unit: "kg" },
      { inventory_item_name: "Olive Oil", quantity_per_serving: 0.01, unit: "L" },
    ],
  },
  {
    menu_item_name: "Mixed Chunky Veg",
    ingredients: [
      { inventory_item_name: "Mixed Vegetables", quantity_per_serving: 0.15, unit: "kg" },
      { inventory_item_name: "Olive Oil", quantity_per_serving: 0.01, unit: "L" },
      { inventory_item_name: "Mixed Herbs & Spices", quantity_per_serving: 0.003, unit: "kg" },
    ],
  },

  // ============================================
  // BREADS
  // ============================================
  {
    menu_item_name: "Garlic Bread",
    ingredients: [
      { inventory_item_name: "Bread Loaves", quantity_per_serving: 0.1, unit: "units" },
      { inventory_item_name: "Butter", quantity_per_serving: 0.02, unit: "kg" },
      { inventory_item_name: "Garlic", quantity_per_serving: 0.01, unit: "kg" },
    ],
  },

  // ============================================
  // DESSERTS
  // ============================================
  {
    menu_item_name: "Malva Pudding & Custard",
    ingredients: [
      { inventory_item_name: "Flour", quantity_per_serving: 0.06, unit: "kg" },
      { inventory_item_name: "Sugar", quantity_per_serving: 0.04, unit: "kg" },
      { inventory_item_name: "Butter", quantity_per_serving: 0.02, unit: "kg" },
      { inventory_item_name: "Custard", quantity_per_serving: 0.08, unit: "L" },
      { inventory_item_name: "Caramel (for Malva)", quantity_per_serving: 0.03, unit: "L" },
    ],
  },
  {
    menu_item_name: "Peppermint Crisp Tart",
    ingredients: [
      { inventory_item_name: "Peppermint Crisp Bars", quantity_per_serving: 0.5, unit: "units" },
      { inventory_item_name: "Cream", quantity_per_serving: 0.08, unit: "L" },
    ],
  },
  {
    menu_item_name: "Chocolate Fudge Brownie & Cream",
    ingredients: [
      { inventory_item_name: "Flour", quantity_per_serving: 0.05, unit: "kg" },
      { inventory_item_name: "Chocolate (cooking)", quantity_per_serving: 0.06, unit: "kg" },
      { inventory_item_name: "Sugar", quantity_per_serving: 0.04, unit: "kg" },
      { inventory_item_name: "Butter", quantity_per_serving: 0.03, unit: "kg" },
      { inventory_item_name: "Cream", quantity_per_serving: 0.05, unit: "L" },
    ],
  },

  // ============================================
  // DISPOSABLES & SERVICE
  // ============================================
  {
    menu_item_name: "Knives, Forks & Plates",
    ingredients: [
      { inventory_item_name: "Disposable Plates", quantity_per_serving: 2, unit: "units" },
      { inventory_item_name: "Disposable Cutlery Sets", quantity_per_serving: 1, unit: "sets" },
      { inventory_item_name: "Serviettes", quantity_per_serving: 3, unit: "units" },
    ],
  },
  {
    menu_item_name: "Full Cutlery Set",
    ingredients: [
      { inventory_item_name: "Disposable Plates", quantity_per_serving: 2, unit: "units" },
      { inventory_item_name: "Disposable Bowls", quantity_per_serving: 1, unit: "units" },
      { inventory_item_name: "Disposable Cutlery Sets", quantity_per_serving: 1, unit: "sets" },
      { inventory_item_name: "Serviettes", quantity_per_serving: 4, unit: "units" },
    ],
  },

  // Note: Service items (On-Site Chef, Waiter Service) don't deduct inventory
];

/**
 * Get recipe for a menu item
 */
export function getRecipe(menuItemName: string): Recipe | undefined {
  return RECIPE_MAPPINGS.find(
    r => r.menu_item_name.toLowerCase() === menuItemName.toLowerCase()
  );
}

/**
 * Calculate total ingredient needs for an order
 */
export function calculateIngredientNeeds(
  menuItems: Array<{ name: string; quantity?: number }>,
  guestCount: number
): Map<string, { quantity: number; unit: string }> {
  
  const totalNeeds = new Map<string, { quantity: number; unit: string }>();
  
  for (const item of menuItems) {
    const recipe = getRecipe(item.name);
    if (!recipe) {
      console.warn(`No recipe found for menu item: ${item.name}`);
      continue;
    }
    
    const itemQuantity = item.quantity || 1;
    const servings = guestCount * itemQuantity;
    
    for (const ingredient of recipe.ingredients) {
      const needed = ingredient.quantity_per_serving * servings;
      
      if (totalNeeds.has(ingredient.inventory_item_name)) {
        const existing = totalNeeds.get(ingredient.inventory_item_name)!;
        existing.quantity += needed;
      } else {
        totalNeeds.set(ingredient.inventory_item_name, {
          quantity: needed,
          unit: ingredient.unit
        });
      }
    }
  }
  
  return totalNeeds;
}

/**
 * Deduct inventory for completed order
 */
export async function deductInventoryForOrder(
  orderId: string,
  companyId: string,
  performedBy: string
): Promise<{
  success: boolean;
  deducted: Array<{ item: string; quantity: number; unit: string }>;
  warnings: Array<{ item: string; message: string }>;
  errors: string[];
}> {
  
  const deducted: Array<{ item: string; quantity: number; unit: string }> = [];
  const warnings: Array<{ item: string; message: string }> = [];
  const errors: string[] = [];
  
  try {
    // 1. Get order details
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !orderData) {
      errors.push("Order not found");
      return { success: false, deducted, warnings, errors };
    }

    const order = orderData as any;

    // Idempotency guard. inventory_deducted_at is set once on a
    // successful run; on subsequent calls we no-op so a duplicate
    // status transition / retry / two racing workers don't double-
    // deduct from inventory_items [P1-14]. recalculateInventoryFor
    // Order clears the column before re-running.
    if (order.inventory_deducted_at) {
      warnings.push({
        item: "Order",
        message: `Inventory already deducted at ${order.inventory_deducted_at}. No-op.`,
      });
      return { success: true, deducted, warnings, errors };
    }

    const guestCount = order.final_guest_count || order.guest_count || order.number_of_guests || 0;
    
    if (!order.menu_items || !Array.isArray(order.menu_items)) {
      warnings.push({ item: "Order", message: "No menu items found" });
      return { success: true, deducted, warnings, errors };
    }
    
    // 2. Calculate what needs to be deducted
    const ingredientNeeds = calculateIngredientNeeds(order.menu_items, guestCount);
    
    if (ingredientNeeds.size === 0) {
      warnings.push({ item: "Order", message: "No inventory mappings found for menu items" });
      return { success: true, deducted, warnings, errors };
    }
    
    // 3. Get current inventory levels
    const ingredientNames = Array.from(ingredientNeeds.keys());
    const { data: inventoryItems, error: inventoryError } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("company_id", companyId)
      .in("item_name", ingredientNames);
    
    if (inventoryError) {
      errors.push(`Failed to fetch inventory: ${inventoryError.message}`);
      return { success: false, deducted, warnings, errors };
    }
    
    // 4. Process each ingredient
    for (const [ingredientName, needed] of ingredientNeeds.entries()) {
      const inventoryItem = inventoryItems?.find(
        item => item.item_name.toLowerCase() === ingredientName.toLowerCase()
      );
      
      if (!inventoryItem) {
        warnings.push({
          item: ingredientName,
          message: `Not found in inventory (needed: ${needed.quantity} ${needed.unit})`
        });
        continue;
      }
      
      // Check if there's enough stock
      if (inventoryItem.current_stock < needed.quantity) {
        warnings.push({
          item: ingredientName,
          message: `Insufficient stock (have: ${inventoryItem.current_stock}, need: ${needed.quantity})`
        });
        // Still deduct what we have
      }
      
      const deductAmount = Math.min(inventoryItem.current_stock, needed.quantity);
      const newStock = inventoryItem.current_stock - deductAmount;
      
      // 5. Update inventory stock
      const { error: updateError } = await supabase
        .from("inventory_items")
        .update({ current_stock: newStock })
        .eq("id", inventoryItem.id);
      
      if (updateError) {
        errors.push(`Failed to update ${ingredientName}: ${updateError.message}`);
        continue;
      }
      
      // 6. Create transaction record
      const { error: transactionError } = await supabase
        .from("inventory_transactions")
        .insert({
          company_id: companyId,
          inventory_item_id: inventoryItem.id,
          transaction_type: 'usage',
          quantity: deductAmount,
          notes: `Auto-deducted for order #${orderId.slice(-8)}`,
          performed_by: performedBy
        });
      
      if (transactionError) {
        console.error(`Failed to create transaction for ${ingredientName}:`, transactionError);
      }
      
      deducted.push({
        item: ingredientName,
        quantity: deductAmount,
        unit: needed.unit
      });
      
      // 7. Check if now low stock and create notification
      if (newStock <= inventoryItem.minimum_stock) {
        const title = newStock === 0 ? "Out of Stock Alert" : "Low Stock Alert";
        const message = newStock === 0
          ? `${ingredientName} is out of stock (used in order #${orderId.slice(-8)})`
          : `${ingredientName} is low on stock (${newStock} ${inventoryItem.unit_of_measure} remaining after order #${orderId.slice(-8)})`;

        const { error: notifError } = await supabase
          .from("notifications")
          .insert({
            company_id: companyId,
            user_id: performedBy,
            type: 'stock_low',
            title,
            message,
            related_entity_type: 'inventory_item',
            related_entity_id: inventoryItem.id
          });

        if (notifError) {
          console.error('Failed to create low stock notification:', notifError);
        }

        // Role-fanout to shopping_staff so the procurement team's
        // /team-portal/shopping/notifications inbox has something to
        // act on. Audit Notif G1 + Inventory G6 -- shopping was
        // running blind off the admin's verbal nudges. Non-blocking;
        // a failure here is logged and surfaces in the operator's
        // primary 'stock_low' bell from the insert above. Imported
        // dynamically to avoid widening the module's dependency
        // graph for a sometimes-fired side effect.
        try {
          const { notificationService } = await import("@/services/notificationService");
          await notificationService.broadcastNotification({
            companyId,
            targetRoles: ["shopping_staff" as any],
            title,
            message: `${message}. Add to next shopping run.`,
            type: "stock_low",
            priority: newStock === 0 ? "high" : "normal",
            link: `/team-portal/shopping/inventory?itemId=${inventoryItem.id}`,
            relatedEntityType: "inventory_item",
            relatedEntityId: inventoryItem.id,
          });
        } catch (broadcastErr) {
          console.warn("[inventoryDeduction] shopping broadcast failed:", broadcastErr);
        }
      }
    }
    
    // Stamp inventory_deducted_at on success so a subsequent call
    // no-ops via the guard at the top of the function [P1-14].
    // Cast: column added in 20260507160000 migration, types haven't
    // been regenerated yet.
    if (errors.length === 0 && deducted.length > 0) {
      const { error: stampErr } = await (supabase as any)
        .from("orders")
        .update({ inventory_deducted_at: new Date().toISOString() })
        .eq("id", orderId);
      if (stampErr) {
        console.warn("[deductInventoryForOrder] inventory_deducted_at stamp failed:", stampErr.message);
        warnings.push({
          item: "Order",
          message: "Deduction succeeded but the idempotency stamp failed; a retry could double-deduct.",
        });
      }
    }

    return {
      success: errors.length === 0,
      deducted,
      warnings,
      errors
    };

  } catch (error: any) {
    console.error("Inventory deduction failed:", error);
    errors.push(error.message || "Unknown error");
    return { success: false, deducted, warnings, errors };
  }
}

/**
 * Reverse + re-run inventory deduction for an order. Used by the
 * amendment cascade -- when an admin approves a guest_count or
 * menu_items change, we need to undo the original deduction and
 * deduct against the new order shape.
 *
 * Strategy: look up the prior 'usage' transactions tagged with this
 * order's id, increment each affected item back by the original
 * quantity, and stamp a compensating 'adjustment' transaction.
 * Then re-run deductInventoryForOrder against the now-updated order
 * row. Net result: inventory matches the amended order.
 *
 * Idempotent: a no-op if there were no prior deductions for the
 * order (e.g. if the amendment lands before the deduction worker
 * fires for the first time).
 */
export async function recalculateInventoryForOrder(
  orderId: string,
  companyId: string,
  performedBy: string,
): Promise<{
  success: boolean;
  reversed: number;
  deducted: Array<{ item: string; quantity: number; unit: string }>;
  warnings: Array<{ item: string; message: string }>;
  errors: string[];
}> {
  const orderTag = orderId.slice(-8);
  const errors: string[] = [];
  let reversed = 0;

  try {
    // 1. Pull every prior 'usage' transaction for this order.
    const { data: priorTx, error: txErr } = await (supabase as any)
      .from("inventory_transactions")
      .select("id, inventory_item_id, quantity")
      .eq("company_id", companyId)
      .eq("transaction_type", "usage")
      .ilike("notes", `%order #${orderTag}%`);
    if (txErr) {
      errors.push(`Couldn't read prior transactions: ${txErr.message}`);
      return { success: false, reversed: 0, deducted: [], warnings: [], errors };
    }

    // 2. Reverse each one. Add the deducted quantity back to stock,
    // stamp a compensating 'adjustment' tx so the audit trail shows
    // the reversal explicitly.
    for (const tx of priorTx || []) {
      const { data: item } = await (supabase as any)
        .from("inventory_items")
        .select("current_stock")
        .eq("id", (tx as any).inventory_item_id)
        .maybeSingle();
      if (!item) continue;
      const restored = Number((item as any).current_stock || 0) + Number((tx as any).quantity || 0);
      await (supabase as any)
        .from("inventory_items")
        .update({ current_stock: restored })
        .eq("id", (tx as any).inventory_item_id);
      await (supabase as any)
        .from("inventory_transactions")
        .insert({
          company_id: companyId,
          inventory_item_id: (tx as any).inventory_item_id,
          transaction_type: "adjustment",
          quantity: Number((tx as any).quantity || 0),
          notes: `Reversed for amendment to order #${orderTag}`,
          performed_by: performedBy,
        });
      reversed += 1;
    }

    // 3. Clear the idempotency stamp before re-running, otherwise the
    // guard added in [P1-14] would short-circuit the re-deduction
    // and the amended order would never reflect the new shape.
    await (supabase as any)
      .from("orders")
      .update({ inventory_deducted_at: null })
      .eq("id", orderId);

    // 4. Re-run the deduction. The order row now reflects the amended
    // guest_count / menu_items, so this picks up the new shape.
    const replayed = await deductInventoryForOrder(orderId, companyId, performedBy);

    return {
      success: replayed.success && errors.length === 0,
      reversed,
      deducted: replayed.deducted,
      warnings: replayed.warnings,
      errors: [...errors, ...replayed.errors],
    };
  } catch (e: any) {
    return {
      success: false,
      reversed,
      deducted: [],
      warnings: [],
      errors: [...errors, e?.message || "recalculateInventoryForOrder crashed"],
    };
  }
}

/**
 * Reverse every prior inventory deduction for an order. Used on
 * cancellation -- the previous code path left deductions in place
 * forever, so a 200-guest cancellation permanently removed 40kg of
 * lamb from the books. Reorder thresholds, COGS and pantry counts
 * all went wrong.
 *
 * Symmetric to recalculateInventoryForOrder steps 1+2+3 but does
 * not re-run the deduction (the order is cancelled, no replay).
 *
 * Idempotent: a no-op when there are no prior 'usage' transactions
 * for the order.
 */
export async function reverseInventoryForOrder(
  orderId: string,
  companyId: string,
  performedBy: string,
): Promise<{ success: boolean; reversed: number; errors: string[] }> {
  const orderTag = orderId.slice(-8);
  const errors: string[] = [];
  let reversed = 0;

  try {
    const { data: priorTx, error: txErr } = await (supabase as any)
      .from("inventory_transactions")
      .select("id, inventory_item_id, quantity")
      .eq("company_id", companyId)
      .eq("transaction_type", "usage")
      .ilike("notes", `%order #${orderTag}%`);
    if (txErr) {
      errors.push(`Couldn't read prior transactions: ${txErr.message}`);
      return { success: false, reversed: 0, errors };
    }

    for (const tx of priorTx || []) {
      const { data: item } = await (supabase as any)
        .from("inventory_items")
        .select("current_stock")
        .eq("id", (tx as any).inventory_item_id)
        .maybeSingle();
      if (!item) continue;
      const restored = Number((item as any).current_stock || 0) + Number((tx as any).quantity || 0);
      await (supabase as any)
        .from("inventory_items")
        .update({ current_stock: restored })
        .eq("id", (tx as any).inventory_item_id);
      await (supabase as any)
        .from("inventory_transactions")
        .insert({
          company_id: companyId,
          inventory_item_id: (tx as any).inventory_item_id,
          transaction_type: "adjustment",
          quantity: Number((tx as any).quantity || 0),
          notes: `Reversed on cancellation of order #${orderTag}`,
          performed_by: performedBy,
        });
      reversed += 1;
    }

    // Clear the idempotency stamp so a re-confirmation of the same
    // order (rare but possible via amendment workflow) can re-deduct.
    if (reversed > 0) {
      await (supabase as any)
        .from("orders")
        .update({ inventory_deducted_at: null })
        .eq("id", orderId);
    }

    return { success: errors.length === 0, reversed, errors };
  } catch (e: any) {
    return {
      success: false,
      reversed,
      errors: [...errors, e?.message || "reverseInventoryForOrder crashed"],
    };
  }
}

/**
 * Preview what would be deducted (useful for order creation)
 */
export async function previewInventoryDeduction(
  menuItems: Array<{ name: string; quantity?: number }>,
  guestCount: number,
  companyId: string
): Promise<{
  items: Array<{
    ingredient: string;
    needed: number;
    available: number;
    unit: string;
    sufficient: boolean;
  }>;
  allSufficient: boolean;
}> {
  
  const ingredientNeeds = calculateIngredientNeeds(menuItems, guestCount);
  const ingredientNames = Array.from(ingredientNeeds.keys());
  
  const { data: inventoryItems } = await supabase
    .from("inventory_items")
    .select("item_name, current_stock, unit_of_measure")
    .eq("company_id", companyId)
    .in("item_name", ingredientNames);
  
  const preview = Array.from(ingredientNeeds.entries()).map(([name, { quantity, unit }]) => {
    const inventoryItem = inventoryItems?.find(
      item => item.item_name.toLowerCase() === name.toLowerCase()
    );
    
    return {
      ingredient: name,
      needed: quantity,
      available: inventoryItem?.current_stock || 0,
      unit: unit,
      sufficient: (inventoryItem?.current_stock || 0) >= quantity
    };
  });
  
  return {
    items: preview,
    allSufficient: preview.every(item => item.sufficient)
  };
}

/**
 * Manually deduct inventory (for waste, damaged goods, etc.)
 */
export async function manualInventoryDeduction(
  companyId: string,
  inventoryItemId: string,
  quantity: number,
  transactionType: 'waste' | 'adjustment' | 'transfer' | 'return',
  notes: string,
  performedBy: string
): Promise<{ success: boolean; error?: string }> {
  
  try {
    // Get current stock
    const { data: item, error: fetchError } = await supabase
      .from("inventory_items")
      .select("current_stock, minimum_stock, item_name, unit_of_measure")
      .eq("id", inventoryItemId)
      .single();
    
    if (fetchError || !item) {
      return { success: false, error: "Inventory item not found" };
    }
    
    const newStock = item.current_stock - quantity;
    
    if (newStock < 0) {
      return { success: false, error: "Cannot deduct more than current stock" };
    }
    
    // Update stock
    const { error: updateError } = await supabase
      .from("inventory_items")
      .update({ current_stock: newStock })
      .eq("id", inventoryItemId);
    
    if (updateError) {
      return { success: false, error: updateError.message };
    }
    
    // Create transaction
    await supabase
      .from("inventory_transactions")
      .insert({
        company_id: companyId,
        inventory_item_id: inventoryItemId,
        transaction_type: transactionType,
        quantity: quantity,
        notes: notes,
        performed_by: performedBy
      });
    
    // Check for low stock
    if (newStock <= item.minimum_stock) {
      await supabase
        .from("notifications")
        .insert({
          company_id: companyId,
          user_id: performedBy,
          type: 'stock_low',
          title: newStock === 0 ? 'Out of Stock Alert' : 'Low Stock Alert',
          message: `${item.item_name} is ${newStock === 0 ? 'out of' : 'low on'} stock (${newStock} ${item.unit_of_measure} remaining)`,
          related_entity_type: 'inventory_item',
          related_entity_id: inventoryItemId
        });
    }
    
    return { success: true };
    
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}