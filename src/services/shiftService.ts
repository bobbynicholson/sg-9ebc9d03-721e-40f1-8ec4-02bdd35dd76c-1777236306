/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";

export type ShiftStatus = "scheduled" | "active" | "completed" | "missed" | "cancelled";

export interface DriverShift {
  id: string;
  company_id: string;
  driver_id: string;
  shift_date: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: ShiftStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const shiftService = {
  /**
   * Shifts for a single driver in a date range. Used by the Drivers page
   * schedule editor.
   */
  async getShiftsForDriver(driverId: string, fromDate: string, toDate: string): Promise<DriverShift[]> {
    const { data, error } = await supabase
      .from("driver_shifts")
      .select("*")
      .eq("driver_id", driverId)
      .gte("shift_date", fromDate)
      .lte("shift_date", toDate)
      .is("deleted_at", null)
      .order("shift_date");
    if (error) {
      console.error("Error fetching driver shifts:", error);
      return [];
    }
    return data || [];
  },

  /**
   * All driver shifts for a company on a single date. Used by the dispatch
   * KPI "Drivers on shift" and the capacity gate.
   */
  async getShiftsForCompanyOnDate(companyId: string, date: string): Promise<DriverShift[]> {
    const { data, error } = await supabase
      .from("driver_shifts")
      .select("*")
      .eq("company_id", companyId)
      .eq("shift_date", date)
      .is("deleted_at", null);
    if (error) {
      console.error("Error fetching company shifts:", error);
      return [];
    }
    return data || [];
  },

  /**
   * Whether a driver is on shift right now (status='active' or status='scheduled'
   * with planned_start <= now <= planned_end).
   */
  async isDriverOnShift(driverId: string): Promise<{ onShift: boolean; shift: DriverShift | null }> {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("driver_shifts")
      .select("*")
      .eq("driver_id", driverId)
      .eq("shift_date", today)
      .is("deleted_at", null)
      .order("planned_start", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) console.error("[shiftService/isDriverOnShift] driver_shifts lookup failed:", error);
    if (!data) return { onShift: false, shift: null };
    if (data.status === "active") return { onShift: true, shift: data as DriverShift };
    if (data.status === "scheduled" && data.planned_start && data.planned_end) {
      const now = new Date();
      const [sh, sm] = data.planned_start.split(":").map(Number);
      const [eh, em] = data.planned_end.split(":").map(Number);
      const start = new Date(now); start.setHours(sh, sm, 0, 0);
      const end   = new Date(now); end.setHours(eh, em, 0, 0);
      if (now >= start && now <= end) return { onShift: true, shift: data as DriverShift };
    }
    return { onShift: false, shift: data as DriverShift };
  },

  async upsertShift(payload: {
    id?: string;
    companyId: string;
    driverId: string;
    shiftDate: string;
    plannedStart?: string;
    plannedEnd?: string;
    status?: ShiftStatus;
    notes?: string;
  }): Promise<DriverShift | null> {
    const row: any = {
      company_id: payload.companyId,
      driver_id: payload.driverId,
      shift_date: payload.shiftDate,
      planned_start: payload.plannedStart || null,
      planned_end: payload.plannedEnd || null,
      status: payload.status ?? "scheduled",
      notes: payload.notes?.trim() || null,
    };
    if (payload.id) {
      const { data, error } = await supabase
        .from("driver_shifts").update(row).eq("id", payload.id).select().single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await supabase
      .from("driver_shifts").insert([row]).select().single();
    if (error) throw error;
    return data;
  },

  async clockIn(shiftId: string): Promise<boolean> {
    const { error } = await supabase
      .from("driver_shifts")
      .update({ actual_start: new Date().toISOString(), status: "active" })
      .eq("id", shiftId);
    if (error) throw error;
    return true;
  },

  async clockOut(shiftId: string): Promise<boolean> {
    const { error } = await supabase
      .from("driver_shifts")
      .update({ actual_end: new Date().toISOString(), status: "completed" })
      .eq("id", shiftId);
    if (error) throw error;
    return true;
  },

  async deleteShift(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("driver_shifts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return true;
  },

  /**
   * Active driver IDs right now -- used to refine the "drivers on shift" KPI
   * to a true scheduled signal rather than a GPS-ping proxy.
   */
  async getActiveDriverIdsForCompany(companyId: string): Promise<string[]> {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("driver_shifts")
      .select("driver_id, status, planned_start, planned_end")
      .eq("company_id", companyId)
      .eq("shift_date", today)
      .is("deleted_at", null);
    if (error) console.error("[shiftService/getActiveDriverIdsForCompany] driver_shifts lookup failed:", error);
    if (!data) return [];
    const now = new Date();
    const active = new Set<string>();
    for (const s of data as any[]) {
      if (s.status === "active") { active.add(s.driver_id); continue; }
      if (s.status === "scheduled" && s.planned_start && s.planned_end) {
        const [sh, sm] = s.planned_start.split(":").map(Number);
        const [eh, em] = s.planned_end.split(":").map(Number);
        const start = new Date(now); start.setHours(sh, sm, 0, 0);
        const end   = new Date(now); end.setHours(eh, em, 0, 0);
        if (now >= start && now <= end) active.add(s.driver_id);
      }
    }
    return Array.from(active);
  },
};
