import type { NextApiRequest, NextApiResponse } from "next";
import { withApiLogging } from "@/lib/withApiLogging";

/** Legacy proofless EFT endpoint. EFT claims must include a payment proof file. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return res.status(400).json({ error: "Upload payment proof to submit an EFT claim" });
}

export default withApiLogging(handler);
