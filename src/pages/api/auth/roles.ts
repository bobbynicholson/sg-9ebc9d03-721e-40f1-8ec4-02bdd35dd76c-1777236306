/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { deriveUserRoles } from "@/lib/roleDerivation";

/**
 * Returns the signed-in user's complete canonical role list. This is a
 * server-side fallback for deployments where a staff member can read their
 * profile but a stale/missing user_departments RLS policy hides one of their
 * assignments from the browser. It is used only for role-picker hydration;
 * route authorization remains enforced by middleware and page guards.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ssr = createPagesServerClient({ req, res });
    let { data: { user: authUser } } = await ssr.auth.getUser();

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
    if (!authUser) return res.status(401).json({ error: "You must be signed in to load your portals." });

    const admin = getServiceSupabase();
    const [{ data: profile, error: profileError }, { data: assignments, error: assignmentsError }] = await Promise.all([
      admin.from("profiles").select("role, active_role").eq("id", authUser.id).maybeSingle(),
      admin.from("user_departments").select("department, is_primary").eq("user_id", authUser.id).order("is_primary", { ascending: false }),
    ]);
    if (profileError) throw profileError;
    if (assignmentsError) throw assignmentsError;
    if (!profile) return res.status(404).json({ error: "Your account profile could not be found." });

    const derived = deriveUserRoles({
      profileRole: profile.role,
      activeRole: profile.active_role,
      departments: assignments || [],
    });
    return res.status(200).json({ ok: true, roles: derived.roles, active_role: derived.activeRole });
  } catch (error: any) {
    console.error("[auth/roles] failed:", error);
    return res.status(500).json({ error: dbErrorMessage(error) || "We could not load your assigned portals." });
  }
}

export default withApiLogging(handler);
