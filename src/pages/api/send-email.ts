import type { NextApiRequest, NextApiResponse } from "next";
import { emailService } from "@/services/emailService";

/**
 * API Route for sending emails
 * This endpoint handles email sending server-side to protect API keys
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { companyId, to, subject, template, body, variables, orderId, quoteId } = req.body;

    if (!companyId || !to || !subject) {
      return res.status(400).json({
        error: "Missing required fields: companyId, to, and subject are required",
      });
    }

    const result = await emailService.sendEmail({
      companyId,
      to,
      subject,
      template,
      body,
      variables,
      orderId,
      quoteId,
    });

    if (result) {
      return res.status(200).json({
        success: true,
        message: "Email sent successfully",
      });
    } else {
      return res.status(500).json({
        success: false,
        error: "Failed to send email",
      });
    }
  } catch (error) {
    console.error("Email API error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
