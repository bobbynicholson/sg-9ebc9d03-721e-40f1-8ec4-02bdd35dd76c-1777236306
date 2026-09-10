/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/admin/resend-invite  { userId }
 *
 * Re-sends the "you've been invited / set your password" email for a
 * staff member who hasn't activated yet. Mints a fresh Supabase
 * set-password link each time (the previous one may have expired), so a
 * pending user can always be nudged again without the admin handling
 * any password by hand.
 *
 * Auth: same rule as create-user - caller must be an admin-tier role,
 * and a non-super_admin can only resend for users in their OWN company.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { sendStaffInviteEmail } from "@/lib/staffInviteEmail";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

const CALLER_ROLES_ALLOWED = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user: caller } } = await ssr.auth.getUser();
    if (!caller) return res.status(401).json({ error: "No active session. Sign in and retry." });

    const { data: callerProfile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", caller.id)
      .single();
    if (!callerProfile) return res.status(403).json({ error: "Caller profile not found." });

    const callerRole = (callerProfile as any).active_role || (callerProfile as any).role;
    if (!CALLER_ROLES_ALLOWED.has(callerRole)) {
      return res.status(403).json({ error: `Forbidden: '${callerRole}' cannot resend invites.` });
    }

    const userId = (req.body || {}).userId;
    if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return res.status(400).json({ error: "Invalid user" });
    }

    let admin: ReturnType<typeof getServiceSupabase>;
    try {
      admin = getServiceSupabase();
    } catch (e) {
      console.error("[resend-invite] service role unavailable:", e);
      return res.status(500).json({ error: "Server not configured" });
    }

    // Resolve the target user.
    const { data: target } = await admin
      .from("profiles")
      .select("id, email, full_name, role, company_id")
      .eq("id", userId)
      .maybeSingle();
    if (!target || !(target as any).email) {
      return res.status(404).json({ error: "User not found" });
    }
    const t = target as any;

    // Company scoping for non-super_admins.
    if (callerRole !== "super_admin" && (callerProfile as any).company_id !== t.company_id) {
      return res.status(403).json({ error: "Cannot resend invites for another company" });
    }
    if (!t.company_id) {
      return res.status(400).json({ error: "User isn't linked to a company yet." });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (req.headers.origin as string) ||
      `https://${req.headers.host || "cateringms.com"}`;

    // No tempPassword passed: the helper mints a fresh set-password link.
    const result = await sendStaffInviteEmail(admin, {
      email: t.email,
      fullName: t.full_name || "",
      role: t.role || "team member",
      companyId: t.company_id,
      baseUrl,
    });

    if (!result.emailed) {
      return res.status(502).json({
        error:
          result.errorCode === "no_provider"
            ? "This company hasn't set up an email sender yet, so the invite can't be emailed. Set one up under Email settings, then resend."
            : "Couldn't send the invite email. Please try again.",
        errorCode: result.errorCode,
      });
    }

    return res.status(200).json({ ok: true, message: `Invite re-sent to ${t.email}` });
  } catch (e: any) {
    console.error("resend-invite crashed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "Unexpected server error" });
  }
}

export default withApiLogging(handler);
