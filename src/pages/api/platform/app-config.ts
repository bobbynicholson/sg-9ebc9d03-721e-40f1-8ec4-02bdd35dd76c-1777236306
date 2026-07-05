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
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
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
    // Accept super_admin on EITHER column: the role/active_role manager
    // split means a super_admin can have active_role temporarily set to
    // something else; the page gate (ProtectedRoute) already admits them,
    // so a stricter check here just renders the page as a wall of 403s.
    const roles = [(profile as any)?.role, (profile as any)?.active_role].map((r) => String(r || ""));
    if (!roles.includes("super_admin")) {
      return res.status(403).json({ error: "Super admin only" });
    }

    const sb: any = getServiceSupabase();

    if (req.method === "GET") {
      const { data, error } = await sb
        .from("app_config")
        .select("key, value")
        .order("key", { ascending: true });
      if (error) return res.status(500).json({ error: dbErrorMessage(error) });
      return res.status(200).json({ entries: data || [] });
    }

    if (req.method === "PUT") {
      const key = String((req.body as any)?.key || "").trim();
      let value = String((req.body as any)?.value ?? "").trim();
      if (!key) return res.status(400).json({ error: "key is required" });
      if (value.length > 10_000) return res.status(400).json({ error: "value too long" });

      // An empty value means "remove the override, fall back to the code
      // default". Storing "" would make the settings page show a blank
      // while consumers silently enforce their fallback - the surface and
      // the effective value must never disagree.
      if (!value) {
        const { error } = await sb.from("app_config").delete().eq("key", key);
        if (error) return res.status(500).json({ error: dbErrorMessage(error) });
        return res.status(200).json({ ok: true, deleted: true });
      }

      // Per-key validation. Consumers fall back SILENTLY on bad values
      // (getImportRowCap parses 1..100000 else 200; the public_origin()
      // DB function feeds every trigger-generated email link), so a bad
      // save here would show on the page while never taking effect.
      if (key === "import_row_cap") {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 100_000) {
          return res.status(400).json({ error: "Import row cap must be a whole number between 1 and 100000." });
        }
        value = String(n);
      }
      if (key === "public_origin") {
        try {
          const u = new URL(value);
          if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad protocol");
          if (u.search || u.hash) throw new Error("no query/hash");
          value = `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
        } catch {
          return res.status(400).json({ error: "Public origin must be a full http(s) URL like https://cateringms.com (no query string, no trailing slash)." });
        }
      }

      const { error } = await sb
        .from("app_config")
        .upsert({ key, value } as any, { onConflict: "key" });
      if (error) return res.status(500).json({ error: dbErrorMessage(error) });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    console.error("/api/platform/app-config crashed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "Failed" });
  }
}

export default withApiLogging(handler);
