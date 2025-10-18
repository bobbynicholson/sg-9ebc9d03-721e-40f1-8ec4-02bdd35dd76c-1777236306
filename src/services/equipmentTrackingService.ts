import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { emailAutomationService } from "./emailAutomationService";
import { whatsappIntegrationService } from "./whatsappIntegrationService";

type EquipmentHandover = Database["public"]["Tables"]["equipment_handovers"]["Row"];
type EquipmentDamage = Database["public"]["Tables"]["equipment_damages"]["Row"];
type CleaningDutyLog = Database["public"]["Tables"]["cleaning_duty_logs"]["Row"];
type EquipmentCleaningStatus = Database["public"]["Tables"]["equipment_cleaning_status"]["Row"];

export type HandoverStage = "kitchen" | "driver" | "client" | "return" | "cleaning" | "drying" | "ready";
export type DamageType = "broken" | "lost" | "stolen" | "damaged";

export const equipmentTrackingService = {
  /**
   * Create a new equipment handover in the chain
   */
  async createHandover(params: {
    orderId: string;
    equipmentId: string;
    quantity: number;
    fromStage: HandoverStage;
    toStage: HandoverStage;
    handedByUserId?: string;
    handedByName: string;
    quantitySent: number;
  }): Promise<EquipmentHandover> {
    const { data, error } = await supabase
      .from("equipment_handovers")
      .insert({
        order_id: params.orderId,
        equipment_id: params.equipmentId,
        quantity: params.quantity,
        from_stage: params.fromStage,
        to_stage: params.toStage,
        handed_by_user_id: params.handedByUserId,
        handed_by_name: params.handedByName,
        quantity_sent: params.quantitySent,
        handed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating handover:", error);
      throw error;
    }

    return data;
  },

  /**
   * Confirm receipt of equipment in handover
   */
  async confirmHandoverReceipt(params: {
    handoverId: string;
    receivedByUserId?: string;
    receivedByName: string;
    quantityReceived: number;
    discrepancyReason?: string;
  }): Promise<EquipmentHandover> {
    const handover = await supabase
      .from("equipment_handovers")
      .select("quantity_sent")
      .eq("id", params.handoverId)
      .single();

    if (!handover.data) {
      throw new Error("Handover not found");
    }

    const hasDiscrepancy = params.quantityReceived !== handover.data.quantity_sent;

    const { data, error } = await supabase
      .from("equipment_handovers")
      .update({
        received_by_user_id: params.receivedByUserId,
        received_by_name: params.receivedByName,
        quantity_received: params.quantityReceived,
        discrepancy_noted: hasDiscrepancy,
        discrepancy_reason: hasDiscrepancy ? params.discrepancyReason : null,
        received_at: new Date().toISOString(),
      })
      .eq("id", params.handoverId)
      .select()
      .single();

    if (error) {
      console.error("Error confirming handover receipt:", error);
      throw error;
    }

    return data;
  },

  /**
   * Get handover chain for an order
   */
  async getOrderHandoverChain(orderId: string): Promise<EquipmentHandover[]> {
    const { data, error } = await supabase
      .from("equipment_handovers")
      .select(`
        *,
        equipment:equipment_id (
          name,
          category,
          unit_cost
        )
      `)
      .eq("order_id", orderId)
      .order("handed_at", { ascending: true });

    if (error) {
      console.error("Error fetching handover chain:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Report damaged or lost equipment
   */
  async reportDamage(params: {
    orderId: string;
    equipmentId: string;
    handoverId?: string;
    quantityDamaged: number;
    damageType: DamageType;
    damageStage: HandoverStage;
    unitCost: number;
    responsibleUserId?: string;
    responsibleName?: string;
    description?: string;
    notes?: string;
    photoUrl?: string;
  }): Promise<EquipmentDamage> {
    const totalCost = params.quantityDamaged * params.unitCost;

    const { data, error } = await supabase
      .from("equipment_damages")
      .insert({
        order_id: params.orderId,
        equipment_id: params.equipmentId,
        handover_id: params.handoverId,
        quantity_damaged: params.quantityDamaged,
        damage_type: params.damageType,
        damage_stage: params.damageStage,
        unit_cost: params.unitCost,
        total_cost: totalCost,
        responsible_user_id: params.responsibleUserId,
        responsible_name: params.responsibleName,
        description: params.description,
        notes: params.notes,
        photo_url: params.photoUrl,
      })
      .select()
      .single();

    if (error) {
      console.error("Error reporting damage:", error);
      throw error;
    }

    // Get order and equipment details for notifications
    const { data: order } = await supabase
      .from("orders")
      .select("user_id, order_number, client_name")
      .eq("id", params.orderId)
      .single();

    const { data: equipment } = await supabase
      .from("equipment")
      .select("name, category")
      .eq("id", params.equipmentId)
      .single();

    if (order) {
      // 1. In-portal notification (existing - keep it)
      await supabase.from("notifications").insert({
        user_id: order.user_id,
        recipient_id: order.user_id,
        notification_type: "equipment_damage",
        title: "🔧 Equipment Damage Reported",
        message: `${params.quantityDamaged}x ${params.damageType} at ${params.damageStage} stage. Order: ${order.order_number}. Cost: R${totalCost.toFixed(2)}`,
        priority: "high",
        order_id: params.orderId,
      });

      // ✅ FIX BUG #7.1: Send email notification to admin
      try {
        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("email, full_name, company_name, phone, phone_number")
          .eq("id", order.user_id)
          .single();

        if (adminProfile?.email) {
          const subject = `🔧 Equipment Damage Alert - Order ${order.order_number}`;
          const equipmentName = equipment?.name || "Unknown Equipment";
          const body = `Dear ${adminProfile.full_name || "Admin"},

⚠️ Equipment Damage Reported

Order Number: ${order.order_number}
Client: ${order.client_name || "Unknown"}

Damage Details:
- Equipment: ${equipmentName} (${equipment?.category || "Unknown Category"})
- Quantity Damaged: ${params.quantityDamaged}
- Damage Type: ${params.damageType.toUpperCase()}
- Stage: ${params.damageStage}
- Unit Cost: R${params.unitCost.toFixed(2)}
- Total Cost: R${totalCost.toFixed(2)}

${params.responsibleName ? `Responsible Person: ${params.responsibleName}\n` : ""}${params.description ? `Description: ${params.description}\n` : ""}${params.notes ? `Notes: ${params.notes}\n` : ""}${params.photoUrl ? `Photo: ${params.photoUrl}\n` : ""}
Action Required:
1. Review the damage report
2. Assess repair vs replacement options
3. Update equipment inventory
4. Contact ${params.responsibleName || "responsible party"} if needed

View Details: ${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/admin/equipment-management

This equipment has been removed from available inventory until resolved.

Best regards,
${adminProfile.company_name || "CateringMS Platform"}`;

          await emailAutomationService.sendEmail(
            order.user_id,
            adminProfile.email,
            subject,
            body,
            {
              orderNumber: order.order_number,
              companyName: adminProfile.company_name || "CateringMS"
            }
          );
          console.log("✅ Equipment damage email sent to admin:", adminProfile.email);
        }

        // ✅ FIX BUG #7.2: Send WhatsApp notification to admin (when configured)
        const adminPhone = adminProfile?.phone || adminProfile?.phone_number;
        if (adminPhone) {
          try {
            await whatsappIntegrationService.sendWhatsAppMessage({
              to: adminPhone,
              type: "text",
              text: {
                body: `🔧 Equipment Damage Alert\n\n` +
                      `Order: ${order.order_number}\n` +
                      `Equipment: ${equipmentName}\n` +
                      `Quantity: ${params.quantityDamaged}x ${params.damageType}\n` +
                      `Stage: ${params.damageStage}\n` +
                      `Cost: R${totalCost.toFixed(2)}\n\n` +
                      `${params.responsibleName ? `Responsible: ${params.responsibleName}\n\n` : ""}` +
                      `Action required - equipment removed from inventory.`
              }
            });
            console.log("✅ Equipment damage WhatsApp sent to admin:", adminPhone);
          } catch (whatsappError) {
            console.error("⚠️ WhatsApp notification failed (non-blocking - email sent):", whatsappError);
          }
        }
      } catch (notificationError) {
        console.error("⚠️ Failed to send equipment damage notification (non-blocking):", notificationError);
      }
    }

    return data;
  },

  /**
   * Get all equipment damages with filters
   */
  async getDamages(filters: {
    userId?: string;
    orderId?: string;
    startDate?: string;
    endDate?: string;
    damageType?: DamageType;
    resolved?: boolean;
  }): Promise<EquipmentDamage[]> {
    let query = supabase
      .from("equipment_damages")
      .select(`
        *,
        equipment:equipment_id (
          name,
          category
        ),
        order:order_id (
          order_number,
          event_date
        )
      `)
      .order("created_at", { ascending: false });

    if (filters.orderId) {
      query = query.eq("order_id", filters.orderId);
    }

    if (filters.startDate) {
      query = query.gte("created_at", filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte("created_at", filters.endDate);
    }

    if (filters.damageType) {
      query = query.eq("damage_type", filters.damageType);
    }

    if (filters.resolved !== undefined) {
      query = query.eq("resolved", filters.resolved);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching damages:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Get damage cost breakdown by date range
   */
  async getDamageCostBreakdown(params: {
    userId: string;
    startDate: string;
    endDate: string;
  }): Promise<{
    totalCost: number;
    byType: Record<DamageType, number>;
    byStage: Record<HandoverStage, number>;
    items: Array<{ name: string; cost: number; count: number }>;
  }> {
    const damages = await this.getDamages({
      userId: params.userId,
      startDate: params.startDate,
      endDate: params.endDate,
    });

    const breakdown = {
      totalCost: 0,
      byType: {} as Record<DamageType, number>,
      byStage: {} as Record<HandoverStage, number>,
      items: [] as Array<{ name: string; cost: number; count: number }>,
    };

    const itemMap = new Map<string, { cost: number; count: number }>();

    damages.forEach((damage) => {
      breakdown.totalCost += damage.total_cost;

      breakdown.byType[damage.damage_type] = (breakdown.byType[damage.damage_type] || 0) + damage.total_cost;
      breakdown.byStage[damage.damage_stage] = (breakdown.byStage[damage.damage_stage] || 0) + damage.total_cost;

      const equipmentName = (damage as any).equipment?.name || "Unknown";
      const existing = itemMap.get(equipmentName);
      if (existing) {
        existing.cost += damage.total_cost;
        existing.count += damage.quantity_damaged;
      } else {
        itemMap.set(equipmentName, {
          cost: damage.total_cost,
          count: damage.quantity_damaged,
        });
      }
    });

    breakdown.items = Array.from(itemMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.cost - a.cost);

    return breakdown;
  },

  /**
   * Resolve a damage report
   */
  async resolveDamage(params: {
    damageId: string;
    resolutionNotes: string;
    resolvedByUserId: string;
  }): Promise<EquipmentDamage> {
    const { data, error } = await supabase
      .from("equipment_damages")
      .update({
        resolved: true,
        resolution_notes: params.resolutionNotes,
        resolved_at: new Date().toISOString(),
        resolved_by_user_id: params.resolvedByUserId,
      })
      .eq("id", params.damageId)
      .select()
      .single();

    if (error) {
      console.error("Error resolving damage:", error);
      throw error;
    }

    return data;
  },

  /**
   * Start cleaning duty shift
   */
  async startCleaningDuty(params: {
    userId: string;
    companyId: string;
  }): Promise<CleaningDutyLog> {
    const { data, error } = await supabase
      .from("cleaning_duty_logs")
      .insert({
        user_id: params.userId,
        company_id: params.companyId,
        on_duty: true,
        duty_started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error starting cleaning duty:", error);
      throw error;
    }

    return data;
  },

  /**
   * End cleaning duty shift
   */
  async endCleaningDuty(dutyLogId: string): Promise<CleaningDutyLog> {
    const { data, error } = await supabase
      .from("cleaning_duty_logs")
      .update({
        on_duty: false,
        duty_ended_at: new Date().toISOString(),
      })
      .eq("id", dutyLogId)
      .select()
      .single();

    if (error) {
      console.error("Error ending cleaning duty:", error);
      throw error;
    }

    return data;
  },

  /**
   * Get current on-duty cleaning staff
   */
  async getOnDutyCleaningStaff(companyId: string): Promise<Array<CleaningDutyLog & { profile: any }>> {
    const { data, error } = await supabase
      .from("cleaning_duty_logs")
      .select(`
        *,
        profile:user_id (
          full_name,
          avatar_url,
          email
        )
      `)
      .eq("company_id", companyId)
      .eq("on_duty", true)
      .order("duty_started_at", { ascending: false });

    if (error) {
      console.error("Error fetching on-duty staff:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Verify equipment count upon return
   */
  async verifyEquipmentCount(params: {
    dutyLogId: string;
    verificationNotes?: string;
  }): Promise<CleaningDutyLog> {
    const { data, error } = await supabase
      .from("cleaning_duty_logs")
      .update({
        equipment_verified: true,
        equipment_verified_at: new Date().toISOString(),
        verification_notes: params.verificationNotes,
      })
      .eq("id", params.dutyLogId)
      .select()
      .single();

    if (error) {
      console.error("Error verifying equipment count:", error);
      throw error;
    }

    return data;
  },

  /**
   * Create cleaning status for returned equipment
   */
  async createCleaningStatus(params: {
    orderId: string;
    equipmentId: string;
    returnedQuantity: number;
  }): Promise<EquipmentCleaningStatus> {
    const { data, error } = await supabase
      .from("equipment_cleaning_status")
      .insert({
        order_id: params.orderId,
        equipment_id: params.equipmentId,
        returned_quantity: params.returnedQuantity,
        current_status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating cleaning status:", error);
      throw error;
    }

    return data;
  },

  /**
   * Update cleaning workflow status
   */
  async updateCleaningStatus(params: {
    cleaningStatusId: string;
    status: "pending" | "cleaning" | "drying" | "ready" | "stored";
    cleanedByUserId?: string;
    verifiedByUserId?: string;
  }): Promise<EquipmentCleaningStatus> {
    const updates: any = {
      current_status: params.status,
      updated_at: new Date().toISOString(),
    };

    if (params.status === "cleaning") {
      updates.cleaning_started_at = new Date().toISOString();
      updates.cleaned_by_user_id = params.cleanedByUserId;
    } else if (params.status === "drying") {
      updates.cleaning_completed_at = new Date().toISOString();
      updates.drying_started_at = new Date().toISOString();
    } else if (params.status === "ready") {
      updates.drying_completed_at = new Date().toISOString();
      updates.ready_for_use_at = new Date().toISOString();
      updates.verified_by_user_id = params.verifiedByUserId;
    }

    const { data, error } = await supabase
      .from("equipment_cleaning_status")
      .update(updates)
      .eq("id", params.cleaningStatusId)
      .select()
      .single();

    if (error) {
      console.error("Error updating cleaning status:", error);
      throw error;
    }

    // If ready, notify admin
    if (params.status === "ready" && !data.admin_notified) {
      const { data: statusData } = await supabase
        .from("equipment_cleaning_status")
        .select(`
          order_id,
          equipment:equipment_id (name)
        `)
        .eq("id", params.cleaningStatusId)
        .single();

      if (statusData) {
        const { data: order } = await supabase
          .from("orders")
          .select("user_id, order_number")
          .eq("id", statusData.order_id)
          .single();

        if (order) {
          await supabase.from("notifications").insert({
            user_id: order.user_id,
            recipient_id: order.user_id,
            notification_type: "cleaning_completed",
            title: "✨ Equipment Ready for Use",
            message: `${(statusData as any).equipment?.name} from Order ${order.order_number} has been cleaned, dried, and is ready for next function.`,
            priority: "low",
            order_id: statusData.order_id,
          });

          await supabase
            .from("equipment_cleaning_status")
            .update({
              admin_notified: true,
              admin_notified_at: new Date().toISOString(),
            })
            .eq("id", params.cleaningStatusId);
        }
      }
    }

    return data;
  },

  /**
   * Get cleaning status for an order
   */
  async getOrderCleaningStatus(orderId: string): Promise<EquipmentCleaningStatus[]> {
    const { data, error } = await supabase
      .from("equipment_cleaning_status")
      .select(`
        *,
        equipment:equipment_id (
          name,
          category
        ),
        cleaned_by:cleaned_by_user_id (
          full_name
        ),
        verified_by:verified_by_user_id (
          full_name
        )
      `)
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching cleaning status:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Get all equipment pending cleaning
   */
  async getPendingCleaningEquipment(userId: string): Promise<EquipmentCleaningStatus[]> {
    const { data, error } = await supabase
      .from("equipment_cleaning_status")
      .select(`
        *,
        equipment:equipment_id (
          name,
          category
        ),
        order:order_id (
          order_number,
          event_date,
          user_id
        )
      `)
      .in("current_status", ["pending", "cleaning", "drying"])
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching pending cleaning:", error);
      return [];
    }

    return (data || []).filter((item: any) => item.order?.user_id === userId);
  },
};
