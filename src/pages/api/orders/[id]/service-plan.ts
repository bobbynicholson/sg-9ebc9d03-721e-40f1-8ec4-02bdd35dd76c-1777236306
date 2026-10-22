import type { NextApiRequest, NextApiResponse } from "next";
import { servicePlanAccess } from "@/lib/servicePlanAccess";
import { withApiLogging } from "@/lib/withApiLogging";
import { isUuid } from "@/lib/embedFormApi";
import { normaliseServiceSittings } from "@/lib/serviceSittings";

export const maxDuration = 60;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const access = await servicePlanAccess(req, res);
  if (!access) return;
  if (!access.isAdmin) return res.status(403).json({ error: "Only an administrator can schedule these trips." });
  const id = String(req.query.id || "");
  if (!isUuid(id)) return res.status(400).json({ error: "Invalid booking." });
  const sittings = req.body?.sittings;
  const editsPlan = Array.isArray(sittings) && sittings.some((row: any) => row.guest_count !== undefined || row.service_time !== undefined);
  let tasks: unknown[] = [];
  if (editsPlan) {
    const plan = normaliseServiceSittings(sittings.map((row: any) => ({ guestCount: row.guest_count, serviceTime: String(row.service_time || "").slice(0, 5), kitchenReadyTime: row.kitchenReadyTime, dispatchTime: row.dispatchTime })), sittings.reduce((sum: number, row: any) => sum + Number(row.guest_count || 0), 0));
    if (plan.error || sittings.some((row: any) => !isUuid(row.id))) return res.status(400).json({ error: plan.error || "Reload the sitting plan before saving." });
    try {
      const { kitchenPrepService } = await import("@/services/kitchenPrepService");
      tasks = await kitchenPrepService.planTasksForOrder(access.companyId, id, access.db, plan.value!.map((row, index) => ({ ...row, id: sittings[index].id, kitchenReadyTime: row.kitchenReadyTime || undefined, dispatchTime: row.dispatchTime || undefined })));
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "The kitchen plan could not be prepared. Your changes have not been saved." });
    }
  }
  let { error } = await access.db.rpc(editsPlan ? "save_admin_order_service_plan" : "save_order_sitting_operations", {
    p_order_id: id, p_company_id: access.companyId,
    p_operations: sittings,
    p_return_plan: req.body?.returnPlan,
    ...(editsPlan ? { p_kitchen_tasks: tasks } : {}),
  });
  // During deployment/schema-cache refresh, keep already saved trip plans
  // usable. A new guest/time split must wait for the atomic transaction.
  if (editsPlan && error?.code === "PGRST202") {
    const saved = await access.db.from("service_sittings").select("id,guest_count,service_time")
      .eq("order_id", id).eq("company_id", access.companyId);
    const unchanged = !saved.error && saved.data?.length === sittings.length && sittings.every((row: any) =>
      saved.data.some((existing: any) => existing.id === row.id && existing.guest_count === row.guest_count
        && existing.service_time.slice(0, 5) === row.service_time.slice(0, 5)));
    if (!unchanged) return res.status(503).json({ error: "The new sitting planner is awaiting its database update. Your booking has not changed. Please try again after the update is complete." });
    ({ error } = await access.db.rpc("save_order_sitting_operations", { p_order_id:id,p_company_id:access.companyId,p_operations:sittings,p_return_plan:req.body?.returnPlan }));
    if (!error) return res.status(200).json({ ok:true, notice:"Trip schedule saved. Kitchen batch updates will be available after the database update is complete." });
  }
  if (error) return res.status(error.code === "22023" ? 400 : 500).json({ error: error.message || "The sitting schedule could not be saved. Please retry." });
  return res.status(200).json({ ok: true });
}
export default withApiLogging(handler);
