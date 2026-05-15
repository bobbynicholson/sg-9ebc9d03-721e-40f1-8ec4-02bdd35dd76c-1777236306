/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { equipmentShortageService } from "./equipmentShortageService";

export type Equipment = Tables<"equipment">;
export type EquipmentBooking = Tables<"equipment_bookings">;

export const equipmentService = {
  async getEquipment(companyId: string, regionId?: string): Promise<Equipment[]> {
    let query = supabase
      .from("equipment")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (regionId) {
      query = query.eq("region_id", regionId);
    }

    const { data, error } = await query.order("name");

    if (error) {
      console.error("Error fetching equipment:", error);
      return [];
    }

    // BUG FIX #5: Always return array, never null
    return data || [];
  },

  async getEquipmentItem(equipmentId: string): Promise<Equipment | null> {
    const { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("id", equipmentId)
      .single();

    if (error) {
      console.error("Error fetching equipment item:", error);
      return null;
    }

    return data;
  },

  async createEquipment(equipment: Omit<Equipment, "id" | "created_at" | "updated_at">): Promise<Equipment | null> {
    const { data, error } = await supabase
      .from("equipment")
      .insert([equipment])
      .select()
      .single();

    if (error) {
      console.error("Error creating equipment:", error);
      throw error;
    }

    return data;
  },

  async updateEquipment(equipmentId: string, updates: Partial<Equipment>): Promise<Equipment | null> {
    const { data, error } = await supabase
      .from("equipment")
      .update(updates)
      .eq("id", equipmentId)
      .select()
      .single();

    if (error) {
      console.error("Error updating equipment:", error);
      throw error;
    }

    return data;
  },

  async deleteEquipment(equipmentId: string, companyId?: string): Promise<boolean> {
    // Audit (May 2026, Wave 4): hard-delete was failing on FK
    // constraints from equipment_bookings / equipment_damages /
    // equipment_shortage_flags, and where cascade existed it wiped
    // the audit trail. Switch to soft-delete via deleted_at, and
    // require company_id as a defence-in-depth scope filter (RLS is
    // the only thing stopping cross-tenant deletes today).
    let q = (supabase as any)
      .from("equipment")
      .update({ deleted_at: new Date().toISOString(), is_available: false })
      .eq("id", equipmentId);
    if (companyId) q = q.eq("company_id", companyId);
    const { error } = await q;

    if (error) {
      console.error("Error deleting equipment:", error);
      throw error;
    }

    return true;
  },

  async checkAvailability(
    equipmentId: string,
    startDate: string,
    endDate: string,
    quantity: number
  ): Promise<boolean> {
    const equipment = await this.getEquipmentItem(equipmentId);
    if (!equipment) return false;

    // Audit (May 2026, Wave 4): the overlap predicate ran the two
    // halves as `.or(booked_from.lte.endDate, booked_until.gte.startDate)`
    // which OR-matches almost every row in the table. Real overlap
    // rule is AND: a booking overlaps when booked_from <= endDate
    // AND booked_until >= startDate. The OR version had the system
    // rejecting legitimate availability ("no stock") in the typical
    // case and could silently let conflicts through in others.
    const { data: bookings, error } = await supabase
      .from("equipment_bookings")
      .select("quantity")
      .eq("equipment_id", equipmentId)
      .eq("status", "booked")
      .lte("booked_from", endDate)
      .gte("booked_until", startDate);

    if (error) {
      console.error("Error checking equipment availability:", error);
      return false;
    }

    const bookedQuantity = bookings?.reduce((sum, booking) => sum + booking.quantity, 0) || 0;
    const availableQuantity = equipment.available_quantity - bookedQuantity;

    return availableQuantity >= quantity;
  },

  async bookEquipment(
    userId: string,
    orderId: string,
    equipmentId: string,
    quantity: number,
    startDate: string,
    endDate: string,
    cleaningTimeHours: number,
    companyId?: string,
  ): Promise<EquipmentBooking | null> {
    const availableFrom = new Date(endDate);
    availableFrom.setHours(availableFrom.getHours() + cleaningTimeHours);

    // Resolve company_id from the order when the caller didn't pass
    // it -- the field is required by RLS and by the availability
    // calculator. Audit (May 2026): the previous insert wrote without
    // company_id, so the row was invisible to every subsequent
    // availability check and the same equipment could be sold twice
    // on the same day.
    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId && orderId) {
      const { data: order, error: orderErr } = await (supabase as any)
        .from("orders")
        .select("company_id")
        .eq("id", orderId)
        .maybeSingle();
      if (orderErr) console.error("[equipmentService] orders company_id lookup failed:", orderErr);
      resolvedCompanyId = (order as any)?.company_id || null;
    }

    const { data, error } = await supabase
      .from("equipment_bookings")
      .insert([
        {
          company_id: resolvedCompanyId,
          user_id: userId,
          order_id: orderId,
          equipment_id: equipmentId,
          quantity: quantity,
          booked_from: startDate,
          booked_until: endDate,
          available_from: availableFrom.toISOString(),
          status: "booked"
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("Error booking equipment:", error);
      throw error;
    }

    // Audit (May 2026, Wave 4): the generated types declare this RPC
    // as `Args: never`, meaning the function takes no parameters. The
    // call below silently no-ops (or applies a stub effect) and
    // equipment.available_quantity never reflects the reservation.
    // Skip the RPC entirely -- the availability calculator already
    // reads equipment.quantity minus the LIVE equipment_bookings
    // overlap, so available_quantity as a denormalised counter is
    // redundant. Leave a comment so a future dev doesn't re-add it.
    // (To re-enable: change the Postgres function signature to take
    // p_equipment_id + p_quantity_to_decrement, regenerate types.)

    return data;
  },

  async returnEquipment(
    bookingId: string,
    returnedQuantity?: number
  ): Promise<EquipmentBooking | null> {
    const { data: booking, error: fetchError } = await supabase
      .from("equipment_bookings")
      .select("*, order_id, equipment_id, quantity, user_id, company_id")
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) {
      console.error("Error fetching booking:", fetchError);
      throw fetchError || new Error("Booking not found");
    }

    const actualReturnedQuantity = returnedQuantity ?? booking.quantity;

    // Audit (May 2026, Wave 4): the previous update only flipped
    // status='returned' and never stamped returned_quantity, so the
    // availability calculator's `quantity - returned_quantity` math
    // treated every partial return as a full one -- a shortage was
    // released back into stock as if intact.
    const { data, error } = await supabase
      .from("equipment_bookings")
      .update({
        status: "returned",
        returned_quantity: actualReturnedQuantity,
      })
      .eq("id", bookingId)
      .select()
      .single();

    if (error) {
      console.error("Error returning equipment:", error);
      throw error;
    }

    // BUG FIX #5: Check for shortage only if returned quantity is less than expected
    if (actualReturnedQuantity < booking.quantity) {
      try {
        await equipmentShortageService.checkAndCreateShortageFlag({
          orderId: booking.order_id,
          equipmentBookingId: bookingId,
          equipmentId: booking.equipment_id,
          expectedQuantity: booking.quantity,
          returnedQuantity: actualReturnedQuantity,
          userId: booking.user_id
        });
      } catch (shortageError) {
        console.error("Error creating shortage flag:", shortageError);
        // Don't fail the return operation if shortage logging fails
      }
    }

    return data;
  },

  async getEquipmentBookings(equipmentId: string, startDate?: string, endDate?: string): Promise<EquipmentBooking[]> {
    let query = supabase
      .from("equipment_bookings")
      .select("*, orders(client_name, event_date)")
      .eq("equipment_id", equipmentId);

    if (startDate) {
      query = query.gte("booked_from", startDate);
    }

    if (endDate) {
      query = query.lte("booked_until", endDate);
    }

    const { data, error } = await query.order("booked_from");

    if (error) {
      console.error("Error fetching equipment bookings:", error);
      return [];
    }

    // BUG FIX #5: Always return array
    return data || [];
  }
};
