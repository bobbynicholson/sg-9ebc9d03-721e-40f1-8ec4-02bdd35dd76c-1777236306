import type { NextApiRequest, NextApiResponse } from "next";
import { servicePlanAccess } from "@/lib/servicePlanAccess";
import { withApiLogging } from "@/lib/withApiLogging";
import { isUuid } from "@/lib/embedFormApi";
import { normaliseServiceSittings } from "@/lib/serviceSittings";

export const maxDuration = 60;

type ScheduleSnapshot = { assignments: any[]; sittings: any[] };

async function readScheduleSnapshot(db: any, orderId: string, companyId: string): Promise<ScheduleSnapshot | null> {
  if (typeof db?.from !== "function") return null;
  try {
    const [assignments, sittings] = await Promise.all([
      db.from("driver_assignments").select("service_sitting_id,driver_id,assignment_type,status,scheduled_for")
        .eq("order_id", orderId).eq("company_id", companyId),
      db.from("service_sittings").select("id,sequence_number,guest_count,service_time,venue_name,venue_address,venue_lat,venue_lng,dispatch_time,return_date,return_time")
        .eq("order_id", orderId).eq("company_id", companyId),
    ]);
    if (assignments.error || sittings.error) return null;
    return { assignments: assignments.data || [], sittings: sittings.data || [] };
  } catch {
    return null;
  }
}

async function notifyDriversOfScheduleChanges(db: any, orderId: string, companyId: string, before: ScheduleSnapshot | null) {
  if (!before) return;
  const after = await readScheduleSnapshot(db, orderId, companyId);
  if (!after) return;
  const active = (row: any) => !["cancelled", "rejected", "completed"].includes(String(row.status || "").toLowerCase());
  const sittingById = new Map(after.sittings.map((row: any) => [row.id, row]));
  const previousSittings = new Map(before.sittings.map((row: any) => [row.id, row]));
  const changedSittings = new Set<string>();
  const comparedFields = ["sequence_number", "guest_count", "service_time", "venue_name", "venue_address", "venue_lat", "venue_lng", "dispatch_time", "return_date", "return_time"];
  for (const sitting of after.sittings) {
    const previous = previousSittings.get(sitting.id) as any;
    if (!previous || comparedFields.some(field => (previous[field] ?? null) !== (sitting[field] ?? null))) changedSittings.add(sitting.id);
  }

  const key = (row: any) => `${row.service_sitting_id}:${row.assignment_type}:${row.driver_id}`;
  const previousAssignments = new Map(before.assignments.map((row: any) => [key(row), row]));
  const currentAssignments = new Map(after.assignments.map((row: any) => [key(row), row]));
  const messages = new Map<string, Set<string>>();
  const add = (driverId: string | null, message: string) => {
    if (!driverId) return;
    const items = messages.get(driverId) || new Set<string>();
    items.add(message);
    messages.set(driverId, items);
  };
  const tripLabel = (row: any) => {
    const sitting: any = sittingById.get(row.service_sitting_id) || previousSittings.get(row.service_sitting_id);
    const leg = row.assignment_type === "collection" ? "equipment collection" : "delivery";
    return `Sitting ${sitting?.sequence_number || "service"} ${leg}`;
  };

  for (const previous of before.assignments) {
    if (!previous.service_sitting_id || !active(previous)) continue;
    const current: any = currentAssignments.get(key(previous));
    if (!current || !active(current)) add(previous.driver_id, `You are no longer assigned to ${tripLabel(previous)} for this booking.`);
  }
  for (const current of after.assignments) {
    if (!current.service_sitting_id || !active(current)) continue;
    const previous: any = previousAssignments.get(key(current));
    if (!previous || !active(previous)) {
      add(current.driver_id, `New assignment: ${tripLabel(current)}. Check Driver Trips for its schedule and destination.`);
    } else if (previous.scheduled_for !== current.scheduled_for || changedSittings.has(current.service_sitting_id)) {
      add(current.driver_id, `${tripLabel(current)} details changed. Refresh Driver Trips to see the latest guest split, schedule, and destination.`);
    }
  }
  if (!messages.size) return;

  try {
    const { notificationService } = await import("@/services/notificationService");
    const results = await Promise.allSettled(Array.from(messages, ([driverId, notes]) => notificationService.createNotification({
      company_id: companyId,
      recipient_id: driverId,
      type: "driver_assigned",
      title: "Sitting trip updated",
      message: Array.from(notes).join(" "),
      priority: "high",
      link: "/team-portal/driver/deliveries",
      related_entity_type: "order",
      related_entity_id: orderId,
      metadata: { source: "sitting_schedule" },
    }, db)));
    results.forEach((result, index) => {
      if (result.status === "rejected") console.warn("[service-plan] driver schedule notification failed:", Array.from(messages.keys())[index], result.reason);
    });
  } catch (error) {
    console.warn("[service-plan] driver schedule notification failed:", error);
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const access = await servicePlanAccess(req, res);
  if (!access) return;
  if (!access.isAdmin) return res.status(403).json({ error: "Only an administrator can schedule these trips." });
  const id = String(req.query.id || "");
  if (!isUuid(id)) return res.status(400).json({ error: "Invalid booking." });
  const sittings = req.body?.sittings;
  const returnPlan = req.body?.returnPlan;
  const confirmDriverOverlap = req.body?.confirmDriverOverlap === true;
  const confirmActiveWork = req.body?.confirmActiveWork === true;
  const lastSequence = Array.isArray(sittings)
    ? Math.max(0, ...sittings.map((row: any) => Number(row.sequence_number) || 0))
    : 0;
  // Collection drivers default to the drivers assigned to deliver that
  // sitting. An explicit collection-driver choice still takes precedence.
  // Keep this default on the server as well as in the editor so requests
  // from an older client cannot silently save an unassigned collection.
  const operations = Array.isArray(sittings)
    ? sittings.map((row: any) => {
        const safeRow = { ...row };
        // Never trust an overlap override nested in submitted sitting data;
        // only the explicit admin confirmation below may set it.
        delete safeRow.allowDriverOverlap;
        const collectionRequired = returnPlan === "per_sitting_collection"
          || (returnPlan === "final_collection" && Number(row.sequence_number) === lastSequence);
        const deliveryDriverIds = Array.isArray(row.deliveryDriverIds) ? row.deliveryDriverIds : [];
        const collectionDriverIds = Array.isArray(row.collectionDriverIds) ? row.collectionDriverIds : [];
        return {
          ...safeRow,
          ...(confirmDriverOverlap ? { allowDriverOverlap: true } : {}),
          collectionDriverIds: collectionRequired && collectionDriverIds.length === 0
            ? deliveryDriverIds
            : collectionDriverIds,
        };
      })
    : sittings;
  const editsPlan = Array.isArray(operations) && operations.some((row: any) => row.guest_count !== undefined || row.service_time !== undefined);
  const scheduleBefore = await readScheduleSnapshot(access.db, id, access.companyId);
  let tasks: unknown[] = [];
  if (editsPlan) {
    const plan = normaliseServiceSittings(operations.map((row: any) => ({ guestCount: row.guest_count, serviceTime: String(row.service_time || "").slice(0, 5), venueName: row.venue_name ?? row.venueName, venueAddress: row.venue_address ?? row.venueAddress, venueLat: row.venue_lat ?? row.venueLat, venueLng: row.venue_lng ?? row.venueLng, kitchenReadyTime: row.kitchenReadyTime, dispatchTime: row.dispatchTime })), operations.reduce((sum: number, row: any) => sum + Number(row.guest_count || 0), 0));
    if (plan.error || operations.some((row: any) => !isUuid(row.id))) return res.status(400).json({ error: plan.error || "Reload the sitting plan before saving." });
    try {
      const { kitchenPrepService } = await import("@/services/kitchenPrepService");
      tasks = await kitchenPrepService.planTasksForOrder(access.companyId, id, access.db, plan.value!.map((row, index) => ({ ...row, id: operations[index].id, sequenceNumber: Number(operations[index].sequence_number) || index + 1, kitchenReadyTime: row.kitchenReadyTime || undefined, dispatchTime: row.dispatchTime || undefined })));
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "The kitchen plan could not be prepared. Your changes have not been saved." });
    }
  }
  let { error } = await access.db.rpc(editsPlan ? "save_admin_order_service_plan_with_venues" : "save_order_sitting_operations_with_venues", {
    p_order_id: id, p_company_id: access.companyId,
    p_operations: operations,
    p_return_plan: returnPlan,
    ...(editsPlan ? { p_kitchen_tasks: tasks, p_confirm_active_work: confirmActiveWork } : {}),
  });
  // During deployment/schema-cache refresh, keep already saved trip plans
  // usable. A new guest/time split must wait for the atomic transaction.
  if (editsPlan && error?.code === "PGRST202") {
    const saved = await access.db.from("service_sittings").select("id,guest_count,service_time,venue_name,venue_address,venue_lat,venue_lng")
      .eq("order_id", id).eq("company_id", access.companyId);
    const unchanged = !saved.error && saved.data?.length === operations.length && operations.every((row: any) =>
      saved.data.some((existing: any) => existing.id === row.id && existing.guest_count === row.guest_count
        && existing.service_time.slice(0, 5) === row.service_time.slice(0, 5)
        && (row.venue_address === undefined && row.venueAddress === undefined || (existing.venue_address || null) === (row.venue_address ?? row.venueAddress ?? null))
        && (row.venue_name === undefined && row.venueName === undefined || (existing.venue_name || null) === (row.venue_name ?? row.venueName ?? null))
        && (row.venue_lat === undefined && row.venueLat === undefined || (existing.venue_lat ?? null) === (row.venue_lat ?? row.venueLat ?? null))
        && (row.venue_lng === undefined && row.venueLng === undefined || (existing.venue_lng ?? null) === (row.venue_lng ?? row.venueLng ?? null))));
    if (!unchanged) return res.status(503).json({ error: "The new sitting planner is awaiting its database update. Your booking has not changed. Please try again after the update is complete." });
    ({ error } = await access.db.rpc("save_order_sitting_operations", { p_order_id:id,p_company_id:access.companyId,p_operations:operations,p_return_plan:returnPlan }));
    if (!error) {
      await notifyDriversOfScheduleChanges(access.db, id, access.companyId, scheduleBefore);
      return res.status(200).json({ ok:true, notice:"Trip schedule saved. Kitchen batch updates will be available after the database update is complete." });
    }
  }
  if (error?.code === "22023" && String(error.message || "").startsWith("DISPATCH_OVERLAP_CONFIRMATION_REQUIRED:")) {
    return res.status(409).json({
      confirmationRequired: true,
      message: String(error.message).slice("DISPATCH_OVERLAP_CONFIRMATION_REQUIRED:".length).trim(),
    });
  }
  if (error?.code === "22023" && String(error.message || "").startsWith("ACTIVE_ORDER_WORK_CONFIRMATION_REQUIRED:")) {
    return res.status(409).json({
      confirmationRequired: true,
      confirmationType: "activeWork",
      message: String(error.message).slice("ACTIVE_ORDER_WORK_CONFIRMATION_REQUIRED:".length).trim(),
    });
  }
  if (error) return res.status(error.code === "22023" ? 400 : 500).json({ error: error.message || "The sitting schedule could not be saved. Please retry." });
  await notifyDriversOfScheduleChanges(access.db, id, access.companyId, scheduleBefore);
  return res.status(200).json({ ok: true });
}
export default withApiLogging(handler);
