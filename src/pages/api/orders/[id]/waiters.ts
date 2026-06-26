/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { textMentionsWaiterService, waiterRequestSummary } from "@/lib/waiterRequest";
import { UserRole } from "@/types/app";

const ADMIN_ASSIGN_ROLES = new Set([
  "super_admin",
  "company_admin",
  "owner",
  "admin",
  "region_admin",
]);

const WAITER_DEPARTMENTS = new Set(["waiter", "waitering", "server"]);

function getOrderId(req: NextApiRequest): string {
  const raw = req.query.id;
  return String(Array.isArray(raw) ? raw[0] : raw || "").trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hasServiceStamp(row: any): boolean {
  return !!(
    row?.arrived_at ||
    row?.setup_started_at ||
    row?.guests_arrived_at ||
    row?.service_started_at ||
    row?.service_ended_at ||
    row?.event_complete_at ||
    row?.equipment_returned_at ||
    row?.notes
  );
}

async function resolveCaller(req: NextApiRequest, res: NextApiResponse) {
  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { error: { status: 401, message: "Not signed in" } as const };

  const { data: profile, error } = await ssr
    .from("profiles")
    .select("id, role, active_role, company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile) {
    return { error: { status: 403, message: "Caller profile not found" } as const };
  }

  const role = String((profile as any).active_role || (profile as any).role || "");
  if (!ADMIN_ASSIGN_ROLES.has(role)) {
    return { error: { status: 403, message: "Admin access required to assign waiter staff" } as const };
  }

  return { user, profile: profile as any, role };
}

async function loadOrderForCaller(admin: any, orderId: string, callerProfile: any, callerRole: string) {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, company_id, order_number, event_name, event_date, event_time, requires_waiter, waiter_service_required, deleted_at")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order || (order as any).deleted_at) {
    return { error: { status: 404, message: "Order not found" } as const };
  }
  if (callerRole !== "super_admin" && (callerProfile as any).company_id !== (order as any).company_id) {
    return { error: { status: 403, message: "Wrong company" } as const };
  }
  return { order: order as any };
}

async function loadWaiterCandidates(admin: any, companyId: string) {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name, email, role, active_role, is_active")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .or("is_active.eq.true,is_active.is.null")
    .order("full_name", { ascending: true });
  if (error) throw error;

  const profileRows = (profiles || []) as any[];
  const profileIds = profileRows.map((p) => p.id).filter(Boolean);
  const departmentMap = new Map<string, string[]>();
  if (profileIds.length > 0) {
    const { data: departments, error: deptError } = await admin
      .from("user_departments")
      .select("user_id, department")
      .in("user_id", profileIds);
    if (deptError) throw deptError;
    for (const row of (departments || []) as any[]) {
      if (!row.user_id) continue;
      const next = departmentMap.get(row.user_id) || [];
      if (row.department) next.push(String(row.department));
      departmentMap.set(row.user_id, next);
    }
  }

  return profileRows
    .filter((p) => {
      const role = String(p.role || "");
      const activeRole = String(p.active_role || "");
      const departments = departmentMap.get(p.id) || [];
      return role === "waiter" ||
        activeRole === "waiter" ||
        departments.some((department) => WAITER_DEPARTMENTS.has(department));
    })
    .map((p) => ({
      id: p.id,
      full_name: p.full_name || p.email || "Waiter",
      email: p.email || null,
      role: p.role || null,
      active_role: p.active_role || null,
      departments: departmentMap.get(p.id) || [],
    }));
}

async function loadWaiterRequests(admin: any, orderId: string) {
  const { data, error } = await admin
    .from("order_amendment_requests")
    .select("id, status, requested_at, client_notes, proposed_changes")
    .eq("order_id", orderId)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(5);
  if (error) throw error;

  return ((data || []) as any[])
    .filter((row) => textMentionsWaiterService(row.client_notes, row.proposed_changes))
    .map((row) => ({
      id: row.id,
      status: row.status,
      requested_at: row.requested_at,
      client_notes: row.client_notes || null,
      summary: waiterRequestSummary(row.client_notes, row.proposed_changes),
    }));
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const orderId = getOrderId(req);
  if (!isUuid(orderId)) {
    return res.status(400).json({ error: "Valid order id required" });
  }

  try {
    const caller = await resolveCaller(req, res);
    if ("error" in caller) {
      return res.status(caller.error.status).json({ error: caller.error.message });
    }

    const admin = getServiceSupabase();
    const orderResult = await loadOrderForCaller(admin, orderId, caller.profile, caller.role);
    if ("error" in orderResult) {
      return res.status(orderResult.error.status).json({ error: orderResult.error.message });
    }
    const order = orderResult.order;

    if (req.method === "GET") {
      const [candidates, waiterRequests] = await Promise.all([
        loadWaiterCandidates(admin, order.company_id),
        loadWaiterRequests(admin, orderId),
      ]);
      return res.status(200).json({
        ok: true,
        service_required: !!(order.requires_waiter || order.waiter_service_required),
        candidates,
        waiter_requests: waiterRequests,
      });
    }

    if (req.method === "POST") {
      const waiterId = String((req.body || {}).waiter_id || "").trim();
      if (!isUuid(waiterId)) {
        return res.status(400).json({ error: "waiter_id is required" });
      }

      const candidates = await loadWaiterCandidates(admin, order.company_id);
      const waiter = candidates.find((candidate) => candidate.id === waiterId);
      if (!waiter) {
        return res.status(400).json({ error: "That user is not an active waiter for this company" });
      }

      const { data: assignment, error: upsertError } = await (admin as any)
        .from("event_attendance")
        .upsert({
          company_id: order.company_id,
          order_id: orderId,
          waiter_id: waiterId,
        }, { onConflict: "order_id,waiter_id" })
        .select("id, order_id, waiter_id")
        .single();
      if (upsertError) {
        return res.status(500).json({ error: dbErrorMessage(upsertError) });
      }

      await admin
        .from("orders")
        .update({
          requires_waiter: true,
          waiter_service_required: true,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", orderId);

      try {
        const { notificationService } = await import("@/services/notificationService");
        await notificationService.createNotification({
          company_id: order.company_id,
          recipient_id: waiterId,
          user_id: caller.user.id,
          notification_type: "waiter_assigned",
          title: "Service job assigned",
          message: `You have been assigned to service ${order.event_name || order.order_number || "an event"}. Open the order brief before you go on site.`,
          priority: "high",
          target_role: UserRole.WAITER,
          link: `/order/${orderId}?role=waiter`,
          related_entity_type: "order",
          related_entity_id: orderId,
          dedup: true,
        }, admin);
      } catch (notifyErr) {
        console.warn("[orders/waiters] waiter notification failed:", notifyErr);
      }

      try {
        await admin.from("audit_logs").insert({
          company_id: order.company_id,
          user_id: caller.user.id,
          action: "waiter_assigned",
          entity_type: "order",
          entity_id: orderId,
          details: {
            waiter_id: waiterId,
            waiter_name: waiter.full_name,
            assignment_id: (assignment as any)?.id || null,
          },
        });
      } catch (auditErr) {
        console.warn("[orders/waiters] audit insert failed:", auditErr);
      }

      return res.status(200).json({ ok: true, assignment, waiter });
    }

    if (req.method === "DELETE") {
      const waiterId = String((req.body || {}).waiter_id || "").trim();
      if (!isUuid(waiterId)) {
        return res.status(400).json({ error: "waiter_id is required" });
      }

      const { data: existing, error: existingError } = await (admin as any)
        .from("event_attendance")
        .select("id, arrived_at, setup_started_at, guests_arrived_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at, notes")
        .eq("order_id", orderId)
        .eq("waiter_id", waiterId)
        .maybeSingle();
      if (existingError) {
        return res.status(500).json({ error: dbErrorMessage(existingError) });
      }
      if (!existing) {
        return res.status(404).json({ error: "Waiter assignment not found" });
      }
      if (hasServiceStamp(existing)) {
        return res.status(409).json({
          error: "This waiter has already started service notes or phase taps, so the attendance record cannot be removed.",
        });
      }

      const { error: deleteError } = await (admin as any)
        .from("event_attendance")
        .delete()
        .eq("id", (existing as any).id);
      if (deleteError) {
        return res.status(500).json({ error: dbErrorMessage(deleteError) });
      }

      try {
        await admin.from("audit_logs").insert({
          company_id: order.company_id,
          user_id: caller.user.id,
          action: "waiter_unassigned",
          entity_type: "order",
          entity_id: orderId,
          details: { waiter_id: waiterId, assignment_id: (existing as any).id },
        });
      } catch (auditErr) {
        console.warn("[orders/waiters] audit insert failed:", auditErr);
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("[orders/waiters] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Could not update waiter assignment" });
  }
}

export default withApiLogging(handler);
