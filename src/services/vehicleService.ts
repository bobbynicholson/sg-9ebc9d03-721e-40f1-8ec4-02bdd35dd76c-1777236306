/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";

export interface Vehicle {
  id: string;
  company_id: string;
  plate: string;
  make: string | null;
  model: string | null;
  capacity_kg: number | null;
  refrigerated: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const vehicleService = {
  async getVehiclesForCompany(companyId: string): Promise<Vehicle[]> {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("plate");
    if (error) {
      console.error("Error fetching vehicles:", error);
      return [];
    }
    return data || [];
  },

  async createVehicle(payload: {
    companyId: string;
    plate: string;
    make?: string;
    model?: string;
    capacityKg?: number | null;
    refrigerated?: boolean;
    notes?: string;
  }): Promise<Vehicle | null> {
    const { data, error } = await supabase
      .from("vehicles")
      .insert([{
        company_id: payload.companyId,
        plate: payload.plate.trim(),
        make: payload.make?.trim() || null,
        model: payload.model?.trim() || null,
        capacity_kg: payload.capacityKg ?? null,
        refrigerated: payload.refrigerated ?? false,
        notes: payload.notes?.trim() || null,
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateVehicle(id: string, updates: Partial<Vehicle>): Promise<Vehicle | null> {
    const { data, error } = await supabase
      .from("vehicles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteVehicle(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("vehicles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return true;
  },

  /**
   * Vehicle attached to a driver (FK on profiles.vehicle_id).
   */
  async getVehicleForDriver(driverId: string): Promise<Vehicle | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("vehicle_id, vehicles:vehicle_id(*)")
      .eq("id", driverId)
      .maybeSingle();
    if (error || !data?.vehicles) return null;
    return data.vehicles as Vehicle;
  },
};
