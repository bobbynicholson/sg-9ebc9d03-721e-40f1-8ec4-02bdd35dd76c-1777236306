import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import {
  CHAT_ACCESS_ROLE_DETAILS,
  CHAT_ACCESS_ROLES,
  listChatAccessPolicies,
} from "@/server/chatbot/accessPolicy";
import { getLiveToolDefinition, LIVE_TOOL_DEFINITIONS } from "@/server/chatbot/liveTools";

const MANAGER_ROLES = new Set(["super_admin", "owner", "company_admin"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(["GET", "PATCH"] as string[]).includes(req.method || "")) {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const db = createPagesServerClient({ req, res }) as any;
  const { data: { user } } = await db.auth.getUser();
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const { data: profile } = await db
    .from("profiles")
    .select("role, active_role, company_id")
    .eq("id", user.id)
    .maybeSingle();
  const callerRoles = [profile?.role, profile?.active_role].filter(Boolean).map(String);
  // Only the canonical profile role grants platform scope. An active/delegated
  // role must never elevate a company administrator to global controls.
  const isPlatformAdmin = String(profile?.role || "") === "super_admin";
  // A platform administrator is always global, even if an old/dev profile
  // still carries a tenant company_id. Never let that stale value turn
  // platform policy changes into tenant-scoped changes.
  const companyId = isPlatformAdmin ? null : profile?.company_id as string | null;
  if (!companyId && !isPlatformAdmin) return res.status(400).json({ error: "Your profile has no company context" });
  if (!callerRoles.some((role) => MANAGER_ROLES.has(role))) return res.status(403).json({ error: "Only owners and company administrators can manage AI access" });

  if (req.method === "GET") {
    const policies = await listChatAccessPolicies(db, companyId);
    return res.status(200).json({
      policies,
      roleDetails: CHAT_ACCESS_ROLE_DETAILS,
      toolDefinitions: LIVE_TOOL_DEFINITIONS,
      note: "Live data is exposed only through approved role-scoped queries. This is not unrestricted SQL or database access.",
    });
  }

  const role = String(req.body?.role || "");
  const toolId = req.body?.toolId == null ? null : String(req.body.toolId);
  const enabled = req.body?.liveDataEnabled;
  if (!(CHAT_ACCESS_ROLES as readonly string[]).includes(role)) return res.status(400).json({ error: "Unknown user role" });
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "liveDataEnabled must be boolean" });
  if (role === "super_admin" && !callerRoles.includes("super_admin")) return res.status(403).json({ error: "Platform super admin access is managed centrally" });

  if (toolId) {
    const tool = getLiveToolDefinition(toolId);
    if (!tool) return res.status(400).json({ error: "Unknown live-data tool" });
    if (!tool.roles.includes(role)) return res.status(400).json({ error: "This tool is not eligible for that role" });
    const values = { company_id: companyId, role, tool_id: toolId, enabled, updated_by: user.id, updated_at: new Date().toISOString() };
    let data: any = null;
    let error: any = null;
    if (!companyId) {
      const existing = await db.from("ai_brain_tool_policies").select("id").is("company_id", null).eq("role", role).eq("tool_id", toolId).maybeSingle();
      if (existing.error) error = existing.error;
      else if (existing.data?.id) ({ data, error } = await db.from("ai_brain_tool_policies").update(values).eq("id", existing.data.id).select("role, tool_id, enabled, updated_at").single());
      else ({ data, error } = await db.from("ai_brain_tool_policies").insert(values).select("role, tool_id, enabled, updated_at").single());
    } else {
      ({ data, error } = await db.from("ai_brain_tool_policies").upsert(values, { onConflict: "company_id,role,tool_id" }).select("role, tool_id, enabled, updated_at").single());
    }
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({
      policy: { role: data.role, toolId: data.tool_id, enabled: data.enabled !== false, updatedAt: data.updated_at },
    });
  }

  const values = { company_id: companyId, role, live_data_enabled: enabled, updated_by: user.id, updated_at: new Date().toISOString() };
  let data: any = null;
  let error: any = null;
  if (!companyId) {
    const existing = await db.from("ai_brain_access_policies").select("id").is("company_id", null).eq("role", role).maybeSingle();
    if (existing.error) error = existing.error;
    else if (existing.data?.id) ({ data, error } = await db.from("ai_brain_access_policies").update(values).eq("id", existing.data.id).select("role, live_data_enabled, updated_at").single());
    else ({ data, error } = await db.from("ai_brain_access_policies").insert(values).select("role, live_data_enabled, updated_at").single());
  } else {
    ({ data, error } = await db.from("ai_brain_access_policies").upsert(values, { onConflict: "company_id,role" }).select("role, live_data_enabled, updated_at").single());
  }
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({
    policy: { role: data.role, liveDataEnabled: data.live_data_enabled !== false, source: "database", updatedAt: data.updated_at },
  });
}

export default withApiLogging(handler);
