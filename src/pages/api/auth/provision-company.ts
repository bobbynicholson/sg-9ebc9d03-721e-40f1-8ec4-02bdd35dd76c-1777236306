import type { NextApiRequest, NextApiResponse } from "next";
import { withApiLogging } from "@/lib/withApiLogging";

/**
 * Retired self-service company provisioning endpoint.
 * Workspaces are created from the authenticated platform administration
 * flow, which also provisions the initial company accounts. Keeping this
 * route as a clear 410 prevents stale clients from creating tenants.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(410).json({
    error: "Self-service company setup is no longer available. Contact the CateringMS platform team to create a workspace.",
    contactUrl: "/contact",
  });
}

export default withApiLogging(handler);
