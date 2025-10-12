import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { equipmentShortageService } from "./equipmentShortageService";

export type Equipment = Tables<"equipment">;
export type EquipmentBooking = Tables<"equipment_bookings">;

export const equipmentService = {
  async getEquipment(userId: string, regionId?: string): Promise<Equipment[]> {
    let query = supabase
      .from("equipment")
      .select("*")
      .eq("user_id", userId);

    if (regionId) {
      query = query.eq("region_id", regionId);
    }

    const { data, error } = await query.order("name");

    if (error) {
      console.error("Error fetching equipment:", error);
      return [];
    }

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

  async deleteEquipment(equipmentId: string): Promise<boolean> {
    const { error } = await supabase
      .from("equipment")
      .delete()
      .eq("id", equipmentId);

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

    const { data: bookings, error } = await supabase
      .from("equipment_bookings")
      .select("quantity")
      .eq("equipment_id", equipmentId)
      .eq("status", "booked")
      .or(`booked_from.lte.${endDate},booked_until.gte.${startDate}`);

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
    cleaningTimeHours: number
  ): Promise<EquipmentBooking | null> {
    const availableFrom = new Date(endDate);
    availableFrom.setHours(availableFrom.getHours() + cleaningTimeHours);

    const { data, error } = await supabase
      .from("equipment_bookings")
      .insert([
        {
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

    // Replace supabase.sql with an RPC call for safe atomic update
    const { error: rpcError } = await supabase.rpc('decrement_equipment_quantity', {
      p_equipment_id: equipmentId,
      p_quantity_to_decrement: quantity
    });

    if (rpcError) {
      console.error("Error updating equipment quantity via RPC:", rpcError);
      // Optionally handle rollback or error logging
    }

    return data;
  },

  async returnEquipment(
    bookingId: string, 
    returnedQuantity?: number
  ): Promise<EquipmentBooking | null> {
    const booking = await supabase
      .from("equipment_bookings")
      .select("*, order_id, equipment_id, quantity, user_id")
      .eq("id", bookingId)
      .single();

    if (booking.error) {
      console.error("Error fetching booking:", booking.error);
      throw booking.error;
    }

    const actualReturnedQuantity = returnedQuantity ?? booking.data.quantity;

    const { data, error } = await supabase
      .from("equipment_bookings")
      .update({ status: "returned" })
      .eq("id", bookingId)
      .select()
      .single();

    if (error) {
      console.error("Error returning equipment:", error);
      throw error;
    }

    if (actualReturnedQuantity < booking.data.quantity) {
      try {
        await equipmentShortageService.checkAndCreateShortageFlag({
          orderId: booking.data.order_id,
          equipmentBookingId: bookingId,
          equipmentId: booking.data.equipment_id,
          expectedQuantity: booking.data.quantity,
          returnedQuantity: actualReturnedQuantity,
          userId: booking.data.user_id
        });
      } catch (shortageError) {
        console.error("Error creating shortage flag:", shortageError);
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

    return data || [];
  }
};
