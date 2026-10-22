import type { NextApiRequest, NextApiResponse } from "next";
import { servicePlanAccess } from "@/lib/servicePlanAccess";
import { withApiLogging } from "@/lib/withApiLogging";
import { isUuid } from "@/lib/embedFormApi";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const access = await servicePlanAccess(req, res);
  if (!access) return;
  if (!isUuid(req.body?.assignmentId)) return res.status(400).json({ error: "Invalid trip." });
  const { error } = await access.db.rpc("advance_sitting_driver_trip", {
    p_assignment_id: req.body.assignmentId, p_driver_id: access.userId,
    p_company_id: access.companyId, p_status: req.body?.status,
  });
  if (error) return res.status(error.code === "22023" ? 400 : 500).json({ error: error.message || "Trip progress could not be saved. Please retry." });
  // Equipment remains booked out while any sitting or return trip is open.
  // Only the final completed collection runs the existing return/cleaning flow.
  if (req.body?.status === "completed") {
    const { data: trip } = await access.db.from("driver_assignments").select("order_id,assignment_type").eq("id", req.body.assignmentId).eq("driver_id", access.userId).single();
    if (trip?.assignment_type === "collection") {
      const [sittings, collections] = await Promise.all([
        access.db.from("service_sittings").select("id,status,return_required").eq("order_id", trip.order_id).eq("company_id", access.companyId),
        access.db.from("driver_assignments").select("service_sitting_id,status").eq("order_id", trip.order_id).eq("assignment_type", "collection").not("service_sitting_id", "is", null).not("status", "in", "(cancelled,rejected)"),
      ]);
      if (!sittings.error && !collections.error && sittings.data?.length && sittings.data.every((s: any) => s.status === "served" || s.status === "cancelled")
        && sittings.data.filter((s: any) => s.return_required && s.status !== "cancelled").every((s: any) => {
          const trips = (collections.data || []).filter((a: any) => a.service_sitting_id === s.id);
          return trips.length > 0 && trips.every((a: any) => a.status === "completed");
        })) {
        const { equipmentReturnService } = await import("@/services/equipmentReturnService");
        await equipmentReturnService.returnOrderEquipment({ orderId: trip.order_id, responsibleUserId: access.userId, client: access.db });
      }
    }
  }
  return res.status(200).json({ ok: true });
}
export default withApiLogging(handler);
