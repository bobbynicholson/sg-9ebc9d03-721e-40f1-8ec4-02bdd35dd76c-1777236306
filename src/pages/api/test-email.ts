import type { NextApiRequest, NextApiResponse } from "next";
import { emailService } from "@/services/emailService";
import { createPagesServerClient } from "@/lib/supabase/server";

/**
 * Test Email API Endpoint
 * Use this to verify email configuration is working
 *
 * Usage: POST /api/test-email
 * Body: { companyId: "uuid", to: "test@example.com" }
 *
 * Auth: caller must be authenticated and belong to the company they're
 * testing email for, OR super_admin. Without this gate the endpoint was an
 * open SMTP relay through any tenant's stored credentials [P0-05].
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { companyId, to } = req.body;

    if (!companyId || !to) {
      return res.status(400).json({
        error: "Missing required fields: companyId and to are required",
      });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const { data: profile } = await ssr
      .from("profiles")
      .select("company_id, role, active_role")
      .eq("id", user.id)
      .maybeSingle();
    const callerRole = (profile as any)?.active_role || (profile as any)?.role;
    if (callerRole !== "super_admin" && (profile as any)?.company_id !== companyId) {
      return res.status(403).json({ error: "Cannot test email for another company" });
    }

    // Check email configuration
    const config = await emailService.getEmailConfig(companyId);
    
    if (!config) {
      return res.status(400).json({
        error: "Email configuration not found for this company",
        hint: "Set up email settings in the admin portal first",
      });
    }

    if (!config.enabled) {
      return res.status(400).json({
        error: "Email automation is disabled for this company",
        hint: "Enable email automation in the admin portal",
      });
    }

    // Send test email
    const result = await emailService.sendEmail({
      companyId,
      to,
      subject: "CateringMS - Test Email",
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #8B5CF6;">✅ Email Configuration Test</h2>
          <p>If you're reading this, your email configuration is working correctly!</p>
          <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Provider:</strong> ${config.provider || 'Development Mode'}</p>
            <p style="margin: 5px 0 0 0;"><strong>From:</strong> ${config.from_name} &lt;${config.from_email}&gt;</p>
          </div>
          <p style="color: #6B7280; font-size: 14px;">This is a test email sent from CateringMS.</p>
        </div>
      `,
    });

    if (result) {
      return res.status(200).json({
        success: true,
        message: "Test email sent successfully! Check your inbox.",
        config: {
          provider: config.provider,
          from: `${config.from_name} <${config.from_email}>`,
          enabled: config.enabled,
        },
      });
    } else {
      return res.status(500).json({
        success: false,
        error: "Failed to send test email",
        config: {
          provider: config.provider,
          from: `${config.from_name} <${config.from_email}>`,
          enabled: config.enabled,
        },
      });
    }
  } catch (error) {
    console.error("Test email error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
