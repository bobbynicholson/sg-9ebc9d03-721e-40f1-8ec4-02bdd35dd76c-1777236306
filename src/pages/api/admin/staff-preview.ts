import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { deriveUserRoles } from "@/lib/roleDerivation";

const ADMIN_ROLES = new Set(["super_admin", "owner", "company_admin", "admin"]);

/** Resolve a same-company staff identity for an administrator's read-only preview. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const ssr = createPagesServerClient({ req, res });
    let { data: { user: authUser } } = await ssr.auth.getUser();
    if (!authUser) {
      const authorization = String(req.headers.authorization || "");
      const accessToken = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : "";
      if (accessToken) {
        authUser = (await getServiceSupabase().auth.getUser(accessToken)).data.user;
      }
    }
    if (!authUser) return res.status(401).json({ ok: false, error: "Sign in to preview a staff account." });

    const admin = getServiceSupabase();
    const { data: caller, error: callerError } = await admin
      .from("profiles")
      .select("id, role, active_role, company_id, is_active, deleted_at")
      .eq("id", authUser.id)
      .maybeSingle();
    if (callerError) throw callerError;
    if (!caller || caller.is_active === false || caller.deleted_at) {
      return res.status(403).json({ ok: false, error: "Your administrator account is not active." });
    }

    // Use the signed-in account's granted role, not the preview identity or
    // its selected portal, as the authority check.
    const { data: callerAssignments, error: callerAssignmentsError } = await admin
      .from("user_departments")
      .select("department, is_primary")
      .eq("user_id", authUser.id);
    if (callerAssignmentsError) throw callerAssignmentsError;
    const callerRoles = deriveUserRoles({
      profileRole: caller.role,
      activeRole: caller.active_role,
      departments: callerAssignments || [],
    }).roles;
    if (!callerRoles.some((role) => ADMIN_ROLES.has(role))) {
      return res.status(403).json({ ok: false, error: "Business or Operations Administrator access is required." });
    }

    let companyId = String(caller.company_id || "");
    if (!companyId && caller.role === "super_admin") {
      const companySlug = String(req.query.company_slug || "").trim();
      if (companySlug) {
        const { data: company, error: companyError } = await admin
          .from("companies")
          .select("id")
          .eq("slug", companySlug)
          .maybeSingle();
        if (companyError) throw companyError;
        companyId = String(company?.id || "");
      }
    }
    if (!companyId) {
      return res.status(400).json({ ok: false, error: "Open a company workspace before previewing staff." });
    }

    const targetUserId = String(req.query.target_user_id || "").trim();
    if (!targetUserId || targetUserId === authUser.id) {
      return res.status(400).json({ ok: false, error: "Choose a different staff account to preview." });
    }

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, full_name, email, role, active_role, company_id, phone_number, avatar_url, currency, is_active, deleted_at")
      .eq("id", targetUserId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.is_active === false || target.deleted_at) {
      return res.status(404).json({ ok: false, error: "That active staff account was not found in this company." });
    }

    const { data: assignments, error: assignmentsError } = await admin
      .from("user_departments")
      .select("department, is_primary")
      .eq("user_id", targetUserId)
      .order("is_primary", { ascending: false });
    if (assignmentsError) throw assignmentsError;

    const resolved = deriveUserRoles({
      profileRole: target.role,
      activeRole: target.active_role,
      departments: assignments || [],
    });
    const previewableRoles = resolved.roles.filter((role) => role !== "client" && role !== "super_admin");
    if (previewableRoles.length === 0) {
      return res.status(400).json({ ok: false, error: "This account does not have a staff portal to preview." });
    }

    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.status(200).json({
      ok: true,
      profile: target,
      roles: previewableRoles,
      active_role: resolved.activeRole,
    });
  } catch (error: any) {
    console.error("[admin/staff-preview] failed:", error?.message || error);
    return res.status(500).json({ ok: false, error: "We could not load this staff preview. Try again." });
  }
}

export default handler;
