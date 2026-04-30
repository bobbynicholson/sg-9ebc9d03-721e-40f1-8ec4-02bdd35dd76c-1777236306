/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Kitchen prep service: the math layer behind the kitchen flywheel.
 *
 * Three responsibilities, all kept dumb-simple from the user's side:
 *   1. Scale a recipe to guest count -- the math that turns "base 10
 *      portions, 1.5kg lamb" into "60 guests = 9kg lamb".
 *   2. Backwards-plan prep tasks at order confirm -- "lamb starts at
 *      08:00 because pickup is 12:00 and lamb cooks for 4 hours, with
 *      30 minutes of safety buffer."
 *   3. Aggregate demand across the day so the kitchen sees "you need
 *      14kg lettuce today across 3 orders" instead of three separate
 *      "ok / short" checks that miss the combined shortfall.
 *
 * Recipe lookup follows DB first, then the hardcoded RECIPE_MAPPINGS
 * fallback in inventoryDeductionService -- this lets self-service menu
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
}

const DEFAULT_KITCHEN_SETTINGS: KitchenSettings = {
  prepSafetyBufferMin: 30,
  defaultPrepMinPerDish: 15,
  defaultCookMinPerDish: 30,
  autoGeneratePrepTasks: true,
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
  async getKitchenSettings(companyId: string): Promise<KitchenSettings> {
    const { data } = await supabase
      .from("companies")
      .select("kitchen_settings")
      .eq("id", companyId)
      .maybeSingle();
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
  async lookupRecipe(companyId: string, menuItemName: string): Promise<{
    base_servings: number;
    prep_time_min: number;
    cook_time_min: number;
    ingredients: Array<{ name: string; quantity: number; unit: string; inventory_item_id?: string | null }>;
  } | null> {
    const settings = await this.getKitchenSettings(companyId);

    // Try DB: menu_items by name -> recipes -> recipe_ingredients
    const { data: menuItem } = await supabase
      .from("menu_items")
      .select("id, item_name, base_servings, prep_time_minutes, cook_time_minutes")
      .eq("company_id", companyId)
      .ilike("item_name", menuItemName.trim())
      .is("deleted_at", null)
      .maybeSingle();

    if (menuItem?.id) {
      const { data: recipe } = await supabase
        .from("recipes")
        .select("id, base_servings, prep_time_minutes, cook_time_minutes")
        .eq("menu_item_id", menuItem.id)
        .maybeSingle();

      if (recipe?.id) {
        const { data: ings } = await supabase
          .from("recipe_ingredients")
          .select("ingredient_name, quantity, unit, inventory_item_id")
          .eq("recipe_id", recipe.id);

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
    // no prep / cook time, so we wrap and treat base_servings as 1 -- the
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
   * Scale a recipe to a guest count. Pure maths -- no DB writes. The
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
   * Pure compute -- doesn't write anything. Caller decides what to do
   * with the result.
   */
  async planTasksForOrder(companyId: string, orderId: string): Promise<PrepTask[]> {
    const settings = await this.getKitchenSettings(companyId);

    const { data: order } = await supabase
      .from("orders")
      .select("id, company_id, menu_items, guest_count, final_guest_count, event_date, event_time, pickup_time")
      .eq("id", orderId)
      .maybeSingle();
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
    const items: any[] = Array.isArray(order.menu_items) ? order.menu_items : [];

    const tasks: PrepTask[] = [];
    for (const item of items) {
      const name = item?.name || item?.item_name || item?.menu_item_name;
      if (!name) continue;

      const recipe = await this.lookupRecipe(companyId, name);
      const prepMin = recipe?.prep_time_min ?? settings.defaultPrepMinPerDish;
      const cookMin = recipe?.cook_time_min ?? settings.defaultCookMinPerDish;

      // Backwards plan
      const cookEndsAt = new Date(pickupAt.getTime() - settings.prepSafetyBufferMin * 60_000);
      const cookStartsAt = new Date(cookEndsAt.getTime() - cookMin * 60_000);
      const prepStartsAt = new Date(cookStartsAt.getTime() - prepMin * 60_000);

      // Only include cook task if the dish has a non-trivial cook time
      if (prepMin > 0) {
        tasks.push({
          order_id: orderId,
          company_id: companyId,
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
  async ensurePrepTasksForOrder(companyId: string, orderId: string, performedBy?: string): Promise<{ created: number }> {
    const settings = await this.getKitchenSettings(companyId);
    if (!settings.autoGeneratePrepTasks) return { created: 0 };

    const planned = await this.planTasksForOrder(companyId, orderId);
    if (planned.length === 0) return { created: 0 };

    // Soft-delete pending / in_progress tasks for this order before inserting fresh ones
    await supabase
      .from("kitchen_prep_tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .in("status", ["pending", "in_progress"])
      .is("deleted_at", null);

    // Phase 2: load stations once and auto-assign each task to the right one.
    // Defaults from the migration mean every tenant has Prep / Cook / Cold /
    // Pack out of the box, so this works without admin setup.
    const stations = await this.getStationsForCompany(companyId);

    const rows = planned.map(t => ({
      company_id: companyId,
      order_id: orderId,
      menu_item_name: t.menu_item_name,
      task_type: t.task_type,
      start_at: t.start_at,
      duration_min: t.duration_min,
      status: "pending",
      station_id: this.pickStationForTask(stations, t.task_type),
    }));

    const { error } = await supabase.from("kitchen_prep_tasks").insert(rows);
    if (error) {
      console.error("Error inserting prep tasks:", error);
      return { created: 0 };
    }
    return { created: rows.length };
  },

  // ── Read tasks ────────────────────────────────────────────────────────────

  async getTasksForOrder(orderId: string): Promise<any[]> {
    const { data } = await supabase
      .from("kitchen_prep_tasks")
      .select("*, chef:assigned_chef_id(full_name)")
      .eq("order_id", orderId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true });
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
    const { data } = await supabase
      .from("kitchen_prep_tasks")
      .select("order_id, status")
      .in("order_id", orderIds)
      .is("deleted_at", null);
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
    const { error } = await supabase
      .from("kitchen_prep_tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        completed_by: performedBy,
        ...(notes ? { notes } : {}),
      })
      .eq("id", taskId);
    if (error) throw error;
    return true;
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
   * 12kg" -- one banner instead of two ok / short labels that lie.
   */
  async getAggregatedDemand(companyId: string, fromDate: string, toDate: string): Promise<IngredientDemand[]> {
    // Pull confirmed / preparing / ready orders in the date window
    const { data: orders } = await supabase
      .from("orders")
      .select("id, client_name, event_date, menu_items, guest_count, final_guest_count, status")
      .eq("company_id", companyId)
      .gte("event_date", fromDate)
      .lte("event_date", toDate)
      .in("status", ["confirmed", "preparing", "ready"]);
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

    // Join to inventory by name to get on_hand
    const names = Array.from(demandByIngredient.values()).map(d => d.name);
    const { data: inv } = await supabase
      .from("inventory_items")
      .select("id, item_name, current_stock, unit_of_measure")
      .eq("company_id", companyId)
      .is("deleted_at", null);
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
    const { data } = await supabase
      .from("kitchen_handoffs")
      .select("*, author:author_id(full_name)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
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
   * tenant -- this method is also defensive: if a tenant somehow has no
   * stations yet, returns an empty array and the production page handles
   * "no stations configured" gracefully.
   */
  async getStationsForCompany(companyId: string): Promise<KitchenStation[]> {
    const { data, error } = await supabase
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
   * is what the production timeline reads -- one query, all the data the
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
};
