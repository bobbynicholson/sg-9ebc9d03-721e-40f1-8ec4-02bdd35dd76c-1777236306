/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET / PUT /api/platform/app-config
 *
 * Super_admin-only access to the app_config key/value store. Used by
 * the SaaS settings page to edit values like import_row_cap. Tenant
 * admins never touch this - there's nothing per-tenant in app_config
 * (tenant settings live elsewhere).
 *
 * GET returns every row. PUT accepts { key, value } and upserts.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";


async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (role !== "super_admin") {
      return res.status(403).json({ error: "Super admin only" });
    }

    const sb: any = getServiceSupabase();

    if (req.method === "GET") {
      const { data, error } = await sb
        .from("app_config")
        .select("key, value")
        .order("key", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ entries: data || [] });
    }

    if (req.method === "PUT") {
      const key = String((req.body as any)?.key || "").trim();
      const value = String((req.body as any)?.value ?? "").trim();
      if (!key) return res.status(400).json({ error: "key is required" });
      if (value.length > 10_000) return res.status(400).json({ error: "value too long" });

      const { error } = await sb
        .from("app_config")
        .upsert({ key, value } as any, { onConflict: "key" });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    console.error("/api/platform/app-config crashed:", e);
    return res.status(500).json({ error: e?.message || "Failed" });
  }
}

export default withApiLogging(handler);
