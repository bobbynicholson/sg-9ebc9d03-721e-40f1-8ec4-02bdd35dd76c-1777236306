import type { NextApiRequest, NextApiResponse } from "next";
import { emailService } from "@/services/emailService";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

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

    // Wave 24: pass service-role client through getEmailConfig +
    // sendEmail. Without it the helpers fall back to the imported
    // browser anon supabase, which has no session on the server, so
    // the email_provider_settings SELECT returns nothing and the
    // test silently no-ops.
    const admin = getServiceSupabase();
    // Check email configuration
    const config = await emailService.getEmailConfig(companyId, admin);
    
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

    // TIGHTEN I.38 (2026-06-01): switched from sendEmail (boolean) to
    // sendEmailDetailed so the toast can surface the actual reason
    // instead of a generic "Failed to send test email". The detailed
    // path carries error_code + fix_link + context so the operator can
    // act on the failure (missing RESEND_API_KEY, blocked contact,
    // from-email domain mismatch, etc.) without digging into Vercel
    // logs.
    const result = await emailService.sendEmailDetailed({
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
      _client: admin,
    } as any);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: "Test email sent successfully! Check your inbox.",
        config: {
          provider: config.provider,
          from: `${config.from_name} <${config.from_email}>`,
          enabled: config.enabled,
        },
      });
    }

    // Propagate the structured failure so the client toast can show
    // the operator something they can act on.
    return res.status(500).json({
      success: false,
      error: result.error || "Failed to send test email",
      error_code: result.error_code || null,
      fix_link: result.fix_link || null,
      context: result.context || null,
      config: {
        provider: config.provider,
        from: `${config.from_name} <${config.from_email}>`,
        enabled: config.enabled,
      },
    });
  } catch (error) {
    console.error("Test email error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
