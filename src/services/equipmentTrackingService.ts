/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { sendEmailViaAPI } from "@/lib/emailClient";
import { whatsappIntegrationService } from "./whatsappIntegrationService";
import { notificationService } from "./notificationService";
import { UserRole } from "@/types/app";

type EquipmentHandover = Database["public"]["Tables"]["equipment_handovers"]["Row"];
type EquipmentDamage = Database["public"]["Tables"]["equipment_damages"]["Row"];
type CleaningDutyLog = Database["public"]["Tables"]["cleaning_duty_logs"]["Row"];
// Wave 45 D3: equipment_cleaning_status table dropped, type
// alias removed. Cleaning state now lives in cleaning_jobs.
// EquipmentCleaningStatus type retained as `any` for back-compat
// with consumers expecting it, but no live code path uses it.

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
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("user_id, company_id, order_number, client_name")
      .eq("id", params.orderId)
      .single();
    if (orderErr) console.error("[equipmentTrackingService/reportDamage] orders lookup failed:", orderErr);

    const { data: equipment, error: equipmentErr } = await supabase
      .from("equipment")
      .select("name, category")
      .eq("id", params.equipmentId)
      .single();
    if (equipmentErr) console.error("[equipmentTrackingService/reportDamage] equipment lookup failed:", equipmentErr);
      
    const equipmentName = equipment?.name || "Unknown Equipment";

    if (order) {
      // 1. In-portal notification. Audit (May 2026): old code wrote
      // recipient_id = order.user_id (the CLIENT). Damage alerts
      // belong to the catering company's admin / dispatch team.
      // Broadcast to admin roles within the tenant.
      await notificationService.broadcastNotification({
        companyId: order.company_id,
        type: "equipment_damage",
        title: "🔧 Equipment Damage Reported",
        message: `${params.quantityDamaged}x ${params.damageType} at ${params.damageStage} stage. Order: ${order.order_number}. Cost: R${totalCost.toFixed(2)}`,
        targetRoles: [
          UserRole.SUPER_ADMIN,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
          UserRole.REGION_ADMIN,
        ],
        priority: "high",
        link: `/admin/equipment?tab=shortages&equipmentId=${params.equipmentId}`,
        relatedEntityType: "equipment",
        relatedEntityId: params.equipmentId,
      });

      // Lookup the tenant's owner / first admin to address the email
      // to. Audit (May 2026): the previous lookup used .eq("id",
      // order.user_id) which is the client, not the admin.
      try {
        const { data: adminProfile, error: adminProfileErr } = await supabase
          .from("profiles")
          .select("email, full_name, phone, phone_number")
          .eq("company_id", order.company_id)
          .in("role", ["company_admin", "owner", "admin"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (adminProfileErr) console.error("[equipmentTrackingService/reportDamage] admin profile lookup failed:", adminProfileErr);
        const { data: companyRow, error: companyRowErr } = await supabase
          .from("companies")
          .select("company_name")
          .eq("id", order.company_id)
          .maybeSingle();
        if (companyRowErr) console.error("[equipmentTrackingService/reportDamage] companies lookup failed:", companyRowErr);
        const companyName = (companyRow as any)?.company_name || "CateringMS";

        if (adminProfile?.email) {
          const subject = `🔧 Equipment Damage Alert - Order ${order.order_number}`;
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

View Details: ${typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com")}/admin/equipment-management

This equipment has been removed from available inventory until resolved.

Best regards,
${companyName}`;

          await sendEmailViaAPI({
            companyId: order.company_id,
            to: adminProfile.email,
            subject,
            body,
            variables: {
              orderNumber: order.order_number,
              companyName,
            }
          });
        }

        // WhatsApp ping to the same admin (when configured).
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
   * Create cleaning status for returned equipment.
   *
   * Wave 45 D3 -- migrated to the canonical cleaning_jobs ledger
   * (Wave 41 P2). The legacy equipment_cleaning_status table is
   * being retired. Same call signature for back-compat with
   * EquipmentVerificationPanel; the return shape now mirrors
   * cleaning_jobs (queued/in_progress/complete) rather than the
   * old pending/cleaning/drying/ready/stored model.
   */
  async createCleaningStatus(params: {
    orderId: string;
    equipmentId: string;
    returnedQuantity: number;
  }): Promise<any> {
    // Resolve the order's company_id (cleaning_jobs requires it).
    const { data: orderRow, error: orderErr } = await supabase
      .from("orders")
      .select("company_id")
      .eq("id", params.orderId)
      .maybeSingle();
    if (orderErr) {
      console.error("[equipmentTrackingService] order company lookup failed:", orderErr);
      throw orderErr;
    }
    const companyId = (orderRow as any)?.company_id;
    if (!companyId) {
      throw new Error("createCleaningStatus: order missing company_id");
    }

    const nowIso = new Date().toISOString();
    const oneHourLater = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("cleaning_jobs")
      .insert({
        company_id: companyId,
        equipment_id: params.equipmentId,
        quantity: Math.max(1, Number(params.returnedQuantity || 1)),
        method: "manual",
        status: "queued",
        triggered_by_event_id: params.orderId,
        planned_start: nowIso,
        planned_end: oneHourLater,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating cleaning_jobs row:", error);
      throw error;
    }

    return data;
  },

  /**
   * Update cleaning workflow status. Wave 45 D3 -- migrated to
   * cleaning_jobs (Wave 41 P2 ledger). The 5-state UI model
   * (pending/cleaning/drying/ready/stored) collapses to the
   * 3-state cleaning_jobs model:
   *   pending  -> queued
   *   cleaning -> in_progress (sets actual_start)
   *   drying   -> in_progress (no separate state, see note)
   *   ready    -> complete   (sets actual_end + notify admin)
   *   stored   -> complete   (terminal)
   *
   * Drying-step loss is intentional -- CleaningJobsQueue (the
   * canonical UX) doesn't model drying separately. Add 'drying'
   * to cleaning_jobs.status CHECK + route here if it's ever
   * needed back.
   *
   * Notification dedup: cleaning_jobs has no admin_notified
   * column. We dedup via a notifications-table lookup with a
   * 7-day window keyed off (company, type, related_entity_id).
   */
  async updateCleaningStatus(params: {
    cleaningStatusId: string;
    status: "pending" | "cleaning" | "drying" | "ready" | "stored";
    cleanedByUserId?: string;
    verifiedByUserId?: string;
  }): Promise<any> {
    const nowIso = new Date().toISOString();
    const updates: any = { updated_at: nowIso };

    if (params.status === "pending") {
      updates.status = "queued";
    } else if (params.status === "cleaning" || params.status === "drying") {
      updates.status = "in_progress";
      if (params.status === "cleaning") updates.actual_start = nowIso;
    } else if (params.status === "ready" || params.status === "stored") {
      updates.status = "complete";
      updates.actual_end = nowIso;
    }

    const { data, error } = await supabase
      .from("cleaning_jobs")
      .update(updates)
      .eq("id", params.cleaningStatusId)
      .select()
      .single();

    if (error) {
      console.error("Error updating cleaning_jobs row:", error);
      throw error;
    }

    if ((params.status === "ready" || params.status === "stored") && data) {
      const orderId = (data as any).triggered_by_event_id;
      if (!orderId) return data;

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: recentNotifs, error: dedupErr } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("company_id", (data as any).company_id)
        .eq("notification_type", "cleaning_completed")
        .eq("related_entity_id", orderId)
        .gte("created_at", sevenDaysAgo);
      if (dedupErr) console.error("[equipmentTrackingService/updateCleaningStatus] dedup lookup failed:", dedupErr);
      if (typeof recentNotifs === "number" && recentNotifs > 0) return data;

      const [{ data: eqRow, error: eqErr }, { data: order, error: orderErr }] = await Promise.all([
        supabase.from("equipment").select("name").eq("id", (data as any).equipment_id).maybeSingle(),
        supabase.from("orders").select("user_id, company_id, order_number").eq("id", orderId).maybeSingle(),
      ]);
      if (eqErr) console.error("[equipmentTrackingService/updateCleaningStatus] equipment lookup failed:", eqErr);
      if (orderErr) console.error("[equipmentTrackingService/updateCleaningStatus] orders lookup failed:", orderErr);
      if (!order?.company_id) return data;
      const equipmentName = (eqRow as any)?.name || "Equipment";

      await notificationService.broadcastNotification({
        companyId: order.company_id,
        type: "cleaning_completed",
        title: "Equipment ready for use",
        message: `${equipmentName} from Order ${order.order_number} has been cleaned and is ready for the next function.`,
        targetRoles: [
          UserRole.SUPER_ADMIN,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
          UserRole.REGION_ADMIN,
        ],
        priority: "low",
        link: `/admin/orders?orderId=${orderId}`,
        relatedEntityType: "order",
        relatedEntityId: orderId,
      });

      try {
        const { data: adminProfile, error: adminProfileErr } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("company_id", order.company_id)
          .in("role", ["company_admin", "owner", "admin"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (adminProfileErr) console.error("[equipmentTrackingService/updateCleaningStatus] admin profile lookup failed:", adminProfileErr);
        const { data: companyRow, error: companyRowErr } = await supabase
          .from("companies")
          .select("company_name")
          .eq("id", order.company_id)
          .maybeSingle();
        if (companyRowErr) console.error("[equipmentTrackingService/updateCleaningStatus] companies lookup failed:", companyRowErr);
        const companyName = (companyRow as any)?.company_name || "CateringMS";

        if (adminProfile?.email) {
          const qtyForBody = (data as any).quantity ?? 1;
          const subject = `Equipment ready - ${equipmentName}`;
          const body = `Dear ${adminProfile.full_name || "Admin"},

Equipment cleaning complete.

Equipment: ${equipmentName}
Quantity: ${qtyForBody}
Order: ${order.order_number}

Status: cleaned and ready for use.

This equipment is now available for your next booking.

View inventory: ${typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com")}/inventory

Best regards,
${companyName}`;

          await sendEmailViaAPI({
            companyId: order.company_id,
            to: adminProfile.email,
            subject,
            body,
            variables: { companyName },
          });
        }
      } catch (emailError) {
        console.error("Failed to send equipment ready email (non-blocking):", emailError);
      }
    }

    return data;
  },

  /**
   * Wave 45 D3 -- cleaning_jobs joined by triggered_by_event_id.
   */
  async getOrderCleaningStatus(orderId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("cleaning_jobs")
      .select("*, equipment:equipment_id ( name, category )")
      .eq("triggered_by_event_id", orderId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching cleaning_jobs for order:", error);
      return [];
    }

    return (data as any[]) || [];
  },

  /**
   * getPendingCleaningEquipment was the only feed for
   * CleaningWorkflowTracker, which Wave 42 retired from the
   * cleaning dashboard. The function is dead but kept stubbed
   * for back-compat: returns [] until/unless someone re-mounts
   * the tracker. Use cleaningJobsService.listActiveJobs in new
   * code -- that's the canonical replacement.
   */
  async getPendingCleaningEquipment(_userId: string): Promise<any[]> {
    return [];
  },
};
