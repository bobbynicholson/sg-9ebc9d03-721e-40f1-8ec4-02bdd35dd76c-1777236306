/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
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
      .gt("quantity_available", 0)
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
    const newAvailable = equipment.quantity_available + quantityChange;

    if (newAvailable < 0) {
      throw new Error("Not enough equipment available");
    }

    if (newAvailable > equipment.quantity_total) {
      throw new Error("Available quantity cannot exceed total quantity");
    }

    const { data, error } = await supabase
      .from("equipment")
      .update({
        quantity_available: newAvailable,
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

    const { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("company_id", companyId)
      .lt("last_maintenance_date", thresholdDate.toISOString())
      .order("last_maintenance_date", { ascending: true });

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
};
