/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { NextApiRequest, NextApiResponse } from "next";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


const CALLER_ROLES_ALLOWED = new Set(["super_admin", "company_admin", "admin", "owner"]);

/**
 * Soft-delete a user (driver / kitchen / cleaning / shopping).
 *
 * Why soft, not hard:
 *   - Hard delete via auth.admin.deleteUser cascades to anything that
 *     references the user via FK with ON DELETE CASCADE - which in this
 *     codebase includes orders, shifts, assignments, etc. Losing that
 *     history breaks reports.
 *   - The soft path stamps profiles.deleted_at and flips is_active to
 *     false, then disables the auth user via admin.updateUserById with
 *     a banned_until far in the future. The user disappears from list
 *     queries (which filter by is_active and deleted_at) and can't log
 *     in.
 *   - Restore is one click on the same admin page (clear deleted_at,
 *     re-enable the auth user).
 *
 * Caller must be admin / owner / super_admin and the target user must
 * be in the same company (super_admin can delete cross-company).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST" && req.method !== "DELETE") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssrClient = createPagesServerClient({ req, res });
    const { data: { user: callerAuth } } = await ssrClient.auth.getUser();
    if (!callerAuth) {
      return res.status(401).json({ error: "No active session found. Sign in again and retry." });
    }

    const { data: callerProfile, error: callerProfileErr } = await ssrClient
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", callerAuth.id)
      .single();
    if (callerProfileErr || !callerProfile) {
      return res.status(403).json({ error: "Caller profile not found." });
    }

    const callerRole = (callerProfile as any).active_role || (callerProfile as any).role;
    if (!CALLER_ROLES_ALLOWED.has(callerRole)) {
      return res.status(403).json({ error: `Forbidden: your role '${callerRole}' is not allowed to remove users.` });
    }

    const userId: string | undefined = req.body?.userId || (req.query?.userId as string | undefined);
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
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

    // Look up target profile to confirm same-company before mutating
    const { data: target, error: tErr } = await admin
      .from("profiles")
      .select("id, company_id, full_name, email, role, deleted_at")
      .eq("id", userId)
      .single();
    if (tErr || !target) {
      return res.status(404).json({ error: "User not found." });
    }

    if (callerRole !== "super_admin" && target.company_id !== (callerProfile as any).company_id) {
      return res.status(403).json({ error: "Cannot remove users from another company." });
    }

    if (callerAuth.id === target.id) {
      return res.status(400).json({ error: "You can't remove your own account from this screen." });
    }

    // 1. Soft-delete the profile - the list views all filter by deleted_at
    //    IS NULL and is_active = true, so this is enough to hide the driver
    //    from every operator surface.
    const { error: delErr } = await admin
      .from("profiles")
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false,
      })
      .eq("id", userId);
    if (delErr) {
      console.error("Profile soft-delete failed:", delErr);
      return res.status(500).json({ error: `Could not remove user: ${dbErrorMessage(delErr)}` });
    }

    // 2. Disable the auth user so they cannot log in. ban_duration of
    //    876000h is ~100 years - effectively permanent unless an
    //    admin clears it later. We do this AFTER the profile update so
    //    if the auth call fails we already have the profile hidden.
    try {
      await admin.auth.admin.updateUserById(userId, {
        ban_duration: "876000h",
      });
    } catch (banErr: any) {
      // Non-fatal - the profile is already hidden. Log so we can
      // chase the auth user if needed.
      console.warn("Auth user ban failed (profile already soft-deleted):", banErr?.message);
    }

    // Wave 24: cross-cutting audit_logs entry. User soft-delete is a
    // compliance-class event - "who removed Jane on the 12th of May"
    // needs to be answerable for HR + dispute resolution + GDPR
    // accountability. The platform-wide audit feed had no record
    // before; restore is one click but proving the original delete
    // was authorised needs the trail. Best-effort - a failed log
    // doesn't roll back the soft-delete.
    try {
      await (admin as any).from("audit_logs").insert({
        company_id: (target as any).company_id,
        user_id: callerAuth.id,
        action: "user_soft_deleted",
        entity_type: "user",
        entity_id: target.id,
        details: {
          target_email: target.email,
          target_full_name: target.full_name,
          target_role: target.role,
          caller_role: callerRole,
        },
      });
    } catch (auditErr) {
      console.warn("[delete-user] audit_logs insert failed:", auditErr);
    }

    return res.status(200).json({
      message: "User removed",
      user: { id: target.id, email: target.email, full_name: target.full_name },
    });
  } catch (outer: any) {
    console.error("delete-user handler crashed:", outer);
    return res.status(500).json({ error: dbErrorMessage(outer) || "Unexpected server error" });
  }
}

export default withApiLogging(handler);
