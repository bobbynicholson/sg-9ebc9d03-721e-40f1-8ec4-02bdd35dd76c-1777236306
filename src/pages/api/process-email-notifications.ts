import type { NextApiRequest, NextApiResponse } from "next";
import { emailNotificationService } from "@/services/emailNotificationService";

/**
 * API endpoint to process pending email notifications
 * This should be called via cron job (e.g., Vercel Cron or external scheduler)
 * 
 * Example cron setup in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/process-email-notifications",
 *     "schedule": "* * * * *"  // Every minute
 *   }]
 * }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // TIGHTEN I.83 (2026-06-02): CRON_SECRET is no longer optional. The
  // previous "if env-var set, then check" let anonymous callers POST
  // any companyId and trigger that tenant's email queue in environments
  // where CRON_SECRET hadn't been provisioned. Now: missing secret in
  // env = 500 (config error), wrong / missing header = 401.
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[process-email-notifications] CRON_SECRET env var not set");
    return res.status(500).json({ error: "Server config error" });
  }
  if (req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get company ID from request (or process all companies)
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    // Process pending emails
    const sentCount = await emailNotificationService.processPendingEmails(companyId);

    return res.status(200).json({
      success: true,
      sentCount,
      message: `Processed ${sentCount} email notifications`,
    });
  } catch (error) {
    console.error("Error processing email notifications:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to process email notifications",
    });
  }
}