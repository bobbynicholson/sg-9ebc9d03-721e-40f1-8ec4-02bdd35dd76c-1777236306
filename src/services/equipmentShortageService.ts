/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type EquipmentShortageFlag = Database["public"]["Tables"]["equipment_shortage_flags"]["Row"];
type EquipmentShortageFlagInsert = Database["public"]["Tables"]["equipment_shortage_flags"]["Insert"];
type EquipmentShortageFlagUpdate = Database["public"]["Tables"]["equipment_shortage_flags"]["Update"];

export const equipmentShortageService = {
  async createShortageFlag(data: {
    orderId: string;
    equipmentBookingId: string;
    equipmentId: string;
    clientName: string;
    clientEmail?: string;
    equipmentName: string;
    expectedQuantity: number;
    returnedQuantity: number;
    shortageReason?: string;
    priority?: "low" | "medium" | "high" | "urgent";
    financialImpact?: number;
    userId: string;
  }) {
    const shortageQuantity = data.expectedQuantity - data.returnedQuantity;

    const insertData: EquipmentShortageFlagInsert = {
      user_id: data.userId,
      order_id: data.orderId,
      equipment_booking_id: data.equipmentBookingId,
      equipment_id: data.equipmentId,
      client_name: data.clientName,
      client_email: data.clientEmail,
      equipment_name: data.equipmentName,
      expected_quantity: data.expectedQuantity,
      returned_quantity: data.returnedQuantity,
      shortage_quantity: shortageQuantity,
      shortage_reason: data.shortageReason,
      priority: data.priority || "medium",
      financial_impact: data.financialImpact,
      status: "pending"
    };

    const { data: flag, error } = await supabase
      .from("equipment_shortage_flags")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    // Create notification for admin
    await this.createShortageNotification(flag);

    return flag;
  },

  async createShortageNotification(flag: EquipmentShortageFlag) {
    const { error } = await supabase
      .from("notifications")
      .insert({
        user_id: flag.user_id,
        recipient_id: flag.user_id,
        notification_type: "equipment_shortage",
        title: "Equipment Shortage Detected",
        message: `${flag.client_name} returned ${flag.returned_quantity} of ${flag.expected_quantity} ${flag.equipment_name}. Shortage: ${flag.shortage_quantity} items.`,
        // Equipment hub-with-tabs is the canonical home now. The
        // standalone /admin/equipment-shortages URL still resolves
        // for old bookmarks, but new notifications land in the tab.
        link: `/admin/equipment?tab=shortages&flag=${flag.id}`,
        priority: flag.priority === "urgent" || flag.priority === "high" ? "high" : "normal",
        metadata: {
          flagId: flag.id,
          orderId: flag.order_id,
          equipmentId: flag.equipment_id,
          shortageQuantity: flag.shortage_quantity
        }
      });

    if (error) {
      console.error("Failed to create shortage notification:", error);
    }
  },

  async getShortageFlags(companyId: string, filters?: {
    status?: string;
    priority?: string;
    orderId?: string;
  }) {
    let query = supabase
      .from("equipment_shortage_flags")
      .select(`
        *,
        order:orders(
          order_number,
          client_name,
          event_date
        ),
        equipment:equipment(
          name,
          category
        ),
        resolved_by_profile:profiles!equipment_shortage_flags_resolved_by_fkey(
          full_name,
          email
        )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.priority) {
      query = query.eq("priority", filters.priority);
    }

    if (filters?.orderId) {
      query = query.eq("order_id", filters.orderId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getShortageFlag(id: string) {
    const { data, error } = await supabase
      .from("equipment_shortage_flags")
      .select(`
        *,
        order:orders(
          order_number,
          client_name,
          client_email,
          client_phone,
          event_date,
          venue_address
        ),
        equipment:equipment(
          name,
          category,
          replacement_cost
        ),
        resolved_by_profile:profiles!equipment_shortage_flags_resolved_by_fkey(
          full_name,
          email
        )
      `)
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  },

  async updateShortageFlag(id: string, updates: {
    status?: "pending" | "resolved" | "investigating";
    priority?: "low" | "medium" | "high" | "urgent";
    adminNotes?: string;
    resolutionNotes?: string;
    resolvedBy?: string;
  }) {
    const updateData: EquipmentShortageFlagUpdate = {};

    if (updates.status) {
      updateData.status = updates.status;
      if (updates.status === "resolved") {
        updateData.resolved_at = new Date().toISOString();
        if (updates.resolvedBy) {
          updateData.resolved_by = updates.resolvedBy;
        }
      }
    }

    if (updates.priority) {
      updateData.priority = updates.priority;
    }

    if (updates.adminNotes) {
      updateData.admin_notes = updates.adminNotes;
    }

    if (updates.resolutionNotes) {
      updateData.resolution_notes = updates.resolutionNotes;
    }

    const { data, error } = await supabase
      .from("equipment_shortage_flags")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async resolveShortageFlag(id: string, resolvedBy: string, resolutionNotes: string) {
    return this.updateShortageFlag(id, {
      status: "resolved",
      resolvedBy,
      resolutionNotes
    });
  },

  async getPendingShortagesCount(companyId: string) {
    const { count, error } = await supabase
      .from("equipment_shortage_flags")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "pending");

    if (error) throw error;
    return count || 0;
  },

  async getShortagesByClient(companyId: string, clientName: string) {
    const { data, error } = await supabase
      .from("equipment_shortage_flags")
      .select(`
        *,
        order:orders(
          order_number,
          event_date
        ),
        equipment:equipment(
          name,
          category
        )
      `)
      .eq("company_id", companyId)
      .ilike("client_name", `%${clientName}%`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async checkAndCreateShortageFlag(data: {
    orderId: string;
    equipmentBookingId: string;
    equipmentId: string;
    expectedQuantity: number;
    returnedQuantity: number;
    userId: string;
  }) {
    if (data.returnedQuantity >= data.expectedQuantity) {
      return null;
    }

    const { data: order } = await supabase
      .from("orders")
      .select("client_name, client_email")
      .eq("id", data.orderId)
      .single();

    const { data: equipment } = await supabase
      .from("equipment")
      .select("name, replacement_cost")
      .eq("id", data.equipmentId)
      .single();

    if (!order || !equipment) {
      throw new Error("Order or equipment not found");
    }

    const shortageQuantity = data.expectedQuantity - data.returnedQuantity;
    const financialImpact = equipment.replacement_cost 
      ? Number(equipment.replacement_cost) * shortageQuantity 
      : undefined;

    const priority = shortageQuantity >= 5 ? "high" : 
                    shortageQuantity >= 3 ? "medium" : "low";

    return this.createShortageFlag({
      orderId: data.orderId,
      equipmentBookingId: data.equipmentBookingId,
      equipmentId: data.equipmentId,
      clientName: order.client_name,
      clientEmail: order.client_email || undefined,
      equipmentName: equipment.name,
      expectedQuantity: data.expectedQuantity,
      returnedQuantity: data.returnedQuantity,
      priority,
      financialImpact,
      userId: data.userId
    });
  }
};
