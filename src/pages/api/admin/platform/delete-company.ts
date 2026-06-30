/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getCompanyId(req: NextApiRequest): string | null {
  const bodyId = typeof req.body?.companyId === "string" ? req.body.companyId : null;
  const queryId = typeof req.query.companyId === "string" ? req.query.companyId : null;
  const companyId = bodyId || queryId;
  return companyId && UUID_RE.test(companyId) ? companyId : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && UUID_RE.test(id));
}

async function deleteAuthUsers(admin: any, userIds: string[], callerUserId: string) {
  const failures: Array<{ id: string; error: string }> = [];
  const uniqueIds = Array.from(new Set(userIds)).filter((id) => id !== callerUserId);

  for (const userId of uniqueIds) {
    try {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        failures.push({ id: userId, error: error.message || "Auth delete failed" });
      }
    } catch (err: any) {
      failures.push({ id: userId, error: err?.message || "Auth delete failed" });
    }
  }

  return { attempted: uniqueIds.length, failures };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST" && req.method !== "DELETE") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const companyId = getCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ error: "Missing or invalid companyId" });
    }

    const ssrClient = createPagesServerClient({ req, res });
    const { data: { user: callerAuth } } = await ssrClient.auth.getUser();
    if (!callerAuth) {
      return res.status(401).json({ error: "No active session found. Sign in again and retry." });
    }

    const { data: callerProfile, error: callerProfileErr } = await ssrClient
      .from("profiles")
      .select("role, active_role")
      .eq("id", callerAuth.id)
      .single();

    if (callerProfileErr || !callerProfile) {
      return res.status(403).json({ error: "Caller profile not found." });
    }

    const callerRole = (callerProfile as any).active_role || (callerProfile as any).role;
    if (callerRole !== "super_admin") {
      return res.status(403).json({ error: "Only super admins can delete companies." });
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

    const { data: company, error: companyErr } = await admin
      .from("companies")
      .select("id, company_name, slug")
      .eq("id", companyId)
      .maybeSingle();

    if (companyErr) {
      return res.status(500).json({ error: dbErrorMessage(companyErr, { entity: "company" }) });
    }
    if (!company) {
      return res.status(404).json({ error: "Company not found." });
    }

    const { data: targetProfiles, error: profilesErr } = await admin
      .from("profiles")
      .select("id")
      .eq("company_id", companyId);

    if (profilesErr) {
      return res.status(500).json({ error: dbErrorMessage(profilesErr, { entity: "company users" }) });
    }

    const profileIds = ((targetProfiles || []) as Array<{ id: string }>).map((p) => p.id);
    if (profileIds.includes(callerAuth.id)) {
      return res.status(400).json({
        error: "You cannot delete the company that contains your current super-admin account.",
      });
    }

    const { data: purgeResult, error: purgeErr } = await admin.rpc("admin_hard_delete_company", {
      p_company_id: companyId,
      p_actor_user_id: callerAuth.id,
    });

    if (purgeErr) {
      const message = purgeErr.message || "";
      if (purgeErr.code === "PGRST202" || /admin_hard_delete_company|could not find the function/i.test(message)) {
        return res.status(500).json({
          error: "The company-delete database migration has not been applied yet.",
        });
      }

      console.error("[delete-company] purge failed:", purgeErr);
      return res.status(500).json({
        error: dbErrorMessage(purgeErr, {
          entity: "company",
          fallback: "Could not delete this company and its related data.",
        }),
      });
    }

    const deletedUserIds = asStringArray((purgeResult as any)?.deleted_user_ids);
    const authCleanup = await deleteAuthUsers(
      admin,
      deletedUserIds.length > 0 ? deletedUserIds : profileIds,
      callerAuth.id,
    );

    return res.status(200).json({
      message: "Company deleted",
      company: {
        id: companyId,
        name: (purgeResult as any)?.company_name || company.company_name,
        slug: company.slug,
      },
      deletedUsers: authCleanup.attempted,
      authDeleteFailures: authCleanup.failures,
    });
  } catch (outer: any) {
    console.error("delete-company handler crashed:", outer);
    return res.status(500).json({
      error: dbErrorMessage(outer) || "Unexpected server error",
    });
  }
}

export default withApiLogging(handler);
