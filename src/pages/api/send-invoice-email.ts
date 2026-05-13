import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Sends invoice email. Caller posts JSON:
 *   { to, subject, html, invoiceNumber }
 *
 * NOTE: Currently logs only -- wire up Resend / SMTP here when an
 * email provider is connected. Do not switch to multipart parsing
 * because the only caller (invoiceGenerationService.sendInvoiceEmail)
 * sends Content-Type: application/json.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { to, subject, html, invoiceNumber } = body as {
      to?: string;
      subject?: string;
      html?: string;
      invoiceNumber?: string;
    };

    if (!to || !subject || !html) {
      return res
        .status(400)
        .json({ error: "Missing required fields: to, subject, html" });
    }

    // Audit (May 2026): this endpoint was returning success: true after
    // a console.log without sending. The modern path goes through
    // /api/send-email (which uses emailService + per-tenant SMTP /
    // Resend creds). Until callers are migrated, refuse to lie about
    // sending and tell the caller where the real path lives.
    return res.status(501).json({
      success: false,
      error: "send-invoice-email is deprecated. Use /api/send-email with attachInvoicePdf=true + invoiceId.",
      error_code: "endpoint_deprecated",
      received: { to, subject, invoiceNumber },
    });
  } catch (error: any) {
    console.error("Error sending invoice email:", error);
    return res
      .status(500)
      .json({ error: error?.message || "Failed to send email" });
  }
}
