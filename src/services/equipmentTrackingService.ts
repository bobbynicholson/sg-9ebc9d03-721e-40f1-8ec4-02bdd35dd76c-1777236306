/* eslint-disable @typescript-eslint/no-explicit-any */
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
    // Tenant-stamp from the order so the verification panel can scope
    // by company_id. Ops audit 2026-06-15: column names reconciled to
    // the real equipment_handovers schema (handed_over_by / handover_time
    // / quantity_sent) plus the migrated equipment_id / company_id.
    const { data: ho } = await supabase
      .from("orders")
      .select("company_id")
      .eq("id", params.orderId)
      .maybeSingle();

    const { data, error } = await supabase
      .from("equipment_handovers")
      .insert({
        company_id: (ho as any)?.company_id ?? null,
        order_id: params.orderId,
        equipment_id: params.equipmentId,
        from_stage: params.fromStage,
        to_stage: params.toStage,
        handed_over_by: params.handedByUserId ?? null,
        quantity_sent: params.quantitySent ?? params.quantity,
        handover_time: new Date().toISOString(),
        notes: params.handedByName ? `Handed over by ${params.handedByName}` : null,
      } as any)
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
        received_by: params.receivedByName,
        quantity_received: params.quantityReceived,
        discrepancy_noted: hasDiscrepancy,
        discrepancy_reason: hasDiscrepancy ? params.discrepancyReason : null,
        received_at: new Date().toISOString(),
      } as any)
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
          replacement_cost
        )
      `)
      .eq("order_id", orderId)
      .order("handover_time", { ascending: true });

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
    orderId?: string;
    companyId?: string;
    equipmentId: string;
    handoverId?: string;
    quantityDamaged: number;
    damageType: DamageType;
    damageStage?: HandoverStage;
    stage?: HandoverStage | string;
    unitCost: number;
    responsibleUserId?: string;
    reportedBy?: string;
    responsibleName?: string;
    description?: string;
    notes?: string;
    photoUrl?: string;
  }): Promise<EquipmentDamage> {
    const quantityDamaged = Math.max(1, Number(params.quantityDamaged || 1));
    const unitCost = Number(params.unitCost || 0);
    const totalCost = quantityDamaged * unitCost;
    const reporterUserId = params.responsibleUserId ?? params.reportedBy ?? null;
    const damageStage = (params.damageStage ?? params.stage ?? "return") as HandoverStage;

    // Resolve company_id (and order context) up front so the damage row
    // is tenant-stamped on insert. RLS policies key on company_id, and
    // a NULL company_id would orphan the row from the analytics that
    // scope by tenant. Ops audit 2026-06-15.
    const { data: order, error: orderErr } = params.orderId
      ? await supabase
        .from("orders")
        .select("user_id, company_id, order_number, client_name")
        .eq("id", params.orderId)
        .single()
      : { data: null, error: null } as any;
    if (orderErr) console.error("[equipmentTrackingService/reportDamage] orders lookup failed:", orderErr);

    const { data: equipment, error: equipmentErr } = await (supabase as any)
      .from("equipment")
      .select("name, category, quantity, available_quantity, company_id")
      .eq("id", params.equipmentId)
      .single();
    if (equipmentErr) console.error("[equipmentTrackingService/reportDamage] equipment lookup failed:", equipmentErr);

    const companyId = order?.company_id ?? params.companyId ?? (equipment as any)?.company_id ?? null;
    if (!companyId) {
      throw new Error("Cannot report equipment damage without company context.");
    }

    let resolvedReporterName = params.responsibleName?.trim() || "";
    if (!resolvedReporterName && reporterUserId) {
      const { data: reporterProfile, error: reporterErr } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", reporterUserId)
        .maybeSingle();
      if (reporterErr) console.warn("[equipmentTrackingService/reportDamage] reporter lookup failed:", reporterErr);
      resolvedReporterName = ((reporterProfile as any)?.full_name || (reporterProfile as any)?.email || "").trim();
    }

    const { data, error } = await supabase
      .from("equipment_damages")
      .insert({
        company_id: companyId,
        order_id: params.orderId ?? null,
        equipment_id: params.equipmentId,
        handover_id: params.handoverId,
        reported_by: reporterUserId,
        quantity_damaged: quantityDamaged,
        damage_type: params.damageType,
        damage_stage: damageStage,
        unit_cost: unitCost,
        total_cost: totalCost,
        repair_cost: totalCost,
        responsible_user_id: reporterUserId,
        responsible_name: resolvedReporterName || null,
        description: params.description,
        notes: params.notes,
        photo_url: params.photoUrl,
      } as any)
      .select()
      .single();

    if (error) {
      console.error("Error reporting damage:", error);
      throw error;
    }

    const equipmentName = (equipment as any)?.name || "Unknown Equipment";

    // Pull the damaged units OUT OF CIRCULATION but do NOT change the owned
    // total. The owner still owns the gear until they formally write it off
    // (admin write-off flow) or bill the client for it - that decision lives
    // in the damage register, not here. So we only drop available_quantity;
    // the damaged count is tracked in equipment_damages and surfaces in the
    // damage report. Display stays "available / owned" (e.g. 49/50), and the
    // damaged/out figure is derivable as owned - available - in_use.
    // Clamped at 0; available never exceeds owned. Best-effort - a deduction
    // miss must never block the damage record.
    try {
      const owned = Number((equipment as any)?.quantity || 0);
      const avail = Number((equipment as any)?.available_quantity || 0);
      const dmg = Math.max(0, Number(quantityDamaged || 0));
      if (dmg > 0) {
        const newAvail = Math.max(0, Math.min(owned, avail - dmg));
        const { error: invErr } = await supabase
          .from("equipment")
          .update({ available_quantity: newAvail, updated_at: new Date().toISOString() } as any)
          .eq("id", params.equipmentId)
          .eq("company_id", companyId);
        if (invErr) {
          console.warn("[equipmentTrackingService/reportDamage] availability deduction failed (non-blocking):", invErr);
        }
      }
    } catch (invE) {
      console.warn("[equipmentTrackingService/reportDamage] availability deduction threw (non-blocking):", invE);
    }

    if (companyId) {
      const orderLabel = order?.order_number ? `Order: ${order.order_number}` : "No linked order";
      const reporterLabel = resolvedReporterName ? ` Reported by ${resolvedReporterName}.` : "";
      // 1. In-portal notification. Audit (May 2026): old code wrote
      // recipient_id = order.user_id (the CLIENT). Damage alerts
      // belong to the catering company's admin / dispatch team.
      // Broadcast to admin roles within the tenant.
      // Admin / dispatch get the cost-focused alert with the deep-link to
      // the shortages tab where they action repair vs replace.
      await notificationService.broadcastNotification({
        companyId,
        type: "equipment_damage",
        title: "🔧 Equipment Damage Reported",
        message: `${quantityDamaged}x ${equipmentName} reported ${params.damageType} at ${damageStage} stage - removed from inventory. ${orderLabel}. Cost: R${totalCost.toFixed(2)}.${reporterLabel}`,
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

      // Kitchen + cleaning teams also need to know stock just dropped - the
      // kitchen plans availability for upcoming events, and cleaning shouldn't
      // keep chasing an item that's been written off. Operational framing (no
      // cost figure), best-effort + dedup so a re-flag doesn't spam the floor.
      try {
        await notificationService.broadcastNotification({
          companyId,
          type: "equipment_damage_kitchen_alert",
          title: "Equipment damaged during service",
          message: `${quantityDamaged}x ${equipmentName} marked ${params.damageType} and pulled from stock. ${orderLabel}.${reporterLabel} Check availability for upcoming events.`,
          targetRoles: ["kitchen_manager" as any, "kitchen_staff" as any],
          managerDispatch: true,
          priority: "normal",
          link: `/team-portal/kitchen/today`,
          relatedEntityType: "equipment",
          relatedEntityId: params.equipmentId,
          dedup: true,
          dedupWindowMinutes: 60,
        } as any);
        await notificationService.broadcastNotification({
          companyId,
          type: "equipment_damage_cleaning_alert",
          title: "Equipment short - item damaged",
          message: `${quantityDamaged}x ${equipmentName} marked ${params.damageType} and pulled from stock. ${orderLabel}.${reporterLabel}`,
          targetRoles: ["cleaning_manager" as any, "cleaning_staff" as any],
          managerDispatch: true,
          priority: "normal",
          link: `/team-portal/cleaning/dashboard`,
          relatedEntityType: "equipment",
          relatedEntityId: params.equipmentId,
          dedup: true,
          dedupWindowMinutes: 60,
        } as any);
      } catch (floorNotifyErr) {
        console.warn("[equipmentTrackingService/reportDamage] floor notify failed (non-blocking):", floorNotifyErr);
      }

      // Lookup the tenant's owner / first admin to address the email
      // to. Audit (May 2026): the previous lookup used .eq("id",
      // order.user_id) which is the client, not the admin.
      try {
        const { data: adminProfile, error: adminProfileErr } = await supabase
          .from("profiles")
          .select("email, full_name, phone, phone_number")
          .eq("company_id", companyId)
          // Wave 64.5 - "owner" isn't a valid user_role enum value;
          // pre-Wave-64.5 PostgREST threw on the .in() and the
          // damage/cleaning notification silently picked no admin.
          .in("role", ["company_admin", "admin"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (adminProfileErr) console.error("[equipmentTrackingService/reportDamage] admin profile lookup failed:", adminProfileErr);
        const { data: companyRow, error: companyRowErr } = await supabase
          .from("companies")
          .select("company_name, slug")
          .eq("id", companyId)
          .maybeSingle();
        if (companyRowErr) console.error("[equipmentTrackingService/reportDamage] companies lookup failed:", companyRowErr);
        const companyName = (companyRow as any)?.company_name || "CateringMS";
        const companySlug = (companyRow as any)?.slug ? `/${(companyRow as any).slug}` : "";

        if (order && adminProfile?.email) {
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

View Details: ${typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com")}${companySlug}/admin/equipment-management

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
        if (order && adminPhone) {
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
    companyId?: string;
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
          event_date,
          event_name,
          client_name
        )
      `)
      .order("created_at", { ascending: false });

    if (filters.companyId) {
      query = query.eq("company_id", filters.companyId);
    }

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
    companyId?: string;
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
      companyId: params.companyId,
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
      } as any)
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
   * Bill a damage to the client, dynamically choosing the right path:
   *
   *   - If the order still has an OPEN invoice (balance_due > 0 - e.g. the
   *     client paid a 50% deposit and the balance is outstanding), the damage
   *     cost is ADDED to that invoice: subtotal/total/balance_due grow, a line
   *     item is appended, and the client simply owes more on the same bill.
   *   - If every invoice on the order is fully paid (or there's no invoice),
   *     a NEW invoice is raised for just the damage amount.
   *
   * Either way the damage is marked resolved with a "Billed..." note so it
   * leaves the open list and can't be double-billed (the UI only shows the
   * action on unresolved rows). Money fields AND the invoice_data line items
   * are kept in lock-step so every surface sums correctly. The client is
   * pinged best-effort.
   */
  async billDamageToClient(params: {
    damageId: string;
    actorUserId: string;
  }): Promise<{ ok: boolean; mode?: "added" | "new_invoice"; invoiceNumber?: string; amount?: number; error?: string }> {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    try {
      const { data: dmgRow } = await supabase
        .from("equipment_damages")
        .select("id, order_id, company_id, equipment_id, quantity_damaged, unit_cost, total_cost, damage_type, description, resolved")
        .eq("id", params.damageId)
        .maybeSingle();
      if (!dmgRow) return { ok: false, error: "Damage not found." };
      const d = dmgRow as any;
      if (d.resolved) return { ok: false, error: "This damage is already resolved/billed." };
      const cost = round2(Number(d.total_cost || 0));
      if (cost <= 0) return { ok: false, error: "No cost on this damage to bill - set a replacement cost first." };
      if (!d.order_id) return { ok: false, error: "This damage isn't linked to an order, so there's no client to bill." };
      const qty = Number(d.quantity_damaged || 1);
      const unitCost = round2(Number(d.unit_cost || cost / Math.max(1, qty)));

      const { data: eqRow } = await supabase.from("equipment").select("name").eq("id", d.equipment_id).maybeSingle();
      const eqName = (eqRow as any)?.name || "equipment";
      const { data: ordRow } = await supabase
        .from("orders")
        .select("order_number, company_id, client_id, client_email, client_name, subtotal, tax_amount, total_amount, balance_amount")
        .eq("id", d.order_id)
        .maybeSingle();
      const ord = ordRow as any;
      const companyId = d.company_id || ord?.company_id;
      // Spell out WHAT + WHY on the line so the client understands the charge:
      // "Damaged equipment charge - 1x Bowl (porcelain) (broken: cracked rim)".
      const reason = String(d.description || "").trim();
      const lineDesc =
        `Damaged equipment charge - ${qty}x ${eqName} ` +
        `(${d.damage_type || "damaged"}${reason ? `: ${reason}` : ""})`;

      // Find a usable open invoice for the order (not voided/written-off,
      // with an outstanding balance). Most-recent first.
      const { data: invs } = await supabase
        .from("invoices")
        .select("id, subtotal, tax_amount, total_amount, amount_paid, balance_due, status, invoice_number, notes, invoice_data, public_token")
        .eq("order_id", d.order_id)
        .order("created_at", { ascending: false });
      const usable = ((invs || []) as any[]).filter(
        (i) => !["voided", "written_off"].includes(String(i.status || "")),
      );
      const openInv = usable.find((i) => Number(i.balance_due || 0) > 0.009);

      let mode: "added" | "new_invoice";
      let invoiceNumber: string;
      let outstandingAfter = cost; // what the client owes after this charge
      let payToken: string | null = null; // public_token for the /pay/i link

      if (openInv) {
        const newSubtotal = round2(Number(openInv.subtotal || 0) + cost);
        const newTotal = round2(Number(openInv.total_amount || 0) + cost);
        const newBalance = round2(Number(openInv.balance_due || 0) + cost);
        const paid = Number(openInv.amount_paid || 0);
        const newStatus = paid > 0 ? "partially_paid" : "sent";
        // Keep invoice_data line items in step with the column money fields.
        const idata: any = openInv.invoice_data && typeof openInv.invoice_data === "object" ? { ...openInv.invoice_data } : {};
        const items = Array.isArray(idata.items) ? [...idata.items] : [];
        items.push({ description: lineDesc, quantity: qty, unitPrice: unitCost, total: cost });
        idata.items = items;
        idata.subtotal = round2(Number(idata.subtotal || 0) + cost);
        idata.total = round2(Number(idata.total || 0) + cost);
        idata.balanceDue = round2(Number(idata.balanceDue || 0) + cost);
        const noteLine = `${lineDesc} +R${cost.toFixed(2)} (damage charge)`;
        const { error: updErr } = await supabase
          .from("invoices")
          .update({
            subtotal: newSubtotal,
            total_amount: newTotal,
            balance_due: newBalance,
            status: newStatus,
            paid_at: null,
            notes: openInv.notes ? `${openInv.notes}\n${noteLine}` : noteLine,
            invoice_data: idata,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", openInv.id);
        // Abort on failure - don't bump the order / mark billed without the
        // invoice actually carrying the charge.
        if (updErr) {
          return { ok: false, error: `Could not add the charge to invoice ${openInv.invoice_number}: ${updErr.message}` };
        }
        mode = "added";
        invoiceNumber = openInv.invoice_number;
        outstandingAfter = newBalance;
        payToken = openInv.public_token || null;
      } else {
        // Client is square - raise a fresh invoice for just the damage.
        invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
        const todayIso = new Date().toISOString().slice(0, 10);
        const dueIso = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
        let idata: any = null;
        try {
          const { generateInvoiceData } = await import("./invoiceGenerationService");
          const built = await generateInvoiceData(d.order_id, companyId);
          if (built.success && built.data) {
            idata = {
              ...built.data,
              invoiceNumber,
              invoiceDate: todayIso,
              dueDate: dueIso,
              items: [{ description: lineDesc, quantity: qty, unitPrice: unitCost, total: cost }],
              subtotal: cost,
              taxRate: 0,
              taxAmount: 0,
              total: cost,
              depositPaid: 0,
              balanceDue: cost,
              notes: `Equipment damage charge for order ${ord?.order_number || ""}.`,
            };
          }
        } catch (e) {
          console.warn("[billDamageToClient] generateInvoiceData failed (non-blocking):", e);
        }
        const { data: newInv, error: insErr } = await supabase
          .from("invoices")
          .insert({
            company_id: companyId,
            order_id: d.order_id,
            client_id: ord?.client_id || null,
            invoice_number: invoiceNumber,
            invoice_date: todayIso,
            due_date: dueIso,
            subtotal: cost,
            tax_amount: 0,
            total_amount: cost,
            amount_paid: 0,
            balance_due: cost,
            status: "sent",
            notes: `Equipment damage charge: ${lineDesc} (order ${ord?.order_number || ""})`,
            invoice_data: idata,
          } as any)
          .select("public_token")
          .single();
        // Abort on a failed insert - otherwise we'd bump the order + mark the
        // damage billed with NO invoice behind it (a phantom charge).
        if (insErr) {
          return { ok: false, error: `Could not raise the damage invoice: ${insErr.message}` };
        }
        mode = "new_invoice";
        outstandingAfter = cost;
        payToken = (newInv as any)?.public_token || null;
      }

      // Keep the admin order Finance "real": fold the charge into the ORDER
      // totals too (that section reads orders.*, not the invoice). Split the
      // VAT the same way the order is taxed so Total = Subtotal + VAT still
      // holds, and grow the outstanding balance. A payment sweeper that later
      // recomputes balance as (total - paid) stays consistent because we bump
      // total_amount by the same amount. Best-effort - never blocks the bill.
      try {
        const oSub = Number(ord?.subtotal || 0);
        const oTax = Number(ord?.tax_amount || 0);
        const oTotal = Number(ord?.total_amount || 0);
        const oBal = ord?.balance_amount != null ? Number(ord.balance_amount) : Math.max(0, oTotal);
        const rate = oSub > 0 && oTax > 0 ? oTax / oSub : 0;
        const net = rate > 0 ? round2(cost / (1 + rate)) : cost;
        const vat = round2(cost - net);
        const newBal = round2(oBal + cost);
        // The new charge creates outstanding balance, so the order is no longer
        // "paid in full" - flip the flags too, otherwise it reads balance_paid
        // true with a non-zero balance (the inconsistency this bug caused).
        const nowFullyPaid = newBal <= 0.009;
        await supabase
          .from("orders")
          .update({
            subtotal: round2(oSub + net),
            tax_amount: round2(oTax + vat),
            total_amount: round2(oTotal + cost),
            balance_amount: newBal,
            balance_paid: nowFullyPaid,
            payment_status: nowFullyPaid ? "paid" : "partial",
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", d.order_id);
      } catch (orderErr) {
        console.warn("[billDamageToClient] order total update failed (non-blocking):", orderErr);
      }

      // Close the damage out with a billed note (also stops double-billing).
      await supabase
        .from("equipment_damages")
        .update({
          resolved: true,
          resolution_notes:
            mode === "added"
              ? `Billed to client - added R${cost.toFixed(2)} to outstanding invoice ${invoiceNumber}.`
              : `Billed to client - new invoice ${invoiceNumber} for R${cost.toFixed(2)}.`,
          resolved_at: new Date().toISOString(),
          resolved_by_user_id: params.actorUserId,
        } as any)
        .eq("id", params.damageId);

      // Tell the client a charge landed (best-effort).
      try {
        if (ord?.client_id && companyId) {
          const { data: cl } = await supabase.from("clients").select("user_id").eq("id", ord.client_id).maybeSingle();
          const clientUid = (cl as any)?.user_id;
          if (clientUid) {
            await notificationService.createNotification({
              company_id: companyId,
              recipient_id: clientUid,
              user_id: clientUid,
              notification_type: "invoice_updated",
              title: "Damage charge added to your bill",
              message:
                mode === "added"
                  ? `A charge of R${cost.toFixed(2)} for ${qty}x ${eqName} was added to invoice ${invoiceNumber}.`
                  : `Invoice ${invoiceNumber} for R${cost.toFixed(2)} was raised for ${qty}x ${eqName} damaged at your event.`,
              priority: "normal",
              link: "/client-portal/dashboard",
              related_entity_type: "order",
              related_entity_id: d.order_id,
            } as any);
          }
        }
      } catch (notifyErr) {
        console.warn("[billDamageToClient] client notify failed (non-blocking):", notifyErr);
      }

      // Email the client a CORRECT, purpose-built damage-charge note. We do
      // NOT reuse the deposit/balance invoice email - that template framed the
      // charge as a fresh "deposit invoice", showed the whole invoice total
      // instead of the new balance, and carried a broken pay link. This says
      // exactly what happened: the charge amount, the new outstanding balance,
      // and a working portal link. Best-effort - no-ops without an email key.
      try {
        if (ord?.client_email) {
          const { emailService } = await import("@/services/emailService");
          const { data: comp } = await supabase
            .from("companies")
            .select("company_name, slug")
            .eq("id", companyId)
            .maybeSingle();
          const companyName = (comp as any)?.company_name || "Our team";
          const slug = (comp as any)?.slug || "";
          const origin =
            typeof window !== "undefined" && window.location?.origin
              ? window.location.origin
              : "https://cateringms.com";
          // Prefer the PUBLIC invoice page (/pay/i/{token}) so the client
          // sees the full itemised invoice + can pay WITHOUT logging into the
          // portal. Fall back to the portal dashboard only if no token.
          const portalLink = payToken
            ? `${origin}/pay/i/${payToken}`
            : slug
              ? `${origin}/${slug}/client-portal/dashboard`
              : `${origin}/client-portal/dashboard`;
          const firstName = String(ord.client_name || "there").trim().split(/\s+/)[0] || "there";
          const fmtR = (n: number) => `R ${Number(n || 0).toFixed(2)}`;
          await emailService.sendEmail({
            companyId,
            to: ord.client_email,
            template: "equipment_damage_charge",
            subject: `Charge added to your invoice ${invoiceNumber} - ${companyName}`,
            body:
              `Hi {{first_name}},\n\n` +
              `A charge of {{charge}} for {{qty}}x {{equipment}} damaged at your event has been ` +
              (mode === "added"
                ? `added to your invoice {{invoice_number}}.`
                : `issued as invoice {{invoice_number}}.`) +
              `\n\n` +
              `Your outstanding balance is now {{balance}}.\n\n` +
              `You can view and settle it in your portal:\n{{portal_link}}\n\n` +
              `Thanks,\n{{company_name}}`,
            variables: {
              first_name: firstName,
              charge: fmtR(cost),
              qty: String(qty),
              equipment: eqName,
              invoice_number: invoiceNumber,
              balance: fmtR(outstandingAfter),
              portal_link: portalLink,
              company_name: companyName,
            },
            orderId: d.order_id,
          } as any);
        }
      } catch (emailErr) {
        console.warn("[billDamageToClient] damage charge email failed (non-blocking):", emailErr);
      }

      return { ok: true, mode, invoiceNumber, amount: cost };
    } catch (e: any) {
      return { ok: false, error: e?.message || "billDamageToClient crashed" };
    }
  },

  /**
   * Start cleaning duty shift
   */
  async startCleaningDuty(params: {
    userId: string;
    companyId: string;
    // CLN2-H (CLN2-68): optional GPS captured by the widget. All three
    // are nullable because the cleaner can refuse geolocation and we
    // still let them clock in - admin sees the NULL coords and decides
    // whether to follow up.
    clockInLat?: number | null;
    clockInLng?: number | null;
    clockInAccuracyM?: number | null;
  }): Promise<CleaningDutyLog> {
    const { data, error } = await supabase
      .from("cleaning_duty_logs")
      .insert({
        user_id: params.userId,
        company_id: params.companyId,
        on_duty: true,
        duty_started_at: new Date().toISOString(),
        clock_in_lat: params.clockInLat ?? null,
        clock_in_lng: params.clockInLng ?? null,
        clock_in_accuracy_m: params.clockInAccuracyM ?? null,
      } as any)
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
  async endCleaningDuty(
    dutyLogId: string,
    options: { reason?: string; note?: string } = {},
  ): Promise<CleaningDutyLog> {
    const endedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("cleaning_duty_logs")
      .update({
        on_duty: false,
        duty_ended_at: endedAt,
        duty_end_reason: options.reason ?? "manual",
        duty_end_note: options.note?.trim() || "No note supplied.",
      } as any)
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
   * Dynamic clock-out for cleaning. Mirrors the driver's autoClockOut
   * (driverPayService) but for the cleaning queue: a cleaner clocks in,
   * works the cleaning_jobs, and the moment the LAST active job for the
   * company is done, their open cleaning_duty_logs session closes itself
   * - no manual "Clock out" tap needed.
   *
   * Scope is deliberately the ACTOR only (when userId is passed): if two
   * cleaners are on the floor and one finishes the queue, we don't yank
   * the other off duty - we close the session of whoever ticked the last
   * job. Pass userId from the page's auth context. When userId is omitted
   * we fall back to closing every open session for the company (used by
   * server/cron paths with no single actor).
   *
   * Returns { ended, remaining } so the caller can toast "all done,
   * clocked out" vs stay quiet. Best-effort: never throws - a clock-out
   * miss must not block the job completing.
   */
  async autoEndCleaningDutyIfClear(params: {
    companyId: string;
    userId?: string | null;
  }): Promise<{ ended: number; remaining: number }> {
    try {
      // Any cleaning jobs still queued / in_progress for this company?
      const { data: active, error: activeErr } = await (supabase as any)
        .from("cleaning_jobs")
        .select("id")
        .eq("company_id", params.companyId)
        .is("deleted_at", null)
        .in("status", ["queued", "in_progress"]);
      if (activeErr) {
        console.warn("[autoEndCleaningDutyIfClear] active-jobs read failed:", activeErr);
        return { ended: 0, remaining: -1 };
      }
      const remaining = (active || []).length;
      if (remaining > 0) return { ended: 0, remaining };

      // Queue is clear. Close the relevant open duty session(s).
      let q = (supabase as any)
        .from("cleaning_duty_logs")
        .select("id, user_id")
        .eq("company_id", params.companyId)
        .eq("on_duty", true);
      if (params.userId) q = q.eq("user_id", params.userId);
      const { data: openLogs, error: openErr } = await q;
      if (openErr) {
        console.warn("[autoEndCleaningDutyIfClear] open-duty read failed:", openErr);
        return { ended: 0, remaining: 0 };
      }
      const targets = (openLogs || []) as Array<{ id: string; user_id: string }>;
      if (targets.length === 0) return { ended: 0, remaining: 0 };

      const nowIso = new Date().toISOString();
      let ended = 0;
      for (const log of targets) {
        const { error: updErr } = await (supabase as any)
          .from("cleaning_duty_logs")
          .update({
            on_duty: false,
            duty_ended_at: nowIso,
            duty_end_reason: "auto_queue_clear",
            duty_end_note: "Cleaning queue cleared; shift closed automatically. No additional note supplied.",
          } as any)
          .eq("id", log.id);
        if (updErr) {
          console.warn("[autoEndCleaningDutyIfClear] duty close failed:", updErr);
          continue;
        }
        ended += 1;
        // Tell the cleaner their shift auto-closed because the queue is
        // clear (best-effort, mirrors the driver kitchen_clock_out ping).
        try {
          const { notificationService } = await import("@/services/notificationService");
          await notificationService.createNotification({
            company_id: params.companyId,
            recipient_id: log.user_id,
            user_id: log.user_id,
            notification_type: "cleaning_clock_out",
            title: "Clocked out - all cleaning done",
            message: "Every cleaning job in the queue is finished, so your shift was closed automatically. Nice work!",
            priority: "low",
            link: "/team-portal/cleaning/dashboard",
          } as any);
        } catch (notifyErr) {
          console.warn("[autoEndCleaningDutyIfClear] cleaner notify failed:", notifyErr);
        }
      }
      return { ended, remaining: 0 };
    } catch (e) {
      console.warn("[autoEndCleaningDutyIfClear] crashed (non-blocking):", e);
      return { ended: 0, remaining: -1 };
    }
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
      } as any)
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
   * Wave 45 D3 - migrated to the canonical cleaning_jobs ledger
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

    const { data, error } = await (supabase as any)
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
   * Update cleaning workflow status. Wave 45 D3 - migrated to
   * cleaning_jobs (Wave 41 P2 ledger). The 5-state UI model
   * (pending/cleaning/drying/ready/stored) collapses to the
   * 3-state cleaning_jobs model:
   *   pending  -> queued
   *   cleaning -> in_progress (sets actual_start)
   *   drying   -> in_progress (no separate state, see note)
   *   ready    -> complete   (sets actual_end + notify admin)
   *   stored   -> complete   (terminal)
   *
   * Drying-step loss is intentional - CleaningJobsQueue (the
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

    const { data, error } = await (supabase as any)
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
        link: `/order/${orderId}?role=admin`,
        relatedEntityType: "order",
        relatedEntityId: orderId,
      });

      try {
        const { data: adminProfile, error: adminProfileErr } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("company_id", order.company_id)
          // Wave 64.5 - "owner" isn't a valid user_role enum value;
          // pre-Wave-64.5 PostgREST threw on the .in() and the
          // damage/cleaning notification silently picked no admin.
          .in("role", ["company_admin", "admin"])
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
   * Wave 45 D3 - cleaning_jobs joined by triggered_by_event_id.
   */
  async getOrderCleaningStatus(orderId: string): Promise<any[]> {
    const { data, error } = await (supabase as any)
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
   * code - that's the canonical replacement.
   */
  async getPendingCleaningEquipment(_userId: string): Promise<any[]> {
    return [];
  },
};
