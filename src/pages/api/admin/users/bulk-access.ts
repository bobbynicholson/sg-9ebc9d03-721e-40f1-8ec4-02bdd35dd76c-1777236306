/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { UserRole } from "@/types/app";

const ADMIN_ROLES = new Set([
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.COMPANY_ADMIN,
  UserRole.ADMIN,
]);

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

function uniqueStrings(value: unknown): string[] {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ssr = createPagesServerClient({ req, res });
    let { data: { user: callerAuth } } = await ssr.auth.getUser();
    if (!callerAuth) {
      const authorization = String(req.headers.authorization || "");
      const accessToken = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : "";
      if (accessToken) {
        callerAuth = (await getServiceSupabase().auth.getUser(accessToken)).data.user;
      }
    }
    if (!callerAuth) return res.status(401).json({ error: "Not signed in" });

    const admin = getServiceSupabase();
    const { data: callerProfile, error: callerError } = await admin
      .from("profiles")
      .select("id, email, full_name, role, active_role, company_id")
      .eq("id", callerAuth.id)
      .maybeSingle();
    if (callerError || !callerProfile) return res.status(403).json({ error: "Caller profile not found" });

    const callerRole = String(callerProfile.active_role || callerProfile.role || "") as UserRole;
    if (!ADMIN_ROLES.has(callerRole)) return res.status(403).json({ error: "Admin access required" });

    const userIds = uniqueStrings(req.body?.user_ids);
    const role = String(req.body?.role || "").trim() as UserRole;
    if (userIds.length === 0 || userIds.length > 100) {
      return res.status(400).json({ error: "Select between 1 and 100 staff users" });
    }
    if (!ASSIGNABLE_ROLES.has(role)) {
      return res.status(400).json({ error: "That role cannot be assigned from this page" });
    }

    const { data: targets, error: targetError } = await admin
      .from("profiles")
      .select("id, email, full_name, role, active_role, company_id, deleted_at")
      .in("id", userIds);
    if (targetError) throw targetError;

    const targetRows = targets || [];
    if (targetRows.length !== userIds.length) {
      return res.status(404).json({ error: "One or more selected staff users could not be found" });
    }
    if (targetRows.some((target) => target.deleted_at || String(target.role || "") === UserRole.CLIENT)) {
      return res.status(400).json({ error: "Client or deleted accounts cannot receive staff roles" });
    }

    // This page is tenant-scoped. Even a super-admin must select users from
    // one company per bulk operation so roles cannot accidentally cross tenants.
    const companyIds = Array.from(new Set(targetRows.map((target) => target.company_id).filter(Boolean)));
    if (companyIds.length !== 1) {
      return res.status(400).json({ error: "Select users from the same company" });
    }
    const companyId = String(companyIds[0]);
    if (callerRole !== UserRole.SUPER_ADMIN && companyId !== callerProfile.company_id) {
      return res.status(403).json({ error: "Cannot change access outside your company" });
    }

    const { data: existingDepartments, error: departmentsError } = await admin
      .from("user_departments")
      .select("user_id, department, is_primary")
      .in("user_id", userIds);
    if (departmentsError) throw departmentsError;

    const departmentsByUser = new Map<string, Array<{ department: string; is_primary: boolean | null }>>();
    for (const row of existingDepartments || []) {
      const list = departmentsByUser.get(row.user_id) || [];
      list.push({ department: String(row.department || ""), is_primary: row.is_primary });
      departmentsByUser.set(row.user_id, list);
    }

    const inserts: Array<Record<string, unknown>> = [];
    const changedUsers: Array<{ id: string; primaryRole: string }> = [];
    let alreadyAssignedCount = 0;

    for (const target of targetRows) {
      const current = departmentsByUser.get(target.id) || [];
      const alreadyHasRole = current.some((assignment) => assignment.department === role);
      if (alreadyHasRole) alreadyAssignedCount += 1;

      const hasPrimaryDepartment = current.some((assignment) => assignment.is_primary === true);
      const currentProfileRole = String(target.active_role || target.role || "").trim();
      const shouldBecomePrimary = !hasPrimaryDepartment && !currentProfileRole;
      if (!alreadyHasRole) {
        inserts.push({
          user_id: target.id,
          department: role,
          is_primary: shouldBecomePrimary,
          assigned_by: callerAuth.id,
        });
      }

      const primaryRole = shouldBecomePrimary ? role : (current.find((assignment) => assignment.is_primary)?.department || currentProfileRole || role);
      changedUsers.push({ id: target.id, primaryRole });
    }

    if (inserts.length > 0) {
      const { error: insertError } = await admin
        .from("user_departments")
        .insert(inserts as any);
      if (insertError) throw insertError;
    }

    for (const target of targetRows) {
      const changed = changedUsers.find((entry) => entry.id === target.id);
      const update: Record<string, unknown> = { is_active: true };
      if (changed?.primaryRole === role && !String(target.active_role || target.role || "").trim()) {
        update.active_role = role;
      }
      const { error: profileUpdateError } = await admin
        .from("profiles")
        .update(update)
        .eq("id", target.id)
        .eq("company_id", companyId);
      if (profileUpdateError) throw profileUpdateError;
    }

    try {
      await admin.from("user_access_audit").insert(
        changedUsers.map((changed) => ({
          company_id: companyId,
          target_user_id: changed.id,
          actor_user_id: callerAuth.id,
          action: "roles_changed",
          details: {
            role_added: role,
            primary_role: changed.primaryRole,
            account_activated: true,
            bulk_assignment: true,
          },
        })),
      );
    } catch (auditError: any) {
      console.warn("[admin/users/bulk-access] audit insert failed:", auditError?.message);
    }

    return res.status(200).json({
      ok: true,
      assigned_count: inserts.length,
      already_assigned_count: alreadyAssignedCount,
      user_count: targetRows.length,
      role,
    });
  } catch (error: any) {
    console.error("[admin/users/bulk-access] failed:", error);
    return res.status(500).json({ error: dbErrorMessage(error) || "Could not assign the role" });
  }
}

export default withApiLogging(handler);
