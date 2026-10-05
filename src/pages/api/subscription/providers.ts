/**
 * GET /api/subscription/providers
 *
 * Which platform payment providers can take a plan payment right now.
 * Booleans only - never exposes keys. Drives the provider picker on
 * /subscription/checkout.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { platformBillingProviders } from "@/services/platformPlanBilling";
import { withApiLogging } from "@/lib/withApiLogging";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ providers: platformBillingProviders() });
}

export default withApiLogging(handler);
