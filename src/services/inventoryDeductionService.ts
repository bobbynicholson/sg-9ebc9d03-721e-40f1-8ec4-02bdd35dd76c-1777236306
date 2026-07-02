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
 * Get recipe for a menu item.
 *
 * Audit (May 2026): RECIPE_MAPPINGS used to be the SOLE source. Every
 * tenant except Spit Braai got zero matches and silently deducted
 * nothing. Now: query the recipes table by company_id, falling back
 * to the hardcoded constant only when the tenant has no DB recipe.
 *
 * Lookup order:
 *   1. recipes WHERE company_id + menu_item_id (exact match)
 *   2. recipes WHERE company_id + recipe_name (case-insensitive)
 *   3. RECIPE_MAPPINGS constant (Spit Braai fallback, name-matched)
 */
export async function getRecipeFromDb(
  companyId: string,
  menuItemNameOrId: { name?: string | null; menu_item_id?: string | null },
): Promise<Recipe | undefined> {
  if (!companyId) return undefined;
  const { name, menu_item_id } = menuItemNameOrId;

  // Build a single SELECT joining recipe_ingredients so we don't
  // round-trip twice per menu item. Use `or` only on the conditions
  // we actually have so we don't accidentally hit unrelated rows.
  const orClauses: string[] = [];
  if (menu_item_id) orClauses.push(`menu_item_id.eq.${menu_item_id}`);
  if (name) {
    // Postgres .or() inside Supabase ilike needs quoting around the
    // pattern argument; escape any commas just in case.
    const safeName = String(name).replace(/[(),]/g, "");
    orClauses.push(`recipe_name.ilike.${safeName}`);
  }
  if (orClauses.length === 0) return undefined;

  const { data, error } = await (supabase as any)
    .from("recipes")
    .select("recipe_name, menu_item_id, recipe_ingredients(ingredient_name, quantity, unit, inventory_item_id)")
    .eq("company_id", companyId)
    .or(orClauses.join(","))
    .limit(1)
    .maybeSingle();
  if (error) console.error("[inventoryDeductionService] recipes lookup failed:", error);

  if (data && Array.isArray((data as any).recipe_ingredients) && (data as any).recipe_ingredients.length > 0) {
    return {
      menu_item_name: (data as any).recipe_name,
      ingredients: ((data as any).recipe_ingredients as any[]).map((ri) => ({
        inventory_item_name: ri.ingredient_name,
        quantity_per_serving: Number(ri.quantity || 0),
        unit: ri.unit || "units",
      })),
    };
  }

  // Fallback: legacy hardcoded constant (Spit Braai's seed recipes).
  // Tenants without a DB recipe still get deductions if their menu
  // names match the seed; new tenants land here too until they
  // populate /admin/inventory-recipes properly.
  if (name) {
    return RECIPE_MAPPINGS.find(
      (r) => r.menu_item_name.toLowerCase() === String(name).toLowerCase(),
    );
  }
  return undefined;
}

/**
 * Legacy synchronous accessor - kept for callers that already had
 * the constant in hand. Prefer `getRecipeFromDb` for new code.
 */
export function getRecipe(menuItemName: string): Recipe | undefined {
  return RECIPE_MAPPINGS.find(
    r => r.menu_item_name.toLowerCase() === menuItemName.toLowerCase()
  );
}

/**
 * Calculate total ingredient needs for an order.
 *
 * Async now - walks the menu items, resolves each recipe via
 * getRecipeFromDb, and aggregates the totals. Caller passes
 * companyId so the per-tenant recipes are honoured.
 */
export async function calculateIngredientNeeds(
  menuItems: Array<{ name: string; quantity?: number; menu_item_id?: string | null }>,
  guestCount: number,
  companyId: string,
): Promise<Map<string, { quantity: number; unit: string }>> {
  const totalNeeds = new Map<string, { quantity: number; unit: string }>();

  for (const item of menuItems) {
    const recipe = await getRecipeFromDb(companyId, {
      name: item.name,
      menu_item_id: item.menu_item_id || null,
    });
    if (!recipe) {
      console.warn(`[inventoryDeductionService] no recipe for menu item: ${item.name}`);
      continue;
    }

    const itemQuantity = item.quantity || 1;
    const servings = guestCount * itemQuantity;

    for (const ingredient of recipe.ingredients) {
      const needed = ingredient.quantity_per_serving * servings;
      const existing = totalNeeds.get(ingredient.inventory_item_name);
      if (existing) {
        existing.quantity += needed;
      } else {
        totalNeeds.set(ingredient.inventory_item_name, {
          quantity: needed,
          unit: ingredient.unit,
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
  // Set once we atomically claim inventory_deducted_at below. Lets the
  // failure paths (and the catch) roll the claim back so a retry can run.
  let claimed = false;

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

    // Audit (May 2026, Item 1 follow-up): orders has NO menu_items
    // column. The previous read returned undefined and the function
    // bailed with "No menu items found" for every order. After Wave
    // 3, line items live in `order_items` (populated by
    // postOrderCreationCascade.step0). Read from there.
    const { data: itemRows, error: itemRowsErr } = await (supabase as any)
      .from("order_items")
      .select("item_name, menu_item_id, quantity")
      .eq("order_id", orderId);
    if (itemRowsErr) console.error("[inventoryDeductionService] order_items lookup failed:", itemRowsErr);
    const menuLines = (itemRows || []).map((r: any) => ({
      name: r.item_name,
      menu_item_id: r.menu_item_id,
      quantity: 1, // per-line guest scaling happens below; quantity here is the line multiplier
    }));

    if (menuLines.length === 0) {
      warnings.push({ item: "Order", message: "No order_items found for this order" });
      return { success: true, deducted, warnings, errors };
    }

    // 2. Calculate what needs to be deducted (async DB recipe lookup)
    const ingredientNeeds = await calculateIngredientNeeds(menuLines, guestCount, companyId);
    
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
    
    // 3b. Atomic claim - the real race guard. The top-of-function check
    // reads inventory_deducted_at from a plain SELECT, so two concurrent
    // "delivered" flips both see null and both deduct (double inventory
    // loss → wrong COGS/margin). A conditional UPDATE ... WHERE
    // inventory_deducted_at IS NULL only ever affects the row for ONE
    // caller; the loser gets 0 rows back and no-ops. Done here (after the
    // no-op early-returns above) so an order with nothing to deduct isn't
    // wrongly marked deducted. On failure we roll this back below so a
    // retry can run [P1-14 hardening].
    {
      const { data: claimRows, error: claimErr } = await (supabase as any)
        .from("orders")
        .update({ inventory_deducted_at: new Date().toISOString() })
        .eq("id", orderId)
        .is("inventory_deducted_at", null)
        .select("id");
      if (claimErr) {
        errors.push(`Couldn't claim inventory deduction: ${claimErr.message}`);
        return { success: false, deducted, warnings, errors };
      }
      if (!claimRows || claimRows.length === 0) {
        // Another worker holds the claim (or it's already deducted).
        warnings.push({ item: "Order", message: "Inventory deduction already claimed/done. No-op." });
        return { success: true, deducted, warnings, errors };
      }
      claimed = true;
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
      
      // 5. Update inventory stock. Prefer the atomic decrement RPC
      // (deduct_inventory_stock) so two orders deducting the same shared
      // ingredient in the same instant can't lose an update. Fall back to
      // the legacy read-modify-write only if the RPC isn't deployed yet,
      // so this is safe to ship before the migration is applied.
      let deductAmount: number;
      let newStock: number;
      const { data: rpcRes, error: rpcErr } = await (supabase as any).rpc(
        "deduct_inventory_stock",
        { p_item_id: inventoryItem.id, p_amount: needed.quantity },
      );
      const rpcMissing =
        !!rpcErr &&
        /function .*deduct_inventory_stock.* does not exist|could not find the function|schema cache/i.test(
          rpcErr.message || "",
        );
      if (rpcErr && !rpcMissing) {
        errors.push(`Failed to update ${ingredientName}: ${rpcErr.message}`);
        continue;
      }
      if (!rpcErr && rpcRes) {
        deductAmount = Number((rpcRes as any).deducted) || 0;
        newStock = Number((rpcRes as any).new_stock) || 0;
      } else {
        // Legacy fallback (non-atomic): RPC not yet applied on this DB.
        deductAmount = Math.min(inventoryItem.current_stock, needed.quantity);
        newStock = inventoryItem.current_stock - deductAmount;
        const { error: updateError } = await supabase
          .from("inventory_items")
          .update({ current_stock: newStock })
          .eq("id", inventoryItem.id);
        if (updateError) {
          errors.push(`Failed to update ${ingredientName}: ${updateError.message}`);
          continue;
        }
      }
      
      // 6. Create transaction record. Stamp unit_cost + order_id so
      // the financial dashboard's COGS pipeline can sum
      // (quantity * unit_cost) over usage transactions joined to
      // paid orders. Audit (May 2026, Item 3): without unit_cost
      // the COGS sum was always 0.
      const { error: transactionError } = await supabase
        .from("inventory_transactions")
        .insert({
          company_id: companyId,
          inventory_item_id: inventoryItem.id,
          transaction_type: 'usage',
          quantity: deductAmount,
          unit_cost: Number((inventoryItem as any).cost_per_unit) || 0,
          order_id: orderId,
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
            // The bell query filters on recipient_id + notification_type
            // (notificationService.getNotifications). Setting only
            // user_id + the enum `type` left recipient_id/notification_type
            // NULL, so this alert never surfaced in anyone's inbox.
            // Ops audit 2026-06-15.
            recipient_id: performedBy,
            user_id: performedBy,
            type: 'stock_low',
            notification_type: 'stock_low',
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
        // act on. Audit Notif G1 + Inventory G6 - shopping was
        // running blind off the admin's verbal nudges. Non-blocking;
        // a failure here is logged and surfaces in the operator's
        // primary 'stock_low' bell from the insert above. Imported
        // dynamically to avoid widening the module's dependency
        // graph for a sometimes-fired side effect.
        try {
          const { notificationService } = await import("@/services/notificationService");
          await notificationService.broadcastNotification({
            companyId,
            // Shopping does the buying, but admins/owners need the same
            // visibility in their bell (they were relying on the single
            // recipient insert above, which only the trigger-er saw).
            targetRoles: ["shopping_staff", "company_admin", "admin", "owner", "super_admin"] as any,
            title,
            message: `${message}. Add to next shopping run.`,
            type: "stock_low",
            priority: newStock === 0 ? "high" : "normal",
            link: `/team-portal/shopping/inventory?itemId=${inventoryItem.id}`,
            relatedEntityType: "inventory_item",
            relatedEntityId: inventoryItem.id,
            dedup: true,
          });
        } catch (broadcastErr) {
          console.warn("[inventoryDeduction] shopping broadcast failed:", broadcastErr);
        }
      }
    }
    
    // inventory_deducted_at was already stamped by the atomic claim above.
    // Release the claim (null it) ONLY when NOTHING was deducted - then a
    // retry can safely re-run from scratch. If some items deducted but
    // others errored (partial failure), KEEP the claim stamped: nulling it
    // would let a retry deduct the already-deducted items a SECOND time
    // (double-deduction). The errors are surfaced to the caller; the
    // shortfall is reconciled via recalculateInventoryForOrder, which
    // reverses prior usage by order_id before re-deducting.
    // [P1-14 + partial-failure double-deduction fix]
    if (claimed && deducted.length === 0) {
      const { error: rbErr } = await (supabase as any)
        .from("orders")
        .update({ inventory_deducted_at: null })
        .eq("id", orderId);
      if (rbErr) console.warn("[deductInventoryForOrder] claim rollback failed:", rbErr.message);
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
    // Release the claim ONLY if nothing was deducted before the crash, so
    // a retry can re-run cleanly. If a partial deduction already landed,
    // keep the claim to avoid double-deducting on retry - recover via
    // recalculateInventoryForOrder (reverses prior usage by order_id).
    if (claimed && deducted.length === 0) {
      try {
        await (supabase as any)
          .from("orders")
          .update({ inventory_deducted_at: null })
          .eq("id", orderId);
      } catch (rbErr) {
        console.warn("[deductInventoryForOrder] claim rollback (catch) failed:", rbErr);
      }
    }
    return { success: false, deducted, warnings, errors };
  }
}

/**
 * Reverse + re-run inventory deduction for an order. Used by the
 * amendment cascade - when an admin approves a guest_count or
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
    // Match on the order_id FK (the deduction stamps it on every usage row),
    // not a `notes ILIKE %order #<last8>%` text scan. The text match was
    // fragile: it broke if the audit note was edited and could in theory
    // match a different order sharing the same 8-char UUID suffix.
    const { data: priorTx, error: txErr } = await (supabase as any)
      .from("inventory_transactions")
      .select("id, inventory_item_id, quantity")
      .eq("company_id", companyId)
      .eq("transaction_type", "usage")
      .eq("order_id", orderId);
    if (txErr) {
      errors.push(`Couldn't read prior transactions: ${txErr.message}`);
      return { success: false, reversed: 0, deducted: [], warnings: [], errors };
    }

    // 2. Reverse each one. Add the deducted quantity back to stock,
    // stamp a compensating 'adjustment' tx so the audit trail shows
    // the reversal explicitly.
    for (const tx of priorTx || []) {
      const { data: item, error: itemErr } = await (supabase as any)
        .from("inventory_items")
        .select("current_stock")
        .eq("id", (tx as any).inventory_item_id)
        .maybeSingle();
      if (itemErr) console.error("[inventoryDeductionService] inventory_items lookup (reverse) failed:", itemErr);
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
 * cancellation - the previous code path left deductions in place
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
    // Match on the order_id FK (the deduction stamps it on every usage row),
    // not a `notes ILIKE %order #<last8>%` text scan. The text match was
    // fragile: it broke if the audit note was edited and could in theory
    // match a different order sharing the same 8-char UUID suffix.
    const { data: priorTx, error: txErr } = await (supabase as any)
      .from("inventory_transactions")
      .select("id, inventory_item_id, quantity")
      .eq("company_id", companyId)
      .eq("transaction_type", "usage")
      .eq("order_id", orderId);
    if (txErr) {
      errors.push(`Couldn't read prior transactions: ${txErr.message}`);
      return { success: false, reversed: 0, errors };
    }

    for (const tx of priorTx || []) {
      const { data: item, error: itemErr } = await (supabase as any)
        .from("inventory_items")
        .select("current_stock")
        .eq("id", (tx as any).inventory_item_id)
        .maybeSingle();
      if (itemErr) console.error("[inventoryDeductionService] inventory_items lookup (reverse) failed:", itemErr);
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
  
  const ingredientNeeds = await calculateIngredientNeeds(menuItems, guestCount, companyId);
  const ingredientNames: string[] = Array.from(ingredientNeeds.keys());
  
  const { data: inventoryItems, error: inventoryItemsErr } = await supabase
    .from("inventory_items")
    .select("item_name, current_stock, unit_of_measure")
    .eq("company_id", companyId)
    .in("item_name", ingredientNames);
  if (inventoryItemsErr) console.error("[inventoryDeductionService] inventory_items lookup failed:", inventoryItemsErr);
  
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
          // recipient_id + notification_type required for the bell to
          // see it (ops audit 2026-06-15) - manualInventoryDeduction has
          // no broadcast fallback, so without these the alert was lost.
          recipient_id: performedBy,
          user_id: performedBy,
          type: 'stock_low',
          notification_type: 'stock_low',
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