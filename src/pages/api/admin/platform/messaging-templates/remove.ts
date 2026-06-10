/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/admin/platform/messaging-templates/remove
 *
 * Super_admin only. Deletes the global-default override row so the
 * resolver falls back to the inline default in the registry. Useful
 * if a platform admin wants to roll back wording changes without
 * working out what the original copy was.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { TEMPLATE_REGISTRY } from "@/lib/messageTemplates/registry";
import { withApiLogging } from "@/lib/withApiLogging";


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Authentication required" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role")
      .eq("id", user.id)
      .maybeSingle();
    const role = (profile as any)?.active_role || (profile as any)?.role;
    if (role !== "super_admin") {
      return res.status(403).json({ error: "Super admin only" });
    }

    const { key, channel } = req.body || {};
    if (!key || typeof key !== "string") {
      return res.status(400).json({ error: "templateKey is required" });
    }
    if (channel !== "email" && channel !== "whatsapp") {
      return res.status(400).json({ error: "channel must be email or whatsapp" });
    }
    const def = TEMPLATE_REGISTRY.find((t) => t.key === key);
    if (!def) return res.status(404).json({ error: `Template ${key} not in registry` });
    if ((def.scope ?? "tenant") !== "platform") {
      return res.status(403).json({
        error: `${key} is a tenant-scoped template. Edit it from /admin/email-templates.`,
      });
    }

    const admin = getServiceSupabase();
    if (channel === "email") {
      const { error } = await (admin as any)
        .from("email_templates")
        .delete()
        .is("company_id", null)
        .eq("template_type", key);
      if (error) throw error;
    } else {
      const { error } = await (admin as any)
        .from("whatsapp_templates")
        .delete()
        .is("company_id", null)
        .eq("template_key", key);
      if (error) throw error;
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("[platform-templates/remove] crashed:", err);
    return res.status(500).json({ error: err?.message || "Unexpected server error" });
  }
}

export default withApiLogging(handler);
