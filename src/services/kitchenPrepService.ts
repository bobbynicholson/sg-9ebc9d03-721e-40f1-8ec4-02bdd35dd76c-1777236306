/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Kitchen prep service: the math layer behind the kitchen flywheel.
 *
 * Three responsibilities, all kept dumb-simple from the user's side:
 *   1. Scale a recipe to guest count - the math that turns "base 10
 *      portions, 1.5kg lamb" into "60 guests = 9kg lamb".
 *   2. Backwards-plan prep tasks at order confirm - "lamb starts at
 *      08:00 because pickup is 12:00 and lamb cooks for 4 hours, with
 *      30 minutes of safety buffer."
 *   3. Aggregate demand across the day so the kitchen sees "you need
 *      14kg lettuce today across 3 orders" instead of three separate
 *      "ok / short" checks that miss the combined shortfall.
 *
 * Recipe lookup follows DB first, then the hardcoded RECIPE_MAPPINGS
 * fallback in inventoryDeductionService - this lets self-service menu
 * editing work today without breaking tenants on the legacy map.
 */
import { supabase } from "@/integrations/supabase/client";
import { getRecipe as getLegacyRecipe } from "./inventoryDeductionService";

// ── Settings ────────────────────────────────────────────────────────────────

export interface KitchenSettings {
  prepSafetyBufferMin: number;     // finish prep this many minutes before pickup
  defaultPrepMinPerDish: number;   // when a menu item has no prep_time_minutes
  defaultCookMinPerDish: number;   // when a menu item has no cook_time_minutes
  autoGeneratePrepTasks: boolean;  // can be disabled per tenant
  overtimeAfterHours: number;      // Phase 4: warn after this many shift hours
  maxHotHoldMin: number;           // Phase 4: warn when ready orders sit longer
  mealBreakAfterHours: number;     // Phase 4: prompt a break after this point
}

const DEFAULT_KITCHEN_SETTINGS: KitchenSettings = {
  prepSafetyBufferMin: 30,
  defaultPrepMinPerDish: 15,
  defaultCookMinPerDish: 30,
  autoGeneratePrepTasks: true,
  overtimeAfterHours: 9,
  maxHotHoldMin: 90,
  mealBreakAfterHours: 5,
};

// ── Types ───────────────────────────────────────────────────────────────────

export interface ScaledIngredient {
  name: string;
  base_quantity: number;
  base_unit: string;
  scaled_quantity: number;
  scaled_unit: string;
  inventory_item_id?: string | null;
}

export interface ScaledRecipe {
  menu_item_name: string;
  base_servings: number;
  scaled_servings: number;
  multiplier: number;
  prep_time_min: number;
  cook_time_min: number;
  ingredients: ScaledIngredient[];
}

export interface PrepTask {
  id?: string;
  company_id?: string;
  region_id?: string | null;
  order_id: string;
  menu_item_name: string;
  task_type: "prep" | "cook" | "cool" | "pack" | "plate";
  start_at: string;            // ISO
  duration_min: number;
  status: "pending" | "in_progress" | "done" | "skipped";
  assigned_chef_id?: string | null;
  notes?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
}

export interface IngredientDemand {
  name: string;
  unit: string;
  total_quantity: number;
  on_hand: number;
  shortfall: number;            // positive = need to buy
  inventory_item_id?: string | null;
  used_by: Array<{ order_id: string; client_name?: string; event_date: string; qty: number }>;
}

export interface KitchenStation {
  id: string;
  company_id: string;
  name: string;
  station_type: "prep" | "cook" | "cold" | "pastry" | "pack" | "hot" | "general";
  display_order: number;
  capacity_minutes_per_shift: number | null;
  is_active: boolean;
  notes: string | null;
}

// ── Settings ────────────────────────────────────────────────────────────────

export const kitchenPrepService = {
  // Wave 70.13 - accept an optional client so server-side callers
  // (regen API, cron, post-creation cascade) can inject the
  // service-role client. Without this, the global anon supabase
  // import has no session on the server and RLS hides every read.
  async getKitchenSettings(companyId: string, client?: typeof supabase): Promise<KitchenSettings> {
    const sb: any = client || supabase;
    const { data, error: error2 } = await sb
      .from("companies")
      .select("kitchen_settings")
      .eq("id", companyId)
      .maybeSingle();
    if (error2) {
      console.error("[kitchenPrepService] companies fetch failed:", error2);
    }
    const raw = (data as any)?.kitchen_settings || {};
    return {
      prepSafetyBufferMin:    Number(raw.prep_safety_buffer_min     ?? DEFAULT_KITCHEN_SETTINGS.prepSafetyBufferMin),
      defaultPrepMinPerDish:  Number(raw.default_prep_min_per_dish  ?? DEFAULT_KITCHEN_SETTINGS.defaultPrepMinPerDish),
      defaultCookMinPerDish:  Number(raw.default_cook_min_per_dish  ?? DEFAULT_KITCHEN_SETTINGS.defaultCookMinPerDish),
      autoGeneratePrepTasks:  Boolean(raw.auto_generate_prep_tasks  ?? DEFAULT_KITCHEN_SETTINGS.autoGeneratePrepTasks),
    };
  },

  async updateKitchenSettings(companyId: string, s: KitchenSettings): Promise<boolean> {
    const payload = {
      prep_safety_buffer_min: s.prepSafetyBufferMin,
      default_prep_min_per_dish: s.defaultPrepMinPerDish,
      default_cook_min_per_dish: s.defaultCookMinPerDish,
      auto_generate_prep_tasks: s.autoGeneratePrepTasks,
    };
    const { error } = await supabase
      .from("companies")
      .update({ kitchen_settings: payload })
      .eq("id", companyId);
    if (error) throw error;
    return true;
  },

  // ── Recipe lookup (DB first, hardcoded fallback) ──────────────────────────

  /**
   * Look up a menu item's recipe. Tries the menu_items + recipes +
   * recipe_ingredients tables first (the modern, tenant-editable path).
   * Falls back to the hardcoded RECIPE_MAPPINGS inside
   * inventoryDeductionService for tenants whose data hasn't been migrated.
   * Returns null when neither path has the recipe.
   */
  async lookupRecipe(companyId: string, menuItemName: string, client?: typeof supabase): Promise<{
    base_servings: number;
    prep_time_min: number;
    cook_time_min: number;
    ingredients: Array<{ name: string; quantity: number; unit: string; inventory_item_id?: string | null }>;
  } | null> {
    // Wave 70.13 - thread the optional client through so server-
    // side regen API + cron callers can read without RLS blocking.
    const sb: any = client || supabase;
    const settings = await this.getKitchenSettings(companyId, client);

    // Try DB: menu_items by name -> recipes -> recipe_ingredients
    const { data: menuItem, error: menuItemErr } = await sb
      .from("menu_items")
      .select("id, item_name, base_servings, prep_time_minutes, cook_time_minutes")
      .eq("company_id", companyId)
      .ilike("item_name", menuItemName.trim())
      .is("deleted_at", null)
      .maybeSingle();
    if (menuItemErr) {
      console.error("[kitchenPrepService] menu_items fetch failed:", menuItemErr);
    }

    if (menuItem?.id) {
      const { data: recipe, error: recipeErr } = await sb
        .from("recipes")
        .select("id, base_servings, prep_time_minutes, cook_time_minutes")
        .eq("menu_item_id", menuItem.id)
        .maybeSingle();
      if (recipeErr) {
        console.error("[kitchenPrepService] recipes fetch failed:", recipeErr);
      }

      if (recipe?.id) {
        const { data: ings, error: ingsErr } = await sb
          .from("recipe_ingredients")
          .select("ingredient_name, quantity, unit, inventory_item_id")
          .eq("recipe_id", recipe.id);
        if (ingsErr) {
          console.error("[kitchenPrepService] recipe_ingredients fetch failed:", ingsErr);
        }

        if (ings && ings.length > 0) {
          return {
            base_servings: Number(recipe.base_servings ?? menuItem.base_servings ?? 1),
            prep_time_min: Number(recipe.prep_time_minutes ?? menuItem.prep_time_minutes ?? settings.defaultPrepMinPerDish),
            cook_time_min: Number(recipe.cook_time_minutes ?? menuItem.cook_time_minutes ?? settings.defaultCookMinPerDish),
            ingredients: ings.map((r: any) => ({
              name: r.ingredient_name,
              quantity: Number(r.quantity || 0),
              unit: r.unit || "unit",
              inventory_item_id: r.inventory_item_id ?? null,
            })),
          };
        }
      }
    }

    // Fallback: hardcoded RECIPE_MAPPINGS in inventoryDeductionService.
    // The legacy shape stores quantity_per_serving (not absolute) and has
    // no prep / cook time, so we wrap and treat base_servings as 1 - the
    // legacy multiplier is already "per guest", so scaledServings is the
    // direct multiplier.
    const fallback = getLegacyRecipe(menuItemName);
    if (fallback) {
      return {
        base_servings: 1,
        prep_time_min: settings.defaultPrepMinPerDish,
        cook_time_min: settings.defaultCookMinPerDish,
        ingredients: (fallback.ingredients || []).map((i: any) => ({
          name: i.inventory_item_name || i.name,
          quantity: Number(i.quantity_per_serving ?? i.quantity ?? 0),
          unit: i.unit || "unit",
        })),
      };
    }

    return null;
  },

  // ── Scaling math ─────────────────────────────────────────────────────────

  /**
   * Scale a recipe to a guest count. Pure maths - no DB writes. The
   * multiplier is `guestCount / base_servings`. Each ingredient quantity
   * is multiplied by it.
   */
  scaleRecipe(menuItemName: string, recipe: {
    base_servings: number;
    prep_time_min: number;
    cook_time_min: number;
    ingredients: Array<{ name: string; quantity: number; unit: string; inventory_item_id?: string | null }>;
  }, scaledServings: number): ScaledRecipe {
    const base = Math.max(1, recipe.base_servings);
    const multiplier = scaledServings / base;
    return {
      menu_item_name: menuItemName,
      base_servings: base,
      scaled_servings: scaledServings,
      multiplier,
      prep_time_min: recipe.prep_time_min,
      cook_time_min: recipe.cook_time_min,
      ingredients: recipe.ingredients.map(i => ({
        name: i.name,
        base_quantity: i.quantity,
        base_unit: i.unit,
        scaled_quantity: Math.round(i.quantity * multiplier * 100) / 100,
        scaled_unit: i.unit,
        inventory_item_id: i.inventory_item_id ?? null,
      })),
    };
  },

  // ── Backwards-planned task generation ─────────────────────────────────────

  /**
   * Build the list of prep tasks needed for an order, scheduled backwards
   * from pickup time. One row per menu item per task_type (prep + cook).
   *
   *   pickup_at = max(pickup_time, event_time)
   *   safety = settings.prep_safety_buffer_min
   *   for each menu item:
   *     cook ends at:    pickup_at - safety
   *     cook starts at:  cook ends at - cook_time_min
   *     prep ends at:    cook starts at
   *     prep starts at:  prep ends at - prep_time_min
   *
   * Pure compute - doesn't write anything. Caller decides what to do
   * with the result.
   */
  async planTasksForOrder(companyId: string, orderId: string, client?: typeof supabase): Promise<PrepTask[]> {
    // Wave 70.13 - accept the optional client. Pre-Wave-70.13 the
    // planner always used the global browser supabase import, which
    // has no session when called from a server-side context (regen
    // API, cron, postCreationCascade). RLS then hid every read and
    // the planner returned [] - ensurePrepTasksForOrder reported
    // "no menu items" even when items existed. Now: thread the
    // client through so the service-role client passed by the API
    // bypasses RLS.
    const sb: any = client || supabase;
    const settings = await this.getKitchenSettings(companyId, client);

    const { data: order, error: orderErr } = await sb
      .from("orders")
      .select("id, company_id, region_id, menu_items, guest_count, final_guest_count, event_date, event_time, pickup_time")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) {
      console.error("[kitchenPrepService] orders fetch failed:", orderErr);
    }
    if (!order) return [];

    // Determine the pickup moment. Prefer pickup_time, else event_time on
    // event_date, else event_date at 12:00. Fall back to "now" defensively.
    const pickupAt = (() => {
      if (order.pickup_time) {
        const dt = new Date(order.pickup_time);
        if (!isNaN(dt.getTime())) return dt;
      }
      if (order.event_date && order.event_time) {
        const dt = new Date(`${order.event_date}T${order.event_time}`);
        if (!isNaN(dt.getTime())) return dt;
      }
      if (order.event_date) {
        const dt = new Date(`${order.event_date}T12:00`);
        if (!isNaN(dt.getTime())) return dt;
      }
      return null;
    })();
    if (!pickupAt) return [];

    const guestCount = Number(order.final_guest_count || order.guest_count || 1);

    // Wave 70.10 - the planner used to only read orders.menu_items
    // (the jsonb snapshot column). For quote-derived orders the
    // canonical line items often live in the order_items table and
    // the jsonb is null until orderSyncService fires - so the
    // planner returned [] and the regen API reported "no menu
    // items" on every same-day order from a quote. Now: if the
    // jsonb is empty, fall back to order_items so the planner
    // works regardless of which write path created the order.
    let items: any[] = Array.isArray(order.menu_items) ? order.menu_items : [];
    if (items.length === 0) {
      // Wave 70.13 - also use the threaded client so this read
      // works server-side.
      const { data: relRows, error: relErr } = await sb
        .from("order_items")
        .select("item_name, menu_item_id, quantity, unit_price, line_total, special_instructions")
        .eq("order_id", orderId);
      if (relErr) {
        console.error("[kitchenPrepService] order_items fallback fetch failed:", relErr);
      }
      items = (relRows as any[] || []).map((r) => ({
        id: r.menu_item_id,
        name: r.item_name,
        quantity: Number(r.quantity || 0),
        unit_price: Number(r.unit_price || 0),
      }));
    }

    const tasks: PrepTask[] = [];
    for (const item of items) {
      const name = item?.name || item?.item_name || item?.menu_item_name;
      if (!name) continue;

      const recipe = await this.lookupRecipe(companyId, name, client);
      const basePrepMin = recipe?.prep_time_min ?? settings.defaultPrepMinPerDish;
      const baseCookMin = recipe?.cook_time_min ?? settings.defaultCookMinPerDish;

      // Audit Kitchen G4: prep/cook minutes from the recipe are
      // expressed per recipe.base_servings (e.g. "cook 4h for 10
      // guests"). The previous code used the recipe value as-is no
      // matter how many guests were on the order, so a 200-guest
      // job was scheduled to cook in 4 hours and ran late.
      //
      // Scale by ceil(guestCount / base_servings) with a parallelism
      // cap so a 5x order doesn't naively become a 5x prep slot --
      // kitchens have multiple stations / ovens. The cap is the
      // configurable parallelism factor on settings; default 3 means
      // we never bill more than 3x the recipe time, which matches
      // a typical small-kitchen layout. Operators can raise it on
      // settings later.
      const baseServings = Math.max(1, Number(recipe?.base_servings ?? 1));
      const rawBatches = Math.ceil(guestCount / baseServings);
      const parallelism = Math.max(1, Number((settings as any).prepParallelism ?? 3));
      const effectiveBatches = Math.max(1, Math.min(rawBatches, parallelism));
      const prepMin = Math.ceil(basePrepMin * effectiveBatches);
      const cookMin = Math.ceil(baseCookMin * effectiveBatches);

      // Backwards plan
      const cookEndsAt = new Date(pickupAt.getTime() - settings.prepSafetyBufferMin * 60_000);
      const cookStartsAt = new Date(cookEndsAt.getTime() - cookMin * 60_000);
      const prepStartsAt = new Date(cookStartsAt.getTime() - prepMin * 60_000);

      // Stamp region_id from the order so RLS region-scoped policies
      // surface this task to the right branch's chefs only. Without
      // this every task lands NULL and is visible company-wide - a
      // cross-branch leak the moment a region_admin signs in.
      const orderRegionId = (order as any).region_id ?? null;

      // Each line yields a prep + cook task (when the recipe defines
      // them). Originally the cook task was nested under the prep gate,
      // so a dish with prep_min=0 and cook_min>0 silently dropped its
      // cook task. Independent gates now - audit Agent 6.
      if (prepMin > 0) {
        tasks.push({
          order_id: orderId,
          company_id: companyId,
          region_id: orderRegionId,
          menu_item_name: name,
          task_type: "prep",
          start_at: prepStartsAt.toISOString(),
          duration_min: prepMin,
          status: "pending",
        });
      }
      if (cookMin > 0) {
        tasks.push({
          order_id: orderId,
          company_id: companyId,
          region_id: orderRegionId,
          menu_item_name: name,
          task_type: "cook",
          start_at: cookStartsAt.toISOString(),
          duration_min: cookMin,
          status: "pending",
        });
      }
    }

    // Sort earliest first
    tasks.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    return tasks;
  },

  /**
   * Generate prep tasks for an order and persist them. Idempotent --
   * deletes any existing pending/in_progress tasks for this order first
   * so a re-run after an event time change doesn't double up. Done /
   * skipped tasks are preserved (history is sacred).
   */
  async ensurePrepTasksForOrder(
    companyId: string,
    orderId: string,
    performedBy?: string,
    client?: typeof supabase,
    opts: { force?: boolean } = {},
  ): Promise<{ created: number; skippedReason?: string }> {
    // Server-safe injection. Browser callers pass nothing and get the
    // global anon client (RLS-gated). Server callers (post-order
    // cascade, leads route) inject a service-role client.
    const sb: any = client || supabase;
    // Wave 70.13 - thread the client through to every nested
    // helper so server-side callers (regen API, cron, cascade)
    // bypass RLS the same way the orderMeta + tasks reads do.
    const settings = await this.getKitchenSettings(companyId, client);
    if (!settings.autoGeneratePrepTasks) return { created: 0, skippedReason: "auto_generate_disabled" };

    // Quarantine guard. Imported orders (rows brought in from a prior
    // system at onboarding time) must not spin up kitchen prep tasks
    // - the events already happened. We check the order row itself
    // for imported_at / comms_paused_until before planning anything.
    const { data: orderMeta, error: orderMetaErr } = await sb
      .from("orders")
      .select("imported_at, comms_paused_until, event_date")
      .eq("id", orderId)
      .maybeSingle();
    if (orderMetaErr) {
      console.error("[kitchenPrepService] orders fetch failed:", orderMetaErr);
    }
    if (orderMeta) {
      const importedAt = (orderMeta as any).imported_at;
      const paused = (orderMeta as any).comms_paused_until;
      const isPaused = paused && new Date(paused) > new Date();
      if (importedAt || isPaused) {
        console.log(`[kitchenPrep] order ${orderId} is in import quarantine - skipping prep generation`);
        return { created: 0, skippedReason: importedAt ? "import_quarantine" : "comms_paused" };
      }
      // Also skip if the event_date is in the past - even fresh
      // status changes on historical orders shouldn't trigger prep.
      //
      // Wave 70.9 - compare YYYY-MM-DD strings lexicographically
      // (ISO dates are lexically sortable). Today's event passes;
      // yesterday's does not.
      //
      // Wave 70.11 - opts.force now also bypasses the past-date
      // guard. A manual operator-triggered regen (e.g. an admin
      // recovering a seed-data order in dev, or backfilling a
      // historical order that needs paperwork) is an explicit
      // override; auto-cascades still respect the date check via
      // force=false.
      if ((orderMeta as any).event_date && !opts.force) {
        const eventDateIso = String((orderMeta as any).event_date).slice(0, 10);
        const todayIso = new Date().toISOString().slice(0, 10);
        if (eventDateIso < todayIso) {
          console.log(`[kitchenPrep] order ${orderId} event_date ${eventDateIso} < today ${todayIso} - skipping prep generation (pass force=true to override)`);
          return { created: 0, skippedReason: "event_in_past" };
        }
      }
    }

    // Idempotency gate. The audit found that re-running this helper
    // would soft-delete + re-insert prep tasks, so a retry on a
    // partially-failed cascade would double-fire. Smallest fix: bail
    // when there are already pending/in_progress tasks for this order.
    //
    // opts.force=true (used by guest-count rescale flows) soft-deletes
    // existing PENDING tasks first and re-plans against the new guest
    // count. In-progress tasks are preserved - the chef has already
    // started, you can't undo that. Audit Kitchen G3.
    const { data: existing, error: existingErr } = await sb
      .from("kitchen_prep_tasks")
      .select("id, status")
      .eq("order_id", orderId)
      .in("status", ["pending", "in_progress"])
      .is("deleted_at", null);
    if (existingErr) {
      console.error("[kitchenPrepService] kitchen_prep_tasks fetch failed:", existingErr);
    }
    if (existing && existing.length > 0) {
      if (opts.force) {
        const pendingIds = (existing as any[])
          .filter((r) => r.status === "pending")
          .map((r) => r.id);
        if (pendingIds.length > 0) {
          await sb
            .from("kitchen_prep_tasks")
            .update({ deleted_at: new Date().toISOString() })
            .in("id", pendingIds);
        }
        // Continue to re-plan below.
      } else {
        console.log(`[kitchenPrep] order ${orderId} already has pending tasks - skipping regen`);
        return { created: 0, skippedReason: "already_has_pending_tasks" };
      }
    }

    const planned = await this.planTasksForOrder(companyId, orderId, client);
    if (planned.length === 0) return { created: 0, skippedReason: "no_menu_items_or_no_pickup_time" };

    // Phase 2: load stations once and auto-assign each task to the right one.
    // Defaults from the migration mean every tenant has Prep / Cook / Cold /
    // Pack out of the box, so this works without admin setup.
    const stations = await this.getStationsForCompany(companyId, client);

    const rows = planned.map(t => ({
      company_id: companyId,
      order_id: orderId,
      // region_id flows from planTasksForOrder - defended here too in
      // case anyone ever calls insert without going through the planner.
      region_id: (t as any).region_id ?? null,
      menu_item_name: t.menu_item_name,
      task_type: t.task_type,
      start_at: t.start_at,
      duration_min: t.duration_min,
      status: "pending",
      station_id: this.pickStationForTask(stations, t.task_type),
    }));

    const { error } = await sb.from("kitchen_prep_tasks").insert(rows);
    if (error) {
      console.error("Error inserting prep tasks:", error);
      return { created: 0, skippedReason: `insert_failed:${error.message}` };
    }
    return { created: rows.length };
  },

  // ── Read tasks ────────────────────────────────────────────────────────────

  async getTasksForOrder(orderId: string): Promise<any[]> {
    const { data, error: error3 } = await supabase
      .from("kitchen_prep_tasks")
      .select("*, chef:assigned_chef_id(full_name)")
      .eq("order_id", orderId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true });
    if (error3) {
      console.error("[kitchenPrepService] kitchen_prep_tasks fetch failed:", error3);
    }
    return data || [];
  },

  /**
   * One-shot summary for an order card on the dashboard kanban: how many
   * tasks total, how many done, what's the next pending task and when
   * does it start.
   */
  async getTaskProgressForOrder(orderId: string): Promise<{
    total: number;
    done: number;
    in_progress: number;
    next_task?: { menu_item_name: string; task_type: string; start_at: string; duration_min: number };
  }> {
    const tasks = await this.getTasksForOrder(orderId);
    const total = tasks.length;
    const done = tasks.filter((t: any) => t.status === "done").length;
    const in_progress = tasks.filter((t: any) => t.status === "in_progress").length;
    const next = tasks.find((t: any) => t.status === "pending" || t.status === "in_progress");
    return {
      total,
      done,
      in_progress,
      next_task: next ? {
        menu_item_name: next.menu_item_name,
        task_type: next.task_type,
        start_at: next.start_at,
        duration_min: next.duration_min,
      } : undefined,
    };
  },

  /**
   * One-shot bulk: progress for many orders at once. Used by the kanban
   * to render % done bars per card without N+1 queries.
   */
  async getProgressByOrder(orderIds: string[]): Promise<Record<string, { total: number; done: number }>> {
    if (orderIds.length === 0) return {};
    const { data, error: error4 } = await supabase
      .from("kitchen_prep_tasks")
      .select("order_id, status")
      .in("order_id", orderIds)
      .is("deleted_at", null);
    if (error4) {
      console.error("[kitchenPrepService] kitchen_prep_tasks fetch failed:", error4);
    }
    const out: Record<string, { total: number; done: number }> = {};
    for (const id of orderIds) out[id] = { total: 0, done: 0 };
    for (const t of (data || []) as any[]) {
      out[t.order_id] = out[t.order_id] || { total: 0, done: 0 };
      out[t.order_id].total += 1;
      if (t.status === "done") out[t.order_id].done += 1;
    }
    return out;
  },

  // ── Tick-off ──────────────────────────────────────────────────────────────

  async startTask(taskId: string, performedBy: string): Promise<boolean> {
    const { error } = await supabase
      .from("kitchen_prep_tasks")
      .update({
        status: "in_progress",
        started_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    if (error) throw error;
    return true;
  },

  async completeTask(taskId: string, performedBy: string, notes?: string): Promise<boolean> {
    const { data: updated, error } = await supabase
      .from("kitchen_prep_tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        completed_by: performedBy,
        ...(notes ? { notes } : {}),
      })
      .eq("id", taskId)
      .select("order_id")
      .single();
    if (error) throw error;

    // Wave 25: chain reaction. When this task completion brings the
    // order to "all prep tasks done", auto-flip orders.status to
    // 'ready' so the dispatch dashboard sees the order without the
    // chef having to also tap an "all done" button. Best-effort - a
    // failure to compute or flip never undoes the task completion
    // itself, the operator can still flip status manually from
    // /admin/orders.
    const orderId = (updated as any)?.order_id as string | undefined;
    if (orderId) {
      try {
        await this.checkPrepCompleteForOrder(orderId, performedBy);
      } catch (e) {
        console.warn("[kitchenPrepService] checkPrepCompleteForOrder failed:", e);
      }
    }
    return true;
  },

  /**
   * Wave 25: when ALL non-skipped kitchen_prep_tasks for an order are
   * status='done', auto-promote the order to status='ready' (and
   * stamp ready_at). Idempotent - if the order is already past
   * 'ready' (in_transit / delivered / completed) we no-op so a late
   * task completion doesn't drag the status backwards.
   */
  async checkPrepCompleteForOrder(orderId: string, _performedBy: string): Promise<{ promoted: boolean }> {
    const { data: tasks, error: tasksErr } = await supabase
      .from("kitchen_prep_tasks")
      .select("status")
      .eq("order_id", orderId);
    if (tasksErr) {
      console.error("[kitchenPrepService] kitchen_prep_tasks fetch failed:", tasksErr);
    }
    if (!tasks || tasks.length === 0) return { promoted: false };
    const active = tasks.filter((t: any) => String(t?.status || "") !== "skipped");
    const allDone = active.length > 0 && active.every((t: any) => String(t?.status || "") === "done");
    if (!allDone) return { promoted: false };

    const { data: order, error: orderErr2 } = await supabase
      .from("orders")
      .select("id, status, ready_at")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr2) {
      console.error("[kitchenPrepService] orders fetch failed:", orderErr2);
    }
    if (!order) return { promoted: false };
    const currentStatus = String((order as any).status || "").toLowerCase();
    // Statuses already past 'ready' - don't drag the order backwards.
    if (["ready", "in_transit", "delivered", "completed", "cancelled"].includes(currentStatus)) {
      return { promoted: false };
    }
    // Use the canonical updateOrderStatus path so notifications +
    // audit_logs + downstream hooks fire consistently with manual
    // status flips. Lazy import to avoid a circular dep at module
    // load (orderWorkflow imports kitchenPrepService for the
    // ensurePrepTasksForOrder reverse direction).
    try {
      const { updateOrderStatus } = await import("./order/orderWorkflow");
      await (updateOrderStatus as any)(orderId, "ready");
      return { promoted: true };
    } catch (e) {
      console.warn("[kitchenPrepService] auto-promote to ready failed:", e);
      return { promoted: false };
    }
  },

  async skipTask(taskId: string, performedBy: string, reason?: string): Promise<boolean> {
    const { error } = await supabase
      .from("kitchen_prep_tasks")
      .update({
        status: "skipped",
        completed_at: new Date().toISOString(),
        completed_by: performedBy,
        notes: reason ?? "Skipped",
      })
      .eq("id", taskId);
    if (error) throw error;
    return true;
  },

  // ── Aggregated demand ─────────────────────────────────────────────────────

  /**
   * Day-level (or range-level) ingredient demand across every confirmed
   * order. Sums what every order needs, joins to inventory on hand, and
   * computes shortfall = max(0, total_demand - on_hand). This is the
   * math that catches "two orders both need 10kg lettuce, you only have
   * 12kg" - one banner instead of two ok / short labels that lie.
   *
   * Pass `regionId` to scope the demand to a single branch:
   *   * Only orders for that branch are aggregated.
   *   * Inventory is sourced from getInventoryForRegion(regionId): the
   *     branch's pinned pool plus shared (company-wide) items. Stock
   *     pinned to other branches is invisible - so a CPT prep run
   *     doesn't think it can draw on JHB's chicken.
   * Pass null to get the company-wide view (legacy behaviour).
   */
  async getAggregatedDemand(
    companyId: string,
    fromDate: string,
    toDate: string,
    regionId: string | null = null,
  ): Promise<IngredientDemand[]> {
    // Pull confirmed / preparing / ready orders in the date window
    let ordersQuery = supabase
      .from("orders")
      .select("id, client_name, event_date, menu_items, guest_count, final_guest_count, status, region_id")
      .eq("company_id", companyId)
      .gte("event_date", fromDate)
      .lte("event_date", toDate)
      .in("status", ["confirmed", "preparing", "ready"]);
    if (regionId) {
      // Same fall-through rule as RLS: branch rows + null/legacy
      // (company-wide) rows. Without the OR a region_admin would lose
      // visibility on legacy orders that never got stamped.
      ordersQuery = ordersQuery.or(`region_id.eq.${regionId},region_id.is.null`);
    }
    const { data: orders } = await ordersQuery;
    if (!orders || orders.length === 0) return [];

    // Aggregate demand per ingredient name
    const demandByIngredient = new Map<string, IngredientDemand>();

    for (const order of orders as any[]) {
      const guestCount = Number(order.final_guest_count || order.guest_count || 1);
      const items: any[] = Array.isArray(order.menu_items) ? order.menu_items : [];

      for (const item of items) {
        const name = item?.name || item?.item_name || item?.menu_item_name;
        if (!name) continue;

        const recipe = await this.lookupRecipe(companyId, name);
        if (!recipe) continue;

        const scaled = this.scaleRecipe(name, recipe, guestCount * Number(item?.quantity ?? 1));

        for (const ing of scaled.ingredients) {
          const key = `${ing.name.toLowerCase()}|${ing.scaled_unit.toLowerCase()}`;
          const existing = demandByIngredient.get(key);
          if (existing) {
            existing.total_quantity += ing.scaled_quantity;
            existing.used_by.push({
              order_id: order.id,
              client_name: order.client_name,
              event_date: order.event_date,
              qty: ing.scaled_quantity,
            });
          } else {
            demandByIngredient.set(key, {
              name: ing.name,
              unit: ing.scaled_unit,
              total_quantity: ing.scaled_quantity,
              on_hand: 0,
              shortfall: 0,
              inventory_item_id: ing.inventory_item_id ?? null,
              used_by: [{
                order_id: order.id,
                client_name: order.client_name,
                event_date: order.event_date,
                qty: ing.scaled_quantity,
              }],
            });
          }
        }
      }
    }

    if (demandByIngredient.size === 0) return [];

    // Join to inventory by name to get on_hand. When the caller asked
    // for a region-scoped demand view, only consider the branch's own
    // pool plus shared items so the shortfall numbers reflect what
    // that kitchen can actually draw on.
    let invQuery = supabase
      .from("inventory_items")
      .select("id, item_name, current_stock, unit_of_measure, region_id, is_shared")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    if (regionId) {
      invQuery = invQuery.or(`region_id.eq.${regionId},is_shared.eq.true`);
    }
    const { data: inv } = await invQuery;
    const invByName = new Map<string, any>();
    for (const i of (inv || []) as any[]) {
      invByName.set((i.item_name || "").toLowerCase(), i);
    }

    const out: IngredientDemand[] = [];
    for (const d of demandByIngredient.values()) {
      const match = invByName.get(d.name.toLowerCase());
      d.on_hand = match ? Number(match.current_stock || 0) : 0;
      d.shortfall = Math.max(0, Math.round((d.total_quantity - d.on_hand) * 100) / 100);
      d.total_quantity = Math.round(d.total_quantity * 100) / 100;
      if (match) d.inventory_item_id = match.id;
      out.push(d);
    }

    // Shortfalls first, then by total demand
    out.sort((a, b) => {
      if ((a.shortfall > 0) !== (b.shortfall > 0)) return a.shortfall > 0 ? -1 : 1;
      return b.total_quantity - a.total_quantity;
    });
    return out;
  },

  // ── Hand-offs ─────────────────────────────────────────────────────────────

  async createHandoff(payload: {
    companyId: string;
    authorId: string;
    body: string;
    shiftId?: string;
  }): Promise<boolean> {
    const { error } = await supabase.from("kitchen_handoffs").insert([{
      company_id: payload.companyId,
      author_id: payload.authorId,
      shift_id: payload.shiftId || null,
      body: payload.body.trim(),
    }]);
    if (error) throw error;
    return true;
  },

  async getRecentHandoffs(companyId: string, limit = 20): Promise<any[]> {
    const { data, error: error5 } = await supabase
      .from("kitchen_handoffs")
      .select("*, author:author_id(full_name)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error5) {
      console.error("[kitchenPrepService] kitchen_handoffs fetch failed:", error5);
    }
    return data || [];
  },

  async acknowledgeHandoff(id: string, performedBy: string): Promise<boolean> {
    const { error } = await supabase
      .from("kitchen_handoffs")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: performedBy })
      .eq("id", id);
    if (error) throw error;
    return true;
  },

  // ── Phase 2: stations ─────────────────────────────────────────────────────

  /**
   * Active stations for a company, ordered by display_order. The migration
   * seeds defaults (Prep / Cook / Cold prep / Pack) for every existing
   * tenant - this method is also defensive: if a tenant somehow has no
   * stations yet, returns an empty array and the production page handles
   * "no stations configured" gracefully.
   */
  async getStationsForCompany(companyId: string, client?: typeof supabase): Promise<KitchenStation[]> {
    // Wave 70.13 - thread the client through for server-side callers.
    const sb: any = client || supabase;
    const { data, error } = await sb
      .from("kitchen_stations")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("display_order", { ascending: true });
    if (error) {
      console.error("Error fetching stations:", error);
      return [];
    }
    return (data || []) as KitchenStation[];
  },

  /**
   * Find the right station for a task. Maps task_type to a station_type
   * preference: prep -> prep, cook -> cook (or hot), pack -> pack, plate
   * -> pack, cool -> general. Falls back to the first active station so
   * tasks always get assigned somewhere visible.
   */
  pickStationForTask(stations: KitchenStation[], taskType: string): string | null {
    if (stations.length === 0) return null;
    const preferences: Record<string, string[]> = {
      prep:  ["prep", "cold", "general"],
      cook:  ["cook", "hot", "general"],
      cool:  ["cold", "general", "prep"],
      pack:  ["pack", "general"],
      plate: ["pack", "general"],
    };
    const wantTypes = preferences[taskType] || ["general", "prep"];
    for (const want of wantTypes) {
      const match = stations.find(s => s.station_type === want);
      if (match) return match.id;
    }
    return stations[0].id;
  },

  async upsertStation(station: Partial<KitchenStation> & { company_id: string; name: string }): Promise<KitchenStation | null> {
    const payload: any = {
      company_id: station.company_id,
      name: station.name.trim(),
      station_type: station.station_type ?? "general",
      display_order: station.display_order ?? 99,
      capacity_minutes_per_shift: station.capacity_minutes_per_shift ?? null,
      is_active: station.is_active ?? true,
      notes: station.notes ?? null,
    };
    if (station.id) {
      const { data, error } = await supabase
        .from("kitchen_stations").update(payload).eq("id", station.id).select().single();
      if (error) throw error;
      return data as KitchenStation;
    }
    const { data, error } = await supabase
      .from("kitchen_stations").insert([payload]).select().single();
    if (error) throw error;
    return data as KitchenStation;
  },

  async deleteStation(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("kitchen_stations")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", id);
    if (error) throw error;
    return true;
  },

  /**
   * Tasks for the company in a date range, joined with station info. This
   * is what the production timeline reads - one query, all the data the
   * day view needs.
   */
  async getTasksForDateRange(companyId: string, fromISO: string, toISO: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("kitchen_prep_tasks")
      .select(`
        *,
        order:order_id ( id, event_name, client_name, event_date, event_time, guest_count, status ),
        station:station_id ( id, name, station_type, display_order ),
        chef:assigned_chef_id ( full_name )
      `)
      .eq("company_id", companyId)
      .gte("start_at", fromISO)
      .lt("start_at", toISO)
      .is("deleted_at", null)
      .order("start_at", { ascending: true });
    if (error) {
      console.error("Error fetching tasks for range:", error);
      return [];
    }
    return data || [];
  },

  // ── Phase 3: allergen cross-check ─────────────────────────────────────────
  /**
   * Cross-check the customer's stated dietary requirements against the
   * allergen codes on every menu item in the order. Returns any matches plus
   * a clean message for the confirm dialog. Zero-config: works the moment
   * menu items have allergen_codes set; quietly returns no matches otherwise.
   */
  async checkOrderAllergens(orderId: string): Promise<{
    hasConflicts: boolean;
    conflicts: Array<{ menuItem: string; allergens: string[] }>;
    dietaryRequirements: string;
  }> {
    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, dietary_requirements, special_instructions")
      .eq("id", orderId)
      .single();
    if (oErr || !order) return { hasConflicts: false, conflicts: [], dietaryRequirements: "" };

    const dietary = (order.dietary_requirements || "") + " " + (order.special_instructions || "");
    const dietaryLower = dietary.toLowerCase().trim();
    if (!dietaryLower) return { hasConflicts: false, conflicts: [], dietaryRequirements: "" };

    const { data: items, error: itemsErr } = await supabase
      .from("order_items")
      .select("item_name, menu_item_id, menu_items:menu_item_id ( allergen_codes, allergen_info )")
      .eq("order_id", orderId);
    if (itemsErr) {
      console.error("[kitchenPrepService] order_items fetch failed:", itemsErr);
    }

    const conflicts: Array<{ menuItem: string; allergens: string[] }> = [];
    for (const it of (items as any[]) || []) {
      const codes: string[] = (it.menu_items?.allergen_codes as string[] | null) || [];
      const info: string = it.menu_items?.allergen_info || "";
      const all = [...codes, ...(info ? info.split(/[,;\s]+/) : [])].filter(Boolean);
      const hits = all.filter(code => {
        const c = code.toLowerCase().trim();
        return c.length > 2 && dietaryLower.includes(c);
      });
      if (hits.length > 0) {
        conflicts.push({ menuItem: it.item_name, allergens: Array.from(new Set(hits)) });
      }
    }
    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      dietaryRequirements: order.dietary_requirements || "",
    };
  },

  /**
   * Mark the allergen check passed for an order - stamps every prep task on
   * that order so we have an audit trail of who confirmed it and when.
   */
  async recordAllergenCheck(orderId: string, userId: string, status: "passed" | "overridden"): Promise<void> {
    const { error } = await supabase
      .from("kitchen_prep_tasks")
      .update({
        allergen_check_status: status,
        allergen_check_at: new Date().toISOString(),
        allergen_check_by: userId,
      })
      .eq("order_id", orderId);
    if (error) console.error("Error recording allergen check:", error);
  },

  // ── Phase 3: shopping list from aggregated shortfall ─────────────────────
  /**
   * Turn an aggregated demand projection into a real shopping list row plus
   * line items, one per shortfall. The user goes from "we are short 4kg
   * lettuce + 12kg lamb" to "list created, hand to shopper" in one click.
   */
  async createShoppingListFromShortfall(
    companyId: string,
    userId: string,
    demand: IngredientDemand[],
    period: { from: string; to: string },
    title?: string,
  ): Promise<{ id: string; itemCount: number } | null> {
    const shortfalls = demand.filter(d => d.shortfall > 0);
    if (shortfalls.length === 0) return null;

    const { data: list, error: lErr } = await supabase
      .from("shopping_lists")
      .insert([{
        company_id: companyId,
        user_id: userId,
        list_date: new Date().toISOString().slice(0, 10),
        status: "open",
        source: "kitchen_shortfall",
        source_period_start: period.from,
        source_period_end: period.to,
        title: title || `Kitchen shortfall ${period.from} -> ${period.to}`,
        notes: `Auto-generated from aggregated kitchen demand on ${new Date().toLocaleString()}`,
      }])
      .select()
      .single();
    if (lErr || !list) {
      console.error("Error creating shopping list:", lErr);
      return null;
    }

    const rows = shortfalls.map(s => ({
      shopping_list_id: list.id,
      user_id: userId,
      item_id: s.inventory_item_id ?? null,
      name: s.name,
      quantity: Math.ceil(s.shortfall * 100) / 100,
      unit: s.unit,
      purchased: false,
      notes: `Need ${s.total_quantity} ${s.unit}, have ${s.on_hand}`,
    }));

    const { error: iErr } = await supabase.from("shopping_list_items").insert(rows);
    if (iErr) console.error("Error creating shopping list items:", iErr);

    return { id: list.id, itemCount: rows.length };
  },

  // ── Phase 3: yield variance ──────────────────────────────────────────────
  /**
   * Record actual yield when a task is marked done. The variance can be
   * computed off (actual_yield - planned_yield) / planned_yield - we keep
   * the math out of the DB so it stays simple and readable.
   */
  async recordTaskYield(
    taskId: string,
    actualYield: number,
    yieldUnit?: string,
  ): Promise<void> {
    const patch: Record<string, unknown> = { actual_yield: actualYield };
    if (yieldUnit) patch.yield_unit = yieldUnit;
    const { error } = await supabase
      .from("kitchen_prep_tasks")
      .update(patch)
      .eq("id", taskId);
    if (error) console.error("Error recording yield:", error);
  },

  // ── Phase 3: per-chef performance ────────────────────────────────────────
  /**
   * Roll-up of completed-task stats per chef across a date window. Gives
   * the duty page a "who's pulling weight" view without forcing a separate
   * report screen. Three numbers per chef - count, on-time %, avg yield
   * variance - all derived from kitchen_prep_tasks.
   */
  async getChefPerformance(
    companyId: string,
    fromISO: string,
    toISO: string,
  ): Promise<Array<{
    chef_id: string;
    chef_name: string;
    tasks_completed: number;
    on_time_rate: number;
    avg_yield_variance_pct: number | null;
  }>> {
    const { data, error } = await supabase
      .from("kitchen_prep_tasks")
      .select(`
        assigned_chef_id,
        start_at,
        duration_min,
        completed_at,
        planned_yield,
        actual_yield,
        chef:assigned_chef_id ( full_name )
      `)
      .eq("company_id", companyId)
      .gte("start_at", fromISO)
      .lt("start_at", toISO)
      .not("completed_at", "is", null)
      .not("assigned_chef_id", "is", null)
      .is("deleted_at", null);
    if (error) {
      console.error("Error fetching chef performance:", error);
      return [];
    }

    const buckets = new Map<string, {
      chef_id: string;
      chef_name: string;
      total: number;
      onTime: number;
      varianceSum: number;
      varianceCount: number;
    }>();

    for (const r of (data as any[]) || []) {
      const chefId = r.assigned_chef_id as string;
      const expected = new Date(r.start_at).getTime() + (r.duration_min || 0) * 60_000;
      const actual = new Date(r.completed_at).getTime();
      const onTime = actual <= expected + 5 * 60_000;
      const hasYield = r.planned_yield && r.actual_yield && Number(r.planned_yield) > 0;
      const variancePct = hasYield
        ? ((Number(r.actual_yield) - Number(r.planned_yield)) / Number(r.planned_yield)) * 100
        : null;

      const b = buckets.get(chefId) || {
        chef_id: chefId,
        chef_name: r.chef?.full_name || "Unassigned",
        total: 0,
        onTime: 0,
        varianceSum: 0,
        varianceCount: 0,
      };
      b.total += 1;
      if (onTime) b.onTime += 1;
      if (variancePct !== null) {
        b.varianceSum += variancePct;
        b.varianceCount += 1;
      }
      buckets.set(chefId, b);
    }

    return Array.from(buckets.values()).map(b => ({
      chef_id: b.chef_id,
      chef_name: b.chef_name,
      tasks_completed: b.total,
      on_time_rate: b.total > 0 ? Math.round((b.onTime / b.total) * 100) : 0,
      avg_yield_variance_pct: b.varianceCount > 0
        ? Math.round((b.varianceSum / b.varianceCount) * 10) / 10
        : null,
    })).sort((a, b) => b.tasks_completed - a.tasks_completed);
  },

  // ── Phase 4: shift earnings, breaks, overtime ────────────────────────────
  /**
   * Compute live earnings + overtime status for a single in-progress or
   * completed shift. Pure math: shift duration minus break time, multiplied
   * by hourly_rate. Falls back to safe defaults so the panel never blows up.
   */
  computeShiftEarnings(args: {
    shiftStart: string | null;
    shiftEnd?: string | null;
    breakStartedAt?: string | null;
    totalBreakMin?: number;
    hourlyRate?: number | null;
    settings: Pick<KitchenSettings, "overtimeAfterHours" | "mealBreakAfterHours">;
    now?: Date;
  }): {
    workedMin: number;
    breakMin: number;
    earnings: number | null;
    overtime: boolean;
    overdueBreak: boolean;
  } {
    const now = args.now ?? new Date();
    if (!args.shiftStart) {
      return { workedMin: 0, breakMin: 0, earnings: null, overtime: false, overdueBreak: false };
    }
    const start = new Date(args.shiftStart).getTime();
    const end = args.shiftEnd ? new Date(args.shiftEnd).getTime() : now.getTime();
    const grossMin = Math.max(0, Math.floor((end - start) / 60_000));
    const onBreakMin = args.breakStartedAt && !args.shiftEnd
      ? Math.max(0, Math.floor((now.getTime() - new Date(args.breakStartedAt).getTime()) / 60_000))
      : 0;
    const breakMin = (args.totalBreakMin || 0) + onBreakMin;
    const workedMin = Math.max(0, grossMin - breakMin);
    const workedH = workedMin / 60;
    const earnings = args.hourlyRate ? Math.round(workedH * Number(args.hourlyRate) * 100) / 100 : null;
    return {
      workedMin,
      breakMin,
      earnings,
      overtime: workedH >= args.settings.overtimeAfterHours,
      overdueBreak:
        workedH >= args.settings.mealBreakAfterHours
        && breakMin === 0
        && !args.shiftEnd,
    };
  },

  /**
   * Toggle break for an active shift. Two states tracked on the row:
   *   - break_started_at: timestamp of the current break (NULL when off-break)
   *   - total_break_min: cumulative minutes of completed breaks
   * One column flip when starting, two when stopping (stamp + accumulate).
   */
  async startBreak(shiftId: string): Promise<void> {
    const { error } = await supabase
      .from("kitchen_duty_shifts")
      .update({ break_started_at: new Date().toISOString() })
      .eq("id", shiftId);
    if (error) throw error;
  },

  async endBreak(shiftId: string): Promise<void> {
    const { data: shift, error: gErr } = await supabase
      .from("kitchen_duty_shifts")
      .select("break_started_at, total_break_min")
      .eq("id", shiftId)
      .single();
    if (gErr || !shift?.break_started_at) return;
    const elapsedMin = Math.max(0, Math.floor(
      (Date.now() - new Date(shift.break_started_at).getTime()) / 60_000,
    ));
    const newTotal = (shift.total_break_min || 0) + elapsedMin;
    const { error } = await supabase
      .from("kitchen_duty_shifts")
      .update({ break_started_at: null, total_break_min: newTotal })
      .eq("id", shiftId);
    if (error) throw error;
  },

  // ── Phase 4: heated-storage hold-time check ──────────────────────────────
  /**
   * Pure helper: how long has a Ready order been sitting hot, and is it past
   * the safe threshold? `null` for orders that aren't yet ready.
   */
  computeHoldTime(
    readyAt: string | null,
    pickedUpAt: string | null,
    maxHotHoldMin: number,
    now: Date = new Date(),
  ): { holdMin: number; overdue: boolean } | null {
    if (!readyAt || pickedUpAt) return null;
    const minutes = Math.max(0, Math.floor((now.getTime() - new Date(readyAt).getTime()) / 60_000));
    return { holdMin: minutes, overdue: minutes > maxHotHoldMin };
  },

  // ── Phase 4: tomorrow + day-after preview ────────────────────────────────
  /**
   * Light read of upcoming orders to feed the dashboard's "what's next"
   * preview. Two days only - this is a glance, not a planning tool.
   */
  async getUpcomingPreview(companyId: string, days: number = 2): Promise<Array<{
    date: string;
    orders: number;
    guests: number;
    earliest_event_time: string | null;
    items: Array<{ id: string; event_name: string; client_name: string | null; event_time: string | null; guest_count: number; status: string }>;
  }>> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + days);

    const { data, error } = await supabase
      .from("orders")
      .select("id, event_name, client_name, event_date, event_time, guest_count, status")
      .eq("company_id", companyId)
      .gte("event_date", start.toISOString().slice(0, 10))
      .lt("event_date", end.toISOString().slice(0, 10))
      .in("status", ["confirmed", "preparing", "ready"])
      .is("deleted_at", null)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });
    if (error) {
      console.error("Upcoming preview query failed:", error);
      return [];
    }

    const buckets = new Map<string, { date: string; orders: number; guests: number; earliest_event_time: string | null; items: any[] }>();
    for (const o of (data as any[]) || []) {
      const b = buckets.get(o.event_date) || {
        date: o.event_date,
        orders: 0,
        guests: 0,
        earliest_event_time: null as string | null,
        items: [] as any[],
      };
      b.orders += 1;
      b.guests += o.guest_count || 0;
      if (o.event_time && (!b.earliest_event_time || o.event_time < b.earliest_event_time)) {
        b.earliest_event_time = o.event_time;
      }
      b.items.push(o);
      buckets.set(o.event_date, b);
    }
    return Array.from(buckets.values());
  },

  // ── Phase 4: recipe accuracy report (surfaces yield variance) ────────────
  /**
   * Aggregates yield variance per recipe across a window. Surfaces the
   * Phase 3 schema work as a clean read - which dishes the kitchen
   * consistently over- or under-yields on, with the sample size so users
   * can judge confidence.
   */
  async getRecipeAccuracy(
    companyId: string,
    fromISO: string,
    toISO: string,
  ): Promise<Array<{
    recipe_name: string;
    samples: number;
    avg_planned: number;
    avg_actual: number;
    avg_variance_pct: number;
    yield_unit: string | null;
  }>> {
    const { data, error } = await supabase
      .from("kitchen_prep_tasks")
      .select("menu_item_name, planned_yield, actual_yield, yield_unit")
      .eq("company_id", companyId)
      .gte("start_at", fromISO)
      .lt("start_at", toISO)
      .not("planned_yield", "is", null)
      .not("actual_yield", "is", null)
      .is("deleted_at", null);
    if (error) {
      console.error("Recipe accuracy query failed:", error);
      return [];
    }

    const buckets = new Map<string, {
      recipe_name: string;
      plannedSum: number;
      actualSum: number;
      varianceSum: number;
      n: number;
      yield_unit: string | null;
    }>();

    for (const r of (data as any[]) || []) {
      const planned = Number(r.planned_yield);
      const actual = Number(r.actual_yield);
      if (!planned || planned <= 0) continue;
      const variancePct = ((actual - planned) / planned) * 100;
      const b = buckets.get(r.menu_item_name) || {
        recipe_name: r.menu_item_name,
        plannedSum: 0,
        actualSum: 0,
        varianceSum: 0,
        n: 0,
        yield_unit: r.yield_unit || null,
      };
      b.plannedSum += planned;
      b.actualSum += actual;
      b.varianceSum += variancePct;
      b.n += 1;
      if (!b.yield_unit && r.yield_unit) b.yield_unit = r.yield_unit;
      buckets.set(r.menu_item_name, b);
    }

    return Array.from(buckets.values())
      .map(b => ({
        recipe_name: b.recipe_name,
        samples: b.n,
        avg_planned: Math.round((b.plannedSum / b.n) * 100) / 100,
        avg_actual: Math.round((b.actualSum / b.n) * 100) / 100,
        avg_variance_pct: Math.round((b.varianceSum / b.n) * 10) / 10,
        yield_unit: b.yield_unit,
      }))
      .sort((a, b) => Math.abs(b.avg_variance_pct) - Math.abs(a.avg_variance_pct));
  },
};
