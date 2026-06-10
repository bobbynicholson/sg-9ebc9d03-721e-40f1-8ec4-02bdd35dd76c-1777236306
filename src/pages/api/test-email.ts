import type { NextApiRequest, NextApiResponse } from "next";
import { emailService } from "@/services/emailService";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";


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
async function handler(
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
    // TIGHTEN I.48 (2026-06-01): clean, mobile-first test email body.
    // Single column, plain-text-leaning, no fixed widths. Renders well
    // in Gmail's preview pane, Apple Mail (light + dark), Outlook,
    // and on small phones. Keeps the friendly tone but reads more
    // like a real CateringMS quote / confirmation, not a 2008 marketing
    // template.
    const fromLine = `${config.from_name || "Your team"} <${config.from_email || "your address"}>`;
    const testEmailBody = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CateringMS test email</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;line-height:1.55;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0;font-size:13px;color:#64748b;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">CateringMS test email</p>
                <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">Your email setup is working.</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 28px 4px 28px;">
                <p style="margin:0;font-size:15px;color:#334155;">
                  If you can read this, CateringMS can send quotes, invoices and confirmations to your clients from this address.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 4px 28px;">
                <p style="margin:0;font-size:12px;color:#64748b;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">From</p>
                <p style="margin:4px 0 0 0;font-size:14px;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all;">${fromLine}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 28px 4px 28px;">
                <p style="margin:0;font-size:12px;color:#64748b;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">Sent via</p>
                <p style="margin:4px 0 0 0;font-size:14px;color:#0f172a;">${config.provider === "resend" ? "CateringMS (Resend)" : (config.provider || "Default")}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 28px 28px;">
                <p style="margin:0;font-size:13px;color:#64748b;">
                  This is a one-off test from the Email settings page. Real client emails carry the booking link, quote PDF, or invoice.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:11px;color:#94a3b8;text-align:center;">
            Sent from CateringMS &middot; <a href="https://cateringms.com" style="color:#94a3b8;text-decoration:underline;">cateringms.com</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const result = await emailService.sendEmailDetailed({
      companyId,
      to,
      subject: "CateringMS test email - your setup is working",
      body: testEmailBody,
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

    // TIGHTEN I.39 (2026-06-01): diagnostic block. We confirmed Bobby's
    // Vercel dashboard has RESEND_API_KEY set, scoped to Production +
    // Preview, but the test keeps reporting resend_auth. Either the
    // value is empty/whitespace, the runtime isn't picking it up, or
    // it's set on a different project. Reports presence + length +
    // prefix only - never the bytes - so we can settle which.
    const rk = process.env.RESEND_API_KEY;
    const debug = result.error_code === "resend_auth" ? {
      resend_key_present: !!rk,
      resend_key_length: rk ? rk.length : 0,
      resend_key_prefix: rk ? rk.slice(0, 3) : null,
      resend_key_starts_with_re_: rk ? rk.startsWith("re_") : false,
      resend_key_has_whitespace_edges: rk ? (rk.trim() !== rk) : false,
      node_env: process.env.NODE_ENV || null,
      vercel_env: process.env.VERCEL_ENV || null,
    } : undefined;

    // Propagate the structured failure so the client toast can show
    // the operator something they can act on.
    return res.status(500).json({
      success: false,
      error: result.error || "Failed to send test email",
      error_code: result.error_code || null,
      fix_link: result.fix_link || null,
      context: result.context || null,
      debug,
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

export default withApiLogging(handler);
