/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Equipment = Database["public"]["Tables"]["equipment"]["Row"];
type EquipmentInsert = Database["public"]["Tables"]["equipment"]["Insert"];
type EquipmentUpdate = Database["public"]["Tables"]["equipment"]["Update"];

export const equipmentManagementService = {
  async getAllEquipment(companyId: string) {
    const { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("company_id", companyId)
      .order("name", { ascending: true });

    if (error) throw error;
    return data as Equipment[];
  },

  async getEquipmentById(id: string) {
    const { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as Equipment;
  },

  async getEquipmentByCategory(companyId: string, category: string) {
    const { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("company_id", companyId)
      .eq("category", category)
      .order("name", { ascending: true });

    if (error) throw error;
    return data as Equipment[];
  },

  async getAvailableEquipment(companyId: string) {
    const { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("company_id", companyId)
      .gt("available_quantity", 0)
      .order("category", { ascending: true });

    if (error) throw error;
    return data as Equipment[];
  },

  async createEquipment(equipment: Omit<EquipmentInsert, "id" | "created_at" | "updated_at">) {
    const { data, error } = await supabase
      .from("equipment")
      .insert([equipment])
      .select()
      .single();

    if (error) throw error;
    return data as Equipment;
  },

  async updateEquipment(id: string, updates: EquipmentUpdate) {
    const { data, error } = await supabase
      .from("equipment")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Equipment;
  },

  async deleteEquipment(id: string) {
    const { error } = await supabase
      .from("equipment")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  },

  async updateEquipmentQuantity(id: string, quantityChange: number) {
    const equipment = await this.getEquipmentById(id);
    // Ops audit 2026-06-15: the equipment table has available_quantity /
    // quantity, not the quantity_available / quantity_total this method
    // referenced (which made every call throw "column does not exist").
    const newAvailable = (equipment.available_quantity ?? 0) + quantityChange;

    if (newAvailable < 0) {
      throw new Error("Not enough equipment available");
    }

    if (equipment.quantity != null && newAvailable > equipment.quantity) {
      throw new Error("Available quantity cannot exceed total quantity");
    }

    const { data, error } = await supabase
      .from("equipment")
      .update({
        available_quantity: newAvailable,
        updated_at: new Date().toISOString()
      } as any)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Equipment;
  },

  async reserveEquipment(id: string, quantity: number) {
    return this.updateEquipmentQuantity(id, -quantity);
  },

  async returnEquipment(id: string, quantity: number) {
    return this.updateEquipmentQuantity(id, quantity);
  },

  async getEquipmentStats(companyId: string) {
    const { data, error } = await supabase
      .from("equipment")
      .select("category, quantity, available_quantity, condition")
      .eq("company_id", companyId);

    if (error) throw error;
    if (!data) return null;

    const stats = {
      totalItems: data.length,
      totalQuantity: data.reduce((sum, eq) => sum + (eq.quantity || 0), 0),
      availableQuantity: data.reduce((sum, eq) => sum + (eq.available_quantity || 0), 0),
      inUseQuantity: data.reduce((sum, eq) => sum + ((eq.quantity || 0) - (eq.available_quantity || 0)), 0),
      byCategory: data.reduce((acc: any, eq) => {
        const category = eq.category || 'uncategorized';
        if (!acc[category]) {
          acc[category] = { total: 0, available: 0 };
        }
        acc[category].total += eq.quantity || 0;
        acc[category].available += eq.available_quantity || 0;
        return acc;
      }, {}),
      byCondition: data.reduce((acc: any, eq) => {
        const condition = eq.condition || 'unknown';
        if (!acc[condition]) {
          acc[condition] = 0;
        }
        acc[condition]++;
        return acc;
      }, {}),
    };

    return stats;
  },

  async searchEquipment(companyId: string, searchTerm: string) {
    const { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("company_id", companyId)
      .ilike("name", `%${searchTerm}%`)
      .order("name", { ascending: true });

    if (error) throw error;
    return data as Equipment[];
  },

  async getMaintenanceDueEquipment(companyId: string, daysThreshold: number = 90) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

    // equipment has no last_maintenance_date column - the real column is
    // last_serviced_at. The old name would 42703/throw the moment this
    // (currently uncalled) method is wired up.
    const { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("company_id", companyId)
      .lt("last_serviced_at", thresholdDate.toISOString())
      .order("last_serviced_at", { ascending: true });

    if (error) throw error;
    return data as Equipment[];
  },

  /**
   * Quote-builder typeahead lookup. Mirrors menuService.searchForQuote:
   * filtered to a single company's catalog (RLS belt-and-braces),
   * skips items the owner has flipped out of the catalog
   * (`is_available = false`), returns the slim field set the picker
   * needs to hydrate a quote line.
   */
  async searchForQuote(
    companyId: string,
    term: string,
    limit: number = 10,
  ): Promise<Array<{
    id: string;
    name: string;
    category: string | null;
    rental_price: number;
    description: string | null;
    image_url: string | null;
    quantity: number | null;
    available_quantity: number | null;
    condition: string | null;
  }>> {
    if (!companyId) return [];
    const t = (term || "").trim();
    let q = supabase
      .from("equipment")
      .select(
        "id, name, category, rental_price, description, image_url, quantity, available_quantity, condition, is_available",
      )
      .eq("company_id", companyId)
      .or("is_available.is.null,is_available.eq.true");
    if (t.length >= 1) {
      const like = `%${t}%`;
      q = q.or(`name.ilike.${like},description.ilike.${like},category.ilike.${like}`);
    }
    const { data, error } = await q
      .order("name", { ascending: true })
      .limit(limit);
    if (error) {
      console.error("equipmentManagementService.searchForQuote failed:", error);
      return [];
    }
    return (data || []) as any[];
  },

  // ── EQP-B (equipment deferred, 2026-05-24) ─────────────────────

  /**
   * Utilisation per item over the last N days. Returns a Map
   * keyed by equipment_id with { bookedEvents, totalEvents,
   * pct } so the page can render "booked 12 / 18 events" chips.
   *
   * "totalEvents" = distinct event_date count from non-cancelled
   * orders in the window with at least one equipment_booking - i.e.
   * the universe of events the company actually ran.
   *
   * "bookedEvents" per equipment = distinct event_dates this item
   * was booked into. Dead-stock = bookedEvents === 0 across the
   * window. High-util = bookedEvents / totalEvents > 0.6.
   */
  async getUtilisationByItem(
    companyId: string,
    days: number = 90,
  ): Promise<Map<string, { bookedEvents: number; totalEvents: number; pct: number }>> {
    const sinceIso = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const { data, error } = await (supabase as any)
      .from("equipment_bookings")
      .select("equipment_id, booked_from, status")
      .eq("company_id", companyId)
      .gte("booked_from", sinceIso)
      .neq("status", "cancelled");
    if (error) {
      console.warn("getUtilisationByItem failed:", error);
      return new Map();
    }
    const rows = (data || []) as Array<{ equipment_id: string; booked_from: string | null }>;
    const allDates = new Set<string>();
    const datesByItem = new Map<string, Set<string>>();
    for (const r of rows) {
      const date = (r.booked_from || "").slice(0, 10);
      if (!date || !r.equipment_id) continue;
      allDates.add(date);
      const s = datesByItem.get(r.equipment_id) || new Set<string>();
      s.add(date);
      datesByItem.set(r.equipment_id, s);
    }
    const totalEvents = allDates.size;
    const out = new Map<string, { bookedEvents: number; totalEvents: number; pct: number }>();
    for (const [equipmentId, dates] of datesByItem.entries()) {
      const booked = dates.size;
      out.set(equipmentId, {
        bookedEvents: booked,
        totalEvents,
        pct: totalEvents > 0 ? booked / totalEvents : 0,
      });
    }
    return out;
  },

  /**
   * Damages per item in the last N days. Returns count + total rand
   * cost so the row chip can read "2 damages 90d" and finance can
   * see the cost on hover.
   */
  async getDamagesByItem(
    companyId: string,
    days: number = 90,
  ): Promise<Map<string, { count: number; totalCost: number }>> {
    const sinceIso = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    // equipment_damages has no total_cost column - the real cost column
    // is repair_cost. Selecting total_cost 400'd the whole query, which
    // the catch swallowed -> the damages chip silently always read zero.
    const { data, error } = await (supabase as any)
      .from("equipment_damages")
      .select("equipment_id, repair_cost")
      .eq("company_id", companyId)
      .gte("created_at", sinceIso);
    if (error) {
      console.warn("getDamagesByItem failed:", error);
      return new Map();
    }
    const map = new Map<string, { count: number; totalCost: number }>();
    for (const r of (data || []) as Array<{ equipment_id: string; repair_cost: number | null }>) {
      if (!r.equipment_id) continue;
      const cur = map.get(r.equipment_id) || { count: 0, totalCost: 0 };
      cur.count += 1;
      cur.totalCost += Number(r.repair_cost || 0);
      map.set(r.equipment_id, cur);
    }
    return map;
  },

  // EQP-B: package usage per item deferred until a booking_package_items
  // linkage table exists. Packages currently link to orders, not to
  // equipment/menu items directly, so the "Hidden - in N packages"
  // chip needs schema first.

  /**
   * EQP-B: hire-in spend per item over the last N days. Drives the
   * buy-vs-rent recommendation when (hire_in_spend) > replacement_cost.
   */
  async getHireInSpendByItem(
    companyId: string,
    days: number = 90,
  ): Promise<Map<string, { hireCount: number; totalSpend: number }>> {
    const sinceIso = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const { data, error } = await (supabase as any)
      .from("equipment_hire_orders")
      .select("equipment_id, total_cost")
      .eq("company_id", companyId)
      .gte("created_at", sinceIso);
    if (error) {
      console.warn("getHireInSpendByItem failed:", error);
      return new Map();
    }
    const map = new Map<string, { hireCount: number; totalSpend: number }>();
    for (const r of (data || []) as Array<{ equipment_id: string | null; total_cost: number | null }>) {
      if (!r.equipment_id) continue;
      const cur = map.get(r.equipment_id) || { hireCount: 0, totalSpend: 0 };
      cur.hireCount += 1;
      cur.totalSpend += Number(r.total_cost || 0);
      map.set(r.equipment_id, cur);
    }
    return map;
  },

  /**
   * EQP-B: bulk archive (soft delete) a set of equipment ids.
   */
  async bulkArchive(itemIds: string[]): Promise<{ count: number; error?: string }> {
    if (itemIds.length === 0) return { count: 0 };
    const { error, count } = await (supabase as any)
      .from("equipment")
      .update({ deleted_at: new Date().toISOString(), is_available: false }, { count: "exact" })
      .in("id", itemIds);
    if (error) return { count: 0, error: error.message };
    return { count: count ?? itemIds.length };
  },

  /**
   * EQP-B: bulk toggle is_available. Use to hide a swathe of
   * component parts (Bain-Marie internals) or expose them.
   */
  async bulkSetAvailable(itemIds: string[], isAvailable: boolean): Promise<{ count: number; error?: string }> {
    if (itemIds.length === 0) return { count: 0 };
    const { error, count } = await (supabase as any)
      .from("equipment")
      .update({ is_available: isAvailable }, { count: "exact" })
      .in("id", itemIds);
    if (error) return { count: 0, error: error.message };
    return { count: count ?? itemIds.length };
  },

  /**
   * EQP-B: bulk recategorise.
   */
  async bulkSetCategory(itemIds: string[], category: string): Promise<{ count: number; error?: string }> {
    if (itemIds.length === 0) return { count: 0 };
    const { error, count } = await (supabase as any)
      .from("equipment")
      .update({ category }, { count: "exact" })
      .in("id", itemIds);
    if (error) return { count: 0, error: error.message };
    return { count: count ?? itemIds.length };
  },

  /**
   * EQP-B: bulk set hire-in cost. Quick way to fill the fallback
   * cost on a swathe of items so the shortage tab can quote margins.
   */
  async bulkSetHireInCost(itemIds: string[], cost: number): Promise<{ count: number; error?: string }> {
    if (itemIds.length === 0) return { count: 0 };
    const { error, count } = await (supabase as any)
      .from("equipment")
      .update({ hire_in_cost: cost }, { count: "exact" })
      .in("id", itemIds);
    if (error) return { count: 0, error: error.message };
    return { count: count ?? itemIds.length };
  },
};

/**
 * EQP-B: pure helper - "consider buying" recommendation. True when
 * the operator hired this item in enough in the last 90 days that
 * the cumulative hire spend now exceeds the replacement cost.
 *
 * Returns { recommend: boolean, multiplier: number } where
 * multiplier = hireSpend / replacementCost (1.0 = breakeven, 2.0 =
 * could have bought two by now).
 */
export function buyVsRentRecommendation(
  hireSpend: number,
  hireCount: number,
  replacementCost: number | null | undefined,
): { recommend: boolean; multiplier: number | null } {
  const rc = Number(replacementCost || 0);
  if (rc <= 0) return { recommend: false, multiplier: null };
  if (hireCount < 5) return { recommend: false, multiplier: hireSpend / rc };
  const multiplier = hireSpend / rc;
  return { recommend: multiplier >= 1, multiplier };
}

/**
 * EQP-B: detect a material conflict between an equipment item's
 * name and its description. "Bowl (porcelain)" + description
 * "Plastic pudding bowl" is the canonical bug we caught on Spit
 * Braai. Returns the conflicting material pair when found.
 *
 * Conservative - only flags when both the name and description
 * have unambiguous material words. We don't try to infer materials
 * from category or other context.
 */
const MATERIAL_WORDS = ["plastic", "porcelain", "stainless", "glass", "acrylic", "wooden", "wood", "ceramic", "melamine"];
export function detectMaterialConflict(
  name: string | null | undefined,
  description: string | null | undefined,
): { nameMaterial: string; descMaterial: string } | null {
  const nameLower = (name || "").toLowerCase();
  const descLower = (description || "").toLowerCase();
  const nameMat = MATERIAL_WORDS.find((m) => nameLower.includes(m));
  const descMat = MATERIAL_WORDS.find((m) => descLower.includes(m));
  if (!nameMat || !descMat) return null;
  // Treat wood/wooden as the same material.
  const norm = (m: string) => m === "wooden" ? "wood" : m;
  if (norm(nameMat) === norm(descMat)) return null;
  return { nameMaterial: nameMat, descMaterial: descMat };
}
