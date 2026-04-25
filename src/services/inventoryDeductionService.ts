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
 * RECIPE DATABASE
 * Add your menu items and their ingredient requirements here
 */
export const RECIPE_MAPPINGS: Recipe[] = [
  // Braai Items
  {
    menu_item_name: "Beef Brisket",
    ingredients: [
      { inventory_item_name: "Beef", quantity_per_serving: 0.3, unit: "kg" },
      { inventory_item_name: "BBQ Sauce", quantity_per_serving: 0.05, unit: "L" },
      { inventory_item_name: "Spices", quantity_per_serving: 0.01, unit: "kg" },
    ]
  },
  {
    menu_item_name: "Chicken",
    ingredients: [
      { inventory_item_name: "Chicken", quantity_per_serving: 0.25, unit: "kg" },
      { inventory_item_name: "Marinade", quantity_per_serving: 0.03, unit: "L" },
    ]
  },
  {
    menu_item_name: "Boerewors",
    ingredients: [
      { inventory_item_name: "Boerewors", quantity_per_serving: 0.2, unit: "kg" },
    ]
  },
  {
    menu_item_name: "Lamb Chops",
    ingredients: [
      { inventory_item_name: "Lamb", quantity_per_serving: 0.25, unit: "kg" },
      { inventory_item_name: "Rosemary", quantity_per_serving: 0.005, unit: "kg" },
    ]
  },
  
  // Sides
  {
    menu_item_name: "Pap & Sauce",
    ingredients: [
      { inventory_item_name: "Maize Meal", quantity_per_serving: 0.15, unit: "kg" },
      { inventory_item_name: "Tomato Sauce", quantity_per_serving: 0.1, unit: "L" },
      { inventory_item_name: "Onions", quantity_per_serving: 0.05, unit: "kg" },
    ]
  },
  {
    menu_item_name: "Potato Salad",
    ingredients: [
      { inventory_item_name: "Potatoes", quantity_per_serving: 0.2, unit: "kg" },
      { inventory_item_name: "Mayonnaise", quantity_per_serving: 0.03, unit: "kg" },
      { inventory_item_name: "Onions", quantity_per_serving: 0.02, unit: "kg" },
    ]
  },
  {
    menu_item_name: "Coleslaw",
    ingredients: [
      { inventory_item_name: "Cabbage", quantity_per_serving: 0.1, unit: "kg" },
      { inventory_item_name: "Carrots", quantity_per_serving: 0.05, unit: "kg" },
      { inventory_item_name: "Mayonnaise", quantity_per_serving: 0.02, unit: "kg" },
    ]
  },
  {
    menu_item_name: "Garlic Bread",
    ingredients: [
      { inventory_item_name: "Bread Loaves", quantity_per_serving: 0.1, unit: "units" },
      { inventory_item_name: "Butter", quantity_per_serving: 0.02, unit: "kg" },
      { inventory_item_name: "Garlic", quantity_per_serving: 0.01, unit: "kg" },
    ]
  },
  
  // Salads
  {
    menu_item_name: "Greek Salad",
    ingredients: [
      { inventory_item_name: "Lettuce", quantity_per_serving: 0.08, unit: "kg" },
      { inventory_item_name: "Tomatoes", quantity_per_serving: 0.1, unit: "kg" },
      { inventory_item_name: "Cucumber", quantity_per_serving: 0.05, unit: "kg" },
      { inventory_item_name: "Feta Cheese", quantity_per_serving: 0.03, unit: "kg" },
      { inventory_item_name: "Olive Oil", quantity_per_serving: 0.01, unit: "L" },
    ]
  },
  
  // Beverages
  {
    menu_item_name: "Soft Drinks",
    ingredients: [
      { inventory_item_name: "Soft Drinks", quantity_per_serving: 0.5, unit: "L" },
    ]
  },
  {
    menu_item_name: "Water",
    ingredients: [
      { inventory_item_name: "Bottled Water", quantity_per_serving: 0.5, unit: "L" },
    ]
  },
  
  // Disposables (per guest)
  {
    menu_item_name: "Disposable Plates",
    ingredients: [
      { inventory_item_name: "Plates", quantity_per_serving: 2, unit: "units" },
    ]
  },
  {
    menu_item_name: "Cutlery Set",
    ingredients: [
      { inventory_item_name: "Cutlery", quantity_per_serving: 1, unit: "sets" },
    ]
  },
  {
    menu_item_name: "Serviettes",
    ingredients: [
      { inventory_item_name: "Serviettes", quantity_per_serving: 3, unit: "units" },
    ]
  },
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
        const { error: notifError } = await supabase
          .from("notifications")
          .insert({
            company_id: companyId,
            user_id: performedBy,
            type: 'stock_low',
            title: newStock === 0 ? 'Out of Stock Alert' : 'Low Stock Alert',
            message: newStock === 0 
              ? `${ingredientName} is out of stock (used in order #${orderId.slice(-8)})`
              : `${ingredientName} is low on stock (${newStock} ${inventoryItem.unit_of_measure} remaining after order #${orderId.slice(-8)})`,
            related_entity_type: 'inventory_item',
            related_entity_id: inventoryItem.id
          });
        
        if (notifError) {
          console.error('Failed to create low stock notification:', notifError);
        }
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