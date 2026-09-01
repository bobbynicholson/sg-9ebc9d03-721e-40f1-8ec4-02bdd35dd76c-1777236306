/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { sendStaffAccessChangeEmails } from "@/lib/staffAccessChangeEmail";
import { UserRole } from "@/types/app";

const ADMIN_ROLES = new Set([
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.COMPANY_ADMIN,
  UserRole.ADMIN,
]);

// All roles shown in Admin -> Users. Super-admin and client accounts are
// intentionally excluded from tenant staff assignment.
const ASSIGNABLE_ROLES = new Set([
  UserRole.OWNER,
  UserRole.COMPANY_ADMIN,
  UserRole.REGION_ADMIN,
  UserRole.SALES_ADMIN,
  UserRole.ADMIN,
  UserRole.KITCHEN_MANAGER,
  UserRole.KITCHEN_STAFF,
  UserRole.SHOPPING_STAFF,
  UserRole.CLEANING_MANAGER,
  UserRole.CLEANING_STAFF,
  UserRole.DRIVER,
  UserRole.WAITER,
]);

function getId(req: NextApiRequest): string {
  const raw = req.query.id;
  return String(Array.isArray(raw) ? raw[0] : raw || "").trim();
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user: callerAuth } } = await ssr.auth.getUser();
    if (!callerAuth) return res.status(401).json({ error: "Not signed in" });

    const { data: callerProfile, error: callerError } = await ssr
      .from("profiles")
      .select("id, email, full_name, role, active_role, company_id")
      .eq("id", callerAuth.id)
      .maybeSingle();
    if (callerError || !callerProfile) return res.status(403).json({ error: "Caller profile not found" });

    const callerRole = String(callerProfile.active_role || callerProfile.role || "") as UserRole;
    if (!ADMIN_ROLES.has(callerRole)) return res.status(403).json({ error: "Admin access required" });

    const targetId = getId(req);
    const { departments, primaryRole } = req.body || {};
    const requestedRoles = Array.from(new Set(
      (Array.isArray(departments) ? departments : []).map((role: unknown) => String(role).trim()),
    ));
    const primary = String(primaryRole || "").trim();
    if (!targetId || requestedRoles.length === 0 || !primary || !requestedRoles.includes(primary)) {
      return res.status(400).json({ error: "Select at least one role and choose a primary role" });
    }
    if (requestedRoles.some((role) => !ASSIGNABLE_ROLES.has(role as UserRole))) {
      return res.status(400).json({ error: "One or more selected roles are not assignable" });
    }

    const admin = getServiceSupabase();
    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, email, full_name, role, company_id, deleted_at")
      .eq("id", targetId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.deleted_at) return res.status(404).json({ error: "Staff user not found" });
    if (String(target.role || "") === UserRole.CLIENT) return res.status(400).json({ error: "Client accounts cannot receive staff roles" });
    if (callerRole !== UserRole.SUPER_ADMIN && target.company_id !== callerProfile.company_id) {
      return res.status(403).json({ error: "Cannot change access outside your company" });
    }

    const companyId = String(target.company_id || callerProfile.company_id || "");
    if (!companyId) return res.status(400).json({ error: "User is not linked to a company" });

    const { error: profileUpdateError } = await admin
      .from("profiles")
      .update({ active_role: primary, is_active: true })
      .eq("id", targetId)
      .eq("company_id", companyId);
    if (profileUpdateError) throw profileUpdateError;

    const { error: deleteRolesError } = await admin
      .from("user_departments")
      .delete()
      .eq("user_id", targetId)
      .eq("company_id", companyId);
    if (deleteRolesError) throw deleteRolesError;

    const { error: insertRolesError } = await admin
      .from("user_departments")
      .insert(requestedRoles.map((department) => ({
        user_id: targetId,
        company_id: companyId,
        department,
        is_primary: department === primary,
        assigned_by: callerAuth.id,
      })));
    if (insertRolesError) throw insertRolesError;

    try {
      await admin.from("user_access_audit").insert({
        company_id: companyId,
        target_user_id: targetId,
        actor_user_id: callerAuth.id,
        action: "roles_changed",
        details: { roles: requestedRoles, primary_role: primary, account_activated: true },
      });
    } catch (auditError: any) {
      console.warn("[admin/users/access] audit insert failed:", auditError?.message);
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || req.headers.origin || `https://${req.headers.host || "cateringms.com"}`;
    const emailResult = await sendStaffAccessChangeEmails({
      admin,
      companyId,
      baseUrl: String(origin).replace(/\/$/, ""),
      target: { email: target.email || null, fullName: target.full_name || null },
      actor: { email: callerProfile.email || null, fullName: callerProfile.full_name || null },
      roles: requestedRoles,
      primaryRole: primary,
    });

    return res.status(200).json({
      ok: true,
      user_id: targetId,
      roles: requestedRoles,
      primary_role: primary,
      account_activated: true,
      email: emailResult,
    });
  } catch (error: any) {
    console.error("[admin/users/access] failed:", error);
    return res.status(500).json({ error: dbErrorMessage(error) || "Could not update staff access" });
  }
}

export default withApiLogging(handler);
