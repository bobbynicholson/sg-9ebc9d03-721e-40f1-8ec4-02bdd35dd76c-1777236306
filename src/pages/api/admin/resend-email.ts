/**
 * POST /api/admin/resend-email
 *
 * Re-fires a previously logged email. Admin clicks "Resend" on a
 * failed/blocked/quarantined row in /admin/email-automation-dashboard,
 * we look up the log entry, rebuild the payload, and call
 * emailService.sendEmail again.
 *
 * Body: { logId: string }
 *
 * Auth: must be company admin / owner / super-admin in the same
 * company as the original email. Same scoping as /api/send-email.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { emailService } from "@/services/emailService";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { logId } = req.body || {};
    if (!logId || typeof logId !== "string") {
      return res.status(400).json({ error: "logId is required" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
    if (profileErr) {
      console.error("[admin/resend-email] profiles fetch failed:", profileErr);
    }
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ error: "Owner or admin only" });
    }

    const { data: logRow, error: logRowErr } = await ssr
      .from("email_automation_log")
      .select("user_id, template_type, recipient_email, recipient_name, subject, order_id")
      .eq("id", logId)
      .maybeSingle();
    if (logRowErr) {
      console.error("[admin/resend-email] email_automation_log fetch failed:", logRowErr);
    }
    if (!logRow) return res.status(404).json({ error: "Log entry not found" });

    const log = logRow as any;
    // Scope: super_admin can resend across companies, everyone else
    // must be in the same company.
    if (role !== "super_admin" && (profile as any)?.company_id !== log.user_id) {
      return res.status(403).json({ error: "Cannot resend an email for another company" });
    }

    // Wave 24: pass the SSR client so getEmailConfig reads
    // email_provider_settings under the caller's session. Without
    // _client the helper falls back to the imported browser anon
    // supabase, which has no session here, so the SELECT returns
    // nothing and resend silently no-ops.
    const sent = await emailService.sendEmail({
      companyId: log.user_id,
      to: log.recipient_email,
      subject: log.subject,
      template: log.template_type === "custom" ? undefined : log.template_type,
      variables: { clientName: log.recipient_name },
      orderId: log.order_id || undefined,
      _client: ssr,
    } as any);

    return res.status(200).json({ ok: sent, retriggered: true });
  } catch (err: any) {
    console.error("[resend-email] crashed:", err);
    return res.status(500).json({ error: err?.message || "Resend failed" });
  }
}

export default withApiLogging(handler);
