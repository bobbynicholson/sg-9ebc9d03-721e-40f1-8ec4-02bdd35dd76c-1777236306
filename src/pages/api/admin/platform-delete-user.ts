/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { NextApiRequest, NextApiResponse } from "next";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

/**
 * HARD-delete a user account. Platform (super_admin) only.
 *
 * Distinct from /api/admin/delete-user, which is the tenant-facing
 * SOFT delete (stamps profiles.deleted_at + bans the auth user) used by
 * driver-management and friends. This endpoint backs the platform
 * user-management page, whose confirm dialog promises "permanently
 * removed" - so it actually removes both the auth.users row and the
 * profiles row.
 *
 * Why an API route at all: the page used to run a client-side
 * `supabase.from("profiles").delete()` and relied on RLS plus a trigger
 * to cascade into auth.users. When the trigger was missing or failed,
 * the auth row survived as an orphan (which create-user's pre-check
 * then had to "heal"), and the whole operation depended on RLS being
 * exactly right. Deleting through the service-role client removes both
 * rows in one authoritative, role-checked place.
 *
 * Hardening (mirrors create-user.ts):
 *   - Whole handler wrapped in try/catch so an unexpected throw still
 *     returns JSON, not an HTML 500 page the browser can't parse.
 *   - Caller must have an active session AND super_admin role.
 *   - A super admin cannot delete their own account (400): it would
 *     kill the session servicing this request and can strip the
 *     platform of its last administrator.
 *   - auth.admin.deleteUser "user not found" (404) is tolerated so
 *     orphaned profiles (auth row already gone) can still be cleaned up.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssrClient = createPagesServerClient({ req, res });
    const {
      data: { user: callerAuth },
    } = await ssrClient.auth.getUser();
    if (!callerAuth) {
      return res.status(401).json({
        error: "No active session found. Sign in again and retry.",
      });
    }

    const { data: callerProfile, error: callerProfileErr } = await ssrClient
      .from("profiles")
      .select("role, active_role")
      .eq("id", callerAuth.id)
      .single();
    if (callerProfileErr || !callerProfile) {
      return res.status(403).json({
        error: "Caller profile not found, contact support if this persists.",
      });
    }

    const callerRole = (callerProfile as any).active_role || (callerProfile as any).role;
    if (callerRole !== "super_admin") {
      return res.status(403).json({
        error: `Forbidden: your role '${callerRole}' is not allowed to permanently delete users.`,
      });
    }

    const userId: string | undefined = req.body?.userId;
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "Please provide the userId of the account to delete." });
    }

    // Guard: a super admin must not delete their own account.
    if (userId === callerAuth.id) {
      return res.status(400).json({
        error: "You cannot delete your own account. Ask another platform admin to remove it.",
      });
    }

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch (e: any) {
      console.error("Service role client unavailable:", e);
      return res.status(500).json({
        error: "Server is missing service-role credentials, check SUPABASE_SERVICE_ROLE_KEY in env.",
      });
    }

    // Snapshot the target for the audit trail before anything is removed.
    // Missing profile is fine - the auth row may still exist and should
    // still be deletable.
    const { data: target } = await admin
      .from("profiles")
      .select("id, company_id, full_name, email, role")
      .eq("id", userId)
      .maybeSingle();

    // Delete the auth user first with the service role. Tolerate "user
    // not found" (status 404) so profiles orphaned by an earlier partial
    // delete can still be removed below.
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr && (authErr as any).status !== 404) {
      console.error("admin.deleteUser failed:", authErr);
      return res.status(500).json({
        error: dbErrorMessage(authErr) || "Could not delete the user's sign-in account.",
      });
    }

    // Remove the profiles row. On schemas with the auth.users -> profiles
    // cascade this is a no-op (0 rows), but it also covers environments
    // without the cascade plus orphaned profile rows.
    const { error: profileErr } = await admin
      .from("profiles")
      .delete()
      .eq("id", userId);
    if (profileErr) {
      console.error("Profile delete failed after auth delete:", profileErr);
      return res.status(500).json({
        error: `The sign-in account was removed but the profile could not be deleted: ${dbErrorMessage(profileErr)}`,
      });
    }

    // Compliance trail: permanent deletion is exactly the kind of event
    // "who removed this account and when" questions get asked about.
    // Best-effort - a failed log never rolls back the delete.
    try {
      await admin.from("audit_logs").insert({
        company_id: target?.company_id ?? null,
        user_id: callerAuth.id,
        action: "user_hard_deleted",
        entity_type: "user",
        entity_id: userId,
        details: {
          target_email: target?.email ?? null,
          target_full_name: target?.full_name ?? null,
          target_role: target?.role ?? null,
          caller_role: callerRole,
        },
      });
    } catch (auditErr) {
      console.warn("[platform-delete-user] audit_logs insert failed:", auditErr);
    }

    return res.status(200).json({ ok: true, message: "User deleted" });
  } catch (outer: any) {
    // Unhandled error - without this catch, Next.js returns an HTML 500
    // page and the client can't parse a JSON error.
    console.error("platform-delete-user handler crashed:", outer);
    return res.status(500).json({
      error: dbErrorMessage(outer) || "Unexpected server error",
    });
  }
}

export default withApiLogging(handler);
