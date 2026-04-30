/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Menu service: owner CRUD over the menu_items + recipes + recipe_ingredients
 * chain.
 *
 * One screen, three tables: this service collapses them so the page can read
 * "menu item with its recipe and ingredients" in one fetch and write in one
 * transaction-equivalent flow (insert/update menu item -> upsert recipe ->
 * replace ingredient set -> done).
 *
 * Why DELETE-then-INSERT for ingredients on save?
 *   - The recipe builder UI works in client-side draft rows; tracking which
 *     row is new/edited/deleted across edits is a maintenance burden.
 *   - Ingredient lists are small (typically 5-15 rows) so a wholesale
 *     replace is cheap.
 *   - It also means the owner can reorder, remove, and add ingredients
 *     freely without us having to diff the previous set.
 */
import { supabase } from "@/integrations/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  company_id: string;
  item_name: string;
  category: string | null;
  description: string | null;
  base_price: number;
  cost_per_unit: number | null;
  base_servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  recipe_name: string | null;
  instructions: string | null;
  image_url: string | null;
  dietary_tags: string[] | null;
  allergen_codes: string[] | null;
  allergen_info: string | null;
  requires_advance_notice_hours: number | null;
  is_available: boolean | null;
  active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface RecipeRow {
  id: string;
  company_id: string;
  menu_item_id: string;
  recipe_name: string;
  base_servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  instructions: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface RecipeIngredientRow {
  id?: string;                      // present on existing rows, missing on drafts
  recipe_id?: string;                // set by service on save
  ingredient_name: string;
  quantity: number;
  unit: string;
  inventory_item_id: string | null;
  notes: string | null;
}

/** What the menu page reads per row -- item + a tiny recipe summary */
export interface MenuItemWithRecipeSummary extends MenuItem {
  recipe_id: string | null;
  recipe_ingredient_count: number;
}

/** Detail view used by the edit dialog */
export interface MenuItemFull {
  item: MenuItem;
  recipe: RecipeRow | null;
  ingredients: RecipeIngredientRow[];
}

// ── Reference data the form picks from ────────────────────────────────────

/**
 * Canonical list. Existing data has chaos like 'main' / 'Mains' /
 * 'dessert' / 'Desserts' -- the form normalises onto this list, but we
 * still display the raw category string for legacy rows so nothing
 * disappears from the kitchen.
 */
export const MENU_CATEGORIES = [
  "Starters",
  "Salads",
  "Mains",
  "Sides",
  "Desserts",
  "Drinks",
  "Service",
  "Other",
];

export const DIETARY_TAGS = [
  "vegetarian", "vegan", "halaal", "kosher", "gluten_free",
  "dairy_free", "nut_free", "low_carb", "keto",
];

export const ALLERGEN_CODES = [
  "gluten", "dairy", "egg", "peanut", "tree_nut", "soy",
  "fish", "shellfish", "sesame", "celery", "mustard", "sulphite",
];

export const DEFAULT_UNITS = ["g", "kg", "ml", "L", "tsp", "tbsp", "cup", "piece", "ea", "bunch", "slice"];

// ── Service ──────────────────────────────────────────────────────────────

export const menuService = {
  /**
   * List view -- one row per menu item with a tiny recipe summary so the
   * page can render the "recipe attached" badge without N+1 queries.
   */
  async list(companyId: string, includeArchived = false): Promise<MenuItemWithRecipeSummary[]> {
    let q = supabase
      .from("menu_items")
      .select(`
        *,
        recipes!recipes_menu_item_id_fkey ( id, recipe_ingredients ( id ) )
      `)
      .eq("company_id", companyId)
      .order("category", { ascending: true })
      .order("item_name", { ascending: true });
    if (!includeArchived) q = q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) {
      console.error("menuService.list failed:", error);
      return [];
    }
    return (data || []).map((row: any) => {
      const recipe = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
      const { recipes: _r, ...item } = row;
      return {
        ...(item as MenuItem),
        recipe_id: recipe?.id ?? null,
        recipe_ingredient_count: recipe?.recipe_ingredients?.length ?? 0,
      };
    });
  },

  /**
   * Detail view used by the edit dialog -- single round-trip pulls the
   * item, its recipe, and ingredients.
   */
  async getFull(menuItemId: string): Promise<MenuItemFull | null> {
    const { data: item, error: iErr } = await supabase
      .from("menu_items")
      .select("*")
      .eq("id", menuItemId)
      .maybeSingle();
    if (iErr || !item) {
      console.error("menuService.getFull item failed:", iErr);
      return null;
    }

    const { data: recipe } = await supabase
      .from("recipes")
      .select("*")
      .eq("menu_item_id", menuItemId)
      .maybeSingle();

    const ingredients: RecipeIngredientRow[] = [];
    if (recipe?.id) {
      const { data: ingr } = await supabase
        .from("recipe_ingredients")
        .select("*")
        .eq("recipe_id", recipe.id)
        .order("ingredient_name", { ascending: true });
      for (const r of ingr || []) {
        ingredients.push({
          id: r.id,
          recipe_id: r.recipe_id,
          ingredient_name: r.ingredient_name,
          quantity: Number(r.quantity),
          unit: r.unit,
          inventory_item_id: r.inventory_item_id,
          notes: r.notes,
        });
      }
    }

    return {
      item: item as MenuItem,
      recipe: (recipe as RecipeRow) || null,
      ingredients,
    };
  },

  /**
   * Upsert the menu item row. Returns the saved row (so the caller knows
   * the id of a freshly-created item before saving its recipe).
   */
  async upsertMenuItem(payload: Partial<MenuItem> & { company_id: string; item_name: string; base_price: number }): Promise<MenuItem> {
    const { data, error } = await supabase
      .from("menu_items")
      .upsert(payload as any, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    return data as MenuItem;
  },

  /** Soft-archive a menu item. Recipe + ingredients stay attached; restore is one click. */
  async archiveMenuItem(id: string): Promise<void> {
    const { error } = await supabase
      .from("menu_items")
      .update({ deleted_at: new Date().toISOString(), is_available: false, active: false })
      .eq("id", id);
    if (error) throw error;
  },

  async restoreMenuItem(id: string): Promise<void> {
    const { error } = await supabase
      .from("menu_items")
      .update({ deleted_at: null, is_available: true, active: true })
      .eq("id", id);
    if (error) throw error;
  },

  /**
   * Save the recipe + ingredients for a menu item. Idempotent:
   *   - Upserts the recipe row keyed by menu_item_id (UNIQUE locks the 1:1)
   *   - Wipes existing recipe_ingredients for that recipe and inserts the
   *     new set in one go
   *
   * Pass an empty `ingredients` array to wipe the recipe of all rows but
   * keep it. Pass `null` to delete the recipe entirely.
   */
  async saveRecipe(args: {
    companyId: string;
    menuItemId: string;
    menuItemName: string;
    recipe: {
      base_servings: number;
      prep_time_minutes: number | null;
      cook_time_minutes: number | null;
      instructions: string | null;
    } | null;
    ingredients: RecipeIngredientRow[];
  }): Promise<void> {
    const { companyId, menuItemId, menuItemName, recipe, ingredients } = args;

    // No recipe wanted -> drop any existing recipe (cascade clears
    // ingredients).
    if (!recipe) {
      const { error: dErr } = await supabase
        .from("recipes")
        .delete()
        .eq("menu_item_id", menuItemId);
      if (dErr) throw dErr;
      return;
    }

    // Look up existing recipe id (so we can keep its row id stable across
    // edits and let the UNIQUE constraint do its job).
    const { data: existing } = await supabase
      .from("recipes")
      .select("id")
      .eq("menu_item_id", menuItemId)
      .maybeSingle();

    const recipePayload: any = {
      ...(existing ? { id: existing.id } : {}),
      company_id: companyId,
      menu_item_id: menuItemId,
      recipe_name: menuItemName,
      base_servings: recipe.base_servings,
      prep_time_minutes: recipe.prep_time_minutes,
      cook_time_minutes: recipe.cook_time_minutes,
      instructions: recipe.instructions,
    };

    const { data: savedRecipe, error: rErr } = await supabase
      .from("recipes")
      .upsert(recipePayload, { onConflict: "id" })
      .select()
      .single();
    if (rErr || !savedRecipe) throw rErr || new Error("Could not save recipe");

    // Replace ingredient set -- delete then insert.
    const { error: dErr } = await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("recipe_id", savedRecipe.id);
    if (dErr) throw dErr;

    if (ingredients.length === 0) return;
    const rows = ingredients.map(ing => ({
      recipe_id: savedRecipe.id,
      ingredient_name: ing.ingredient_name.trim(),
      quantity: Number(ing.quantity) || 0,
      unit: ing.unit.trim() || "unit",
      inventory_item_id: ing.inventory_item_id || null,
      notes: ing.notes ? ing.notes.trim() : null,
    }));
    const { error: iErr } = await supabase.from("recipe_ingredients").insert(rows);
    if (iErr) throw iErr;
  },

  /**
   * Inventory items the recipe builder picks from. Owner-side only --
   * pulls cost so they can preview ingredient cost in future, kitchen
   * surface uses the public listing in /shopping/inventory or the kitchen
   * stock page.
   */
  async listInventoryItemsForPicker(companyId: string): Promise<Array<{
    id: string;
    item_name: string;
    unit_of_measure: string;
    category: string | null;
    cost_per_unit: number | null;
    current_stock: number | null;
  }>> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, item_name, unit_of_measure, category, cost_per_unit, current_stock")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("item_name", { ascending: true });
    if (error) {
      console.error("listInventoryItemsForPicker failed:", error);
      return [];
    }
    return (data || []) as any[];
  },
};
