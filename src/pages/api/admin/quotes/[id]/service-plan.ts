import type { NextApiRequest, NextApiResponse } from "next";
import { servicePlanAccess } from "@/lib/servicePlanAccess";
import { withApiLogging } from "@/lib/withApiLogging";
import { isUuid } from "@/lib/embedFormApi";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const access = await servicePlanAccess(req, res);
  if (!access) return;
  if (!access.isAdmin) return res.status(403).json({ error: "Only an administrator can review serving times." });
  const id = String(req.query.id || "");
  if (!isUuid(id)) return res.status(400).json({ error: "Invalid quote." });
  const { error } = await access.db.rpc("save_admin_quote_service_plan", {
    p_quote_id: id, p_company_id: access.companyId,
    p_plan: req.body?.plan, p_patch: req.body?.patch || {},
    p_request_id: req.body?.requestId || null,
  });
  if (error) return res.status(error.code === "22023" ? 400 : 500).json({ error: error.message || "Serving times could not be saved. Please retry." });
  return res.status(200).json({ ok: true });
}
export default withApiLogging(handler);
