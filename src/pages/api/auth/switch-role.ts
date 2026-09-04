/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { UserRole } from "@/types/app";

const ROLE_VALUES = new Set<string>(Object.values(UserRole));

/**
 * The middleware caches the active role in a signed HttpOnly cookie for
 * normal navigation. A role switch changes that value in the database, so
 * invalidate the old cache before the browser opens the new portal.
 * Preserve any Supabase Set-Cookie headers already queued by getUser().
 */
function clearMiddlewareProfileCache(res: NextApiResponse) {
  const existing = res.getHeader("Set-Cookie");
  const cookies = Array.isArray(existing)
    ? existing.map(String)
    : existing
      ? [String(existing)]
      : [];
  cookies.push(
    `cms.mw.profile=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  res.setHeader("Set-Cookie", cookies);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ssr = createPagesServerClient({ req, res });
    let { data: { user: authUser } } = await ssr.auth.getUser();
    // Password login can hydrate the browser Supabase client before the
    // SSR cookie refresh completes. Accept the same authenticated session's
    // short-lived bearer token so role switching never requires a second
    // login or a role-specific password.
    if (!authUser) {
      const authorization = String(req.headers.authorization || "");
      const accessToken = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : "";
      if (accessToken) {
        const admin = getServiceSupabase();
        const tokenResult = await admin.auth.getUser(accessToken);
        authUser = tokenResult.data.user;
      }
    }
    if (!authUser) return res.status(401).json({ error: "You must be signed in to choose a portal." });

    const requestedRole = String(req.body?.role || "").trim();
    if (!ROLE_VALUES.has(requestedRole)) {
      return res.status(400).json({ error: "Choose one of the portal roles assigned to your account." });
    }

    const admin = getServiceSupabase();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, role, active_role, company_id")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return res.status(404).json({ error: "Your account profile could not be found." });

    const { data: assignments, error: assignmentsError } = await admin
      .from("user_departments")
      .select("department")
      // user_departments is keyed by user_id in the live schema; the
      // tenant boundary is enforced through the user's profile above.
      .eq("user_id", authUser.id);
    if (assignmentsError) throw assignmentsError;

    const assignedRoles = new Set([
      String(profile.role || "").trim(),
      String(profile.active_role || "").trim(),
      ...(assignments || []).map((assignment) => String(assignment.department || "").trim()),
    ].filter(Boolean));
    if (!assignedRoles.has(requestedRole)) {
      return res.status(403).json({
        error: "That portal is not assigned to your account. Ask an administrator to add this role first.",
      });
    }

    if (profile.active_role !== requestedRole) {
      const { error: updateError } = await admin
        .from("profiles")
        .update({ active_role: requestedRole })
        .eq("id", authUser.id);
      if (updateError) throw updateError;
    }

    try {
      await admin.from("user_access_audit").insert({
        company_id: profile.company_id,
        target_user_id: authUser.id,
        actor_user_id: authUser.id,
        action: "active_role_changed",
        details: {
          previous_role: profile.active_role || profile.role || null,
          active_role: requestedRole,
          source: "portal_selector",
        },
      });
    } catch (auditError: any) {
      console.warn("[auth/switch-role] audit insert failed:", auditError?.message);
    }

    clearMiddlewareProfileCache(res);
    return res.status(200).json({ ok: true, active_role: requestedRole });
  } catch (error: any) {
    console.error("[auth/switch-role] failed:", error);
    return res.status(500).json({ error: dbErrorMessage(error) || "We could not save your portal choice." });
  }
}

export default withApiLogging(handler);
