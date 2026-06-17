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
  is_buy_and_sell: boolean | null;
  linked_inventory_item_id: string | null;
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

/** What the menu page reads per row - item + a tiny recipe summary */
export interface MenuItemWithRecipeSummary extends MenuItem {
  recipe_id: string | null;
  recipe_ingredient_count: number;
  /** Owner-only cost rollup - null when no recipe or no priced ingredients */
  cost: RecipeCostBreakdown | null;
}

/**
 * Owner-only - the per-recipe cost picture. Surfaces explicit gaps so
 * the owner knows which numbers are partial.
 */
export interface RecipeCostBreakdown {
  /** Total cost to cook the whole recipe at base_servings */
  total_cost: number;
  /** Cost per serving = total_cost / base_servings */
  cost_per_serving: number;
  /** How many ingredient rows the recipe has */
  total_ingredients: number;
  /** How many of those contributed to the cost (linked + costed) */
  contributing: number;
  /** Linked to inventory but the inventory item has no cost_per_unit set */
  missing_cost: number;
  /** Free-text rows - not linked to inventory, can't compute */
  free_text: number;
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
 * 'dessert' / 'Desserts' - the form normalises onto this list, but we
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
  // MNU-B (menu deferred, 2026-05-24): added Equipment + Kids so
  // "Other" stops being the dumping ground for crockery, kiddies
  // meals and the like. Existing "Other" rows stay - the form
  // still displays raw legacy categories - but new entries are
  // steered onto one of these.
  "Equipment",
  "Kids",
  "Service",
  "Other",
];

/**
 * MNU-B: categories that aren't food and shouldn't be nagged for a
 * recipe or a cost number. Used by the stat-tile + per-row chip code
 * to suppress the "Missing recipe" and "Cost incomplete" amber
 * signals. Pre-MNU-B the Waiter / Server item (Service category)
 * counted as a missing-recipe false positive, drowning out a real
 * signal.
 */
export const NON_FOOD_CATEGORIES = new Set(["Service", "Equipment"]);

export const DIETARY_TAGS = [
  "vegetarian", "vegan", "halaal", "kosher", "gluten_free",
  "dairy_free", "nut_free", "low_carb", "keto",
];

export const ALLERGEN_CODES = [
  "gluten", "dairy", "egg", "peanut", "tree_nut", "soy",
  "fish", "shellfish", "sesame", "celery", "mustard", "sulphite",
];

export const DEFAULT_UNITS = ["g", "kg", "ml", "L", "tsp", "tbsp", "cup", "piece", "ea", "bunch", "slice"];

// ── Pure cost helper ─────────────────────────────────────────────────────

/**
 * Compute the per-recipe cost picture from raw ingredient + inventory data.
 *
 * Math: total_cost = sum(quantity * cost_per_unit) for every ingredient
 * that's both linked to inventory AND has a cost_per_unit set. Anything
 * else gets counted as a gap (free_text or missing_cost) so the owner
 * sees how complete the number is.
 *
 * Returns null when there's nothing meaningful to report - no recipe,
 * no ingredients, or zero base_servings.
 */
export function computeRecipeCost(
  baseServings: number | null | undefined,
  ingredients: Array<Pick<RecipeIngredientRow, "quantity" | "inventory_item_id">>,
  inventoryCostById: Map<string, number | null>,
): RecipeCostBreakdown | null {
  const total_ingredients = ingredients.length;
  if (total_ingredients === 0) return null;
  const servings = Number(baseServings || 0);
  if (servings <= 0) return null;

  let total_cost = 0;
  let contributing = 0;
  let missing_cost = 0;
  let free_text = 0;

  for (const ing of ingredients) {
    if (!ing.inventory_item_id) {
      free_text += 1;
      continue;
    }
    const cost = inventoryCostById.get(ing.inventory_item_id);
    if (cost == null || isNaN(Number(cost))) {
      missing_cost += 1;
      continue;
    }
    const line = Number(ing.quantity || 0) * Number(cost);
    if (!isFinite(line)) continue;
    total_cost += line;
    contributing += 1;
  }

  if (contributing === 0) return {
    total_cost: 0,
    cost_per_serving: 0,
    total_ingredients,
    contributing: 0,
    missing_cost,
    free_text,
  };

  return {
    total_cost: Math.round(total_cost * 100) / 100,
    cost_per_serving: Math.round((total_cost / servings) * 100) / 100,
    total_ingredients,
    contributing,
    missing_cost,
    free_text,
  };
}

// ── Service ──────────────────────────────────────────────────────────────

export const menuService = {
  /**
   * List view - one row per menu item with the recipe summary AND the
   * cost rollup so the owner page can render per-serving cost + margin
   * without N+1 queries. Pulls ingredient quantities + inventory cost in
   * the same select so the math runs client-side.
   */
  async list(companyId: string, includeArchived = false): Promise<MenuItemWithRecipeSummary[]> {
    let q = supabase
      .from("menu_items")
      .select(`
        *,
        recipes!recipes_menu_item_id_fkey (
          id,
          base_servings,
          recipe_ingredients (
            id,
            quantity,
            inventory_item_id,
            inventory_items:inventory_item_id ( cost_per_unit )
          )
        )
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
      const ingredients: any[] = recipe?.recipe_ingredients ?? [];
      // Build the cost lookup map from the embed - avoids a second query
      const costLookup = new Map<string, number | null>();
      for (const ing of ingredients) {
        if (ing.inventory_item_id) {
          const inv = Array.isArray(ing.inventory_items) ? ing.inventory_items[0] : ing.inventory_items;
          costLookup.set(ing.inventory_item_id, inv?.cost_per_unit ?? null);
        }
      }
      const cost = recipe
        ? computeRecipeCost(
            recipe.base_servings,
            ingredients.map((i: any) => ({ quantity: Number(i.quantity || 0), inventory_item_id: i.inventory_item_id })),
            costLookup,
          )
        : null;
      return {
        ...(item as MenuItem),
        recipe_id: recipe?.id ?? null,
        recipe_ingredient_count: ingredients.length,
        cost,
      };
    });
  },

  /**
   * Detail view used by the edit dialog - single round-trip pulls the
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

    const { data: recipe, error: recipeErr } = await supabase
      .from("recipes")
      .select("*")
      .eq("menu_item_id", menuItemId)
      .maybeSingle();
    if (recipeErr) console.error("[menuService/getFull] recipes lookup failed:", recipeErr);

    const ingredients: RecipeIngredientRow[] = [];
    if (recipe?.id) {
      const { data: ingr, error: ingrErr } = await supabase
        .from("recipe_ingredients")
        .select("*")
        .eq("recipe_id", recipe.id)
        .order("ingredient_name", { ascending: true });
      if (ingrErr) console.error("[menuService/getFull] recipe_ingredients lookup failed:", ingrErr);
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
    const { data: existing, error: existingErr } = await supabase
      .from("recipes")
      .select("id")
      .eq("menu_item_id", menuItemId)
      .maybeSingle();
    if (existingErr) console.error("[menuService] recipes lookup for upsert failed:", existingErr);

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

    // Replace ingredient set - delete then insert.
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
    allergen_codes: string[] | null;
  }>> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, item_name, unit_of_measure, category, cost_per_unit, current_stock, allergen_codes")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("item_name", { ascending: true });
    if (error) {
      console.error("listInventoryItemsForPicker failed:", error);
      return [];
    }
    return (data || []) as any[];
  },

  /**
   * Lightweight typeahead search used by the New Quote page.
   *
   * Why a dedicated method:
   *   - We want quick name/description/category fuzzy hits without
   *     dragging the recipe / cost embed through. The full list() call
   *     pulls every item plus its joins - overkill for a dropdown.
   *   - Cost data is intentionally NOT returned. Quote authors are
   *     admins who already see costs elsewhere, but the same shape
   *     could later be reused on a public menu surface and we don't
   *     want a stray future caller leaking margins by mistake.
   *
   * Multi-tenancy: eq("company_id", companyId) is the seal - if the
   * caller doesn't pass the right company id, nothing comes back even
   * though RLS would also block it on the server side.
   */
  async searchForQuote(
    companyId: string,
    term: string,
    limit: number = 10,
  ): Promise<Array<{
    id: string;
    item_name: string;
    category: string | null;
    base_price: number;
    description: string | null;
    image_url: string | null;
    dietary_tags: string[] | null;
    allergen_codes: string[] | null;
    base_servings: number | null;
    is_available: boolean | null;
    /** Phase 2 #7: surfaced so the quote builder can warn on
     *  unreviewed items at acceptance time. NULL = never reviewed. */
    allergens_reviewed_at: string | null;
  }>> {
    if (!companyId) return [];
    const t = (term || "").trim();
    let q = supabase
      .from("menu_items")
      .select("id, item_name, category, base_price, description, image_url, dietary_tags, allergen_codes, base_servings, is_available, allergens_reviewed_at")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      // Hide archived/disabled items from quote pickers - the owner
      // can still see them on /admin/menu, but they shouldn't surface
      // when building a new quote.
      .or("is_available.is.null,is_available.eq.true");
    if (t.length >= 2) {
      const like = `%${t}%`;
      q = q.or(`item_name.ilike.${like},description.ilike.${like},category.ilike.${like}`);
    }
    const { data, error } = await q
      .order("item_name", { ascending: true })
      .limit(limit);
    if (error) {
      console.error("menuService.searchForQuote failed:", error);
      return [];
    }
    return (data || []) as any[];
  },

  // ── MNU-B (menu deferred, 2026-05-24) ────────────────────────────

  /**
   * Bulk soft-archive. Sets deleted_at on each id. Each row also
   * gets `is_available = false` so it stops surfacing on quote
   * pickers immediately.
   */
  async bulkArchive(
    companyId: string,
    itemIds: string[],
  ): Promise<{ ok: boolean; count: number; error?: string }> {
    if (itemIds.length === 0) return { ok: true, count: 0 };
    const nowIso = new Date().toISOString();
    const { error, count } = await (supabase as any)
      .from("menu_items")
      .update({ deleted_at: nowIso, is_available: false }, { count: "exact" })
      .eq("company_id", companyId)
      .in("id", itemIds);
    if (error) return { ok: false, count: 0, error: error.message };
    return { ok: true, count: count || itemIds.length };
  },

  /**
   * Bulk category change. Validates against MENU_CATEGORIES but
   * allows arbitrary legacy strings (matching the rest of the
   * service's "display raw, normalise on save" rule).
   */
  async bulkUpdateCategory(
    companyId: string,
    itemIds: string[],
    newCategory: string,
  ): Promise<{ ok: boolean; count: number; error?: string }> {
    if (itemIds.length === 0) return { ok: true, count: 0 };
    const { error, count } = await (supabase as any)
      .from("menu_items")
      .update({ category: newCategory }, { count: "exact" })
      .eq("company_id", companyId)
      .in("id", itemIds);
    if (error) return { ok: false, count: 0, error: error.message };
    return { ok: true, count: count || itemIds.length };
  },

  /**
   * Bulk price adjustment by percentage. Positive = price increase,
   * negative = decrease. New price = current * (1 + pct/100), rounded
   * to 2 decimals. Each row's old price is stamped into
   * menu_item_price_history so the per-item sparkline can render.
   *
   * Returns the count of rows actually updated (items with NULL or 0
   * base_price are skipped - "increase R 0 by 5%" is nonsense).
   */
  async bulkAdjustPrice(
    companyId: string,
    itemIds: string[],
    pctChange: number,
    actorUserId: string | null,
  ): Promise<{ ok: boolean; count: number; error?: string }> {
    if (itemIds.length === 0) return { ok: true, count: 0 };
    if (!Number.isFinite(pctChange)) return { ok: false, count: 0, error: "Invalid percentage" };

    // Pull current prices so we can compute + log to history in one
    // pass. Bulk update via SQL math (base_price * factor) would be
    // cleaner but Supabase REST doesn't support arithmetic updates.
    const { data: rows, error: fetchErr } = await supabase
      .from("menu_items")
      .select("id, base_price")
      .eq("company_id", companyId)
      .in("id", itemIds);
    if (fetchErr) return { ok: false, count: 0, error: fetchErr.message };

    const factor = 1 + pctChange / 100;
    let updated = 0;
    for (const r of (rows || []) as Array<{ id: string; base_price: number | null }>) {
      const current = Number(r.base_price || 0);
      if (current <= 0) continue;
      const next = Math.round(current * factor * 100) / 100;
      const { error: updErr } = await (supabase as any)
        .from("menu_items")
        .update({ base_price: next })
        .eq("id", r.id);
      if (updErr) continue;
      // Best-effort history stamp. Trigger should fire automatically
      // (see migration 20260524100000_menu_item_price_history) but
      // we also write here explicitly for callers that bypass the
      // trigger (e.g. service-role inserts during seed scripts).
      try {
        await (supabase as any).from("menu_item_price_history").insert({
          menu_item_id: r.id,
          old_price: current,
          new_price: next,
          changed_by_user_id: actorUserId,
        });
      } catch { /* trigger covers this */ }
      updated += 1;
    }
    return { ok: true, count: updated };
  },

  /**
   * Bulk allergen-review stamp. Sets allergens_reviewed_at = now()
   * and allergens_reviewed_by = actor on each item.
   */
  async bulkMarkAllergensReviewed(
    companyId: string,
    itemIds: string[],
    actorUserId: string | null,
  ): Promise<{ ok: boolean; count: number; error?: string }> {
    if (itemIds.length === 0) return { ok: true, count: 0 };
    const { error, count } = await (supabase as any)
      .from("menu_items")
      .update({
        allergens_reviewed_at: new Date().toISOString(),
        allergens_reviewed_by: actorUserId,
      }, { count: "exact" })
      .eq("company_id", companyId)
      .in("id", itemIds);
    if (error) return { ok: false, count: 0, error: error.message };
    return { ok: true, count: count || itemIds.length };
  },

  /**
   * Duplicate a menu item with all its fields, recipe, and ingredients.
   * Appends " (copy)" to the name so the uniqueness warning in the
   * save flow doesn't fire on the clone. Returns the new item id.
   *
   * Use case: variant rows like "Crockery & Cutlery Standard" vs
   * "Crockery & Cutlery Premium" where the operator wants a near-
   * identical row with a tweaked price.
   */
  async duplicateItem(
    companyId: string,
    itemId: string,
    actorUserId: string | null,
  ): Promise<{ ok: boolean; newId?: string; error?: string }> {
    const full = await menuService.getFull(itemId);
    if (!full) return { ok: false, error: "Original item not found" };
    const src = full.item as any;
    // Clone the menu_item row (excluding id, timestamps, allergen
    // review state - we don't want to silently inherit the reviewed
    // stamp). Cast through any because the local MenuItem interface
    // is a subset of the real menu_items row (fulfilment_type etc.
    // live on the DB).
    const { data: created, error: insertErr } = await (supabase as any)
      .from("menu_items")
      .insert({
        company_id: companyId,
        item_name: `${src.item_name} (copy)`,
        category: src.category,
        description: src.description,
        base_price: src.base_price,
        cost_per_unit: src.cost_per_unit,
        image_url: src.image_url,
        dietary_tags: src.dietary_tags,
        allergen_codes: src.allergen_codes,
        requires_advance_notice_hours: src.requires_advance_notice_hours,
        is_available: src.is_available,
        is_buy_and_sell: src.is_buy_and_sell,
        linked_inventory_item_id: src.linked_inventory_item_id,
        fulfilment_type: src.fulfilment_type,
        default_outsource_provider_id: src.default_outsource_provider_id,
        outsource_unit_cost: src.outsource_unit_cost,
        outsource_lead_hours: src.outsource_lead_hours,
        prep_time_minutes: src.prep_time_minutes,
        cook_time_minutes: src.cook_time_minutes,
        base_servings: src.base_servings,
        // Pre-OFR-B reviewed_at would have leaked across. Force a
        // fresh review on the clone.
        allergens_reviewed_at: null,
        allergens_reviewed_by: null,
      })
      .select("id")
      .single();
    if (insertErr || !created) return { ok: false, error: insertErr?.message || "Insert failed" };
    const newId = (created as { id: string }).id;

    // Clone the recipe + ingredients if present.
    if (full.recipe) {
      const recipeSrc = full.recipe as any;
      const { data: recipeCreated } = await (supabase as any)
        .from("recipes")
        // Column is recipe_name (not name); recipes has no
        // requires_advance_notice_hours column.
        .insert({
          company_id: companyId,
          menu_item_id: newId,
          recipe_name: recipeSrc.recipe_name ?? recipeSrc.name,
          base_servings: recipeSrc.base_servings,
          prep_time_minutes: recipeSrc.prep_time_minutes,
          cook_time_minutes: recipeSrc.cook_time_minutes,
          instructions: recipeSrc.instructions,
        })
        .select("id")
        .single();
      const newRecipeId = (recipeCreated as { id: string } | null)?.id;
      if (newRecipeId && full.ingredients && full.ingredients.length > 0) {
        const cloneIngs = full.ingredients.map((ing) => {
          const ingSrc = ing as any;
          return {
            recipe_id: newRecipeId,
            inventory_item_id: ingSrc.inventory_item_id,
            free_text_ingredient: ingSrc.free_text_ingredient,
            quantity: ingSrc.quantity,
            unit_of_measure: ingSrc.unit_of_measure,
            sort_order: ingSrc.sort_order,
          };
        });
        await (supabase as any).from("recipe_ingredients").insert(cloneIngs);
      }
    }

    // Best-effort audit row.
    try {
      await (supabase as any).from("audit_logs").insert({
        company_id: companyId,
        user_id: actorUserId,
        action: "menu_item_duplicated",
        entity_type: "menu_item",
        entity_id: newId,
        details: { from_item_id: itemId, from_name: src.item_name },
      });
    } catch { /* non-blocking */ }

    return { ok: true, newId };
  },

  /**
   * Check whether an item name is already in use by an ACTIVE item
   * in this tenant. Returns the offending id when so. Used by the
   * save flow to warn (not block) on duplicates.
   */
  async findDuplicateName(
    companyId: string,
    name: string,
    excludeId?: string,
  ): Promise<string | null> {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    let q = supabase
      .from("menu_items")
      .select("id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .ilike("item_name", trimmed)
      .limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    const rows = (data || []) as Array<{ id: string }>;
    return rows[0]?.id || null;
  },

  /**
   * Per-item price history for the sparkline in the edit dialog.
   * Returns the last 12 rows (newest first) so we can render a
   * compact trend without overwhelming the UI.
   */
  async getPriceHistory(
    itemId: string,
    limit: number = 12,
  ): Promise<Array<{ old_price: number; new_price: number; changed_at: string }>> {
    // MNU-B: cast through any until the next types regen pulls
    // menu_item_price_history into the generated schema.
    const { data, error } = await (supabase as any)
      .from("menu_item_price_history")
      .select("old_price, new_price, changed_at")
      .eq("menu_item_id", itemId)
      .order("changed_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("menuService.getPriceHistory failed:", error);
      return [];
    }
    return ((data || []) as unknown) as Array<{ old_price: number; new_price: number; changed_at: string }>;
  },
};

/**
 * MNU-B: suggested price from cost-per-serving and a target margin
 * percentage. Returns NULL when there's no cost data - we don't want
 * to suggest a price built on nothing.
 *
 * Target margin defaults to 60% (catering industry rule-of-thumb for
 * food cost: food at 30-35% of menu price, leaving 65-70% margin).
 */
export function suggestedPrice(
  costPerServing: number | null | undefined,
  targetMarginPct: number = 60,
): number | null {
  if (costPerServing == null || costPerServing <= 0) return null;
  if (targetMarginPct >= 100 || targetMarginPct < 0) return null;
  // price = cost / (1 - margin) so the resulting margin pct hits the
  // target. 60% target on R 30 cost = R 75.
  const price = costPerServing / (1 - targetMarginPct / 100);
  return Math.round(price * 100) / 100;
}
