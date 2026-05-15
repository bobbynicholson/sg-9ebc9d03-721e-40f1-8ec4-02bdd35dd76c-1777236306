/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin endpoint for the tenant-level embed settings on the company row:
 * the public embed_token and the pricing tiers used by the calculator
 * + estimator templates.
 *
 *   GET   /api/admin/embed/company        embed_token + pricing tiers
 *   PATCH /api/admin/embed/company        update embed_pricing_tiers (replace)
 *
 * Multi-tenant: pinned to caller's profile.company_id. No way to address
 * another tenant.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

const ALLOWED = new Set(["super_admin", "company_admin", "admin"]);

function sanitiseTier(t: any) {
  if (!t || typeof t !== "object") return null;
  const id = String(t.id || "").slice(0, 64);
  const name = String(t.name || "").slice(0, 100);
  const min = Number(t.price_per_person_min);
  const max = Number(t.price_per_person_max);
  const currency = String(t.currency || "ZAR").slice(0, 8).toUpperCase();
  if (!id || !name) return null;
  if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < min) return null;
  return { id, name, price_per_person_min: min, price_per_person_max: max, currency };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Authentication required" });

  const { data: profile, error: profileErr } = await ssr
    .from("profiles")
    .select("role, active_role, company_id")
    .eq("id", user.id)
    .single();
  if (profileErr) {
    console.error("[admin/embed/company] profiles fetch failed:", profileErr);
  }
  if (!profile) return res.status(403).json({ error: "Profile not found" });

  const role = (profile as any).active_role || (profile as any).role;
  if (!ALLOWED.has(role)) return res.status(403).json({ error: "Forbidden" });
  const companyId = (profile as any).company_id as string | null;
  if (!companyId) return res.status(400).json({ error: "Missing company" });

  const db = getServiceSupabase();

  if (req.method === "GET") {
    const { data, error } = await (db as any)
      .from("companies")
      .select("id, company_name, embed_token, embed_pricing_tiers, primary_color, secondary_color")
      .eq("id", companyId)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, company: data });
  }

  if (req.method === "PATCH") {
    const body = (req.body || {}) as any;
    if (!Array.isArray(body.embed_pricing_tiers)) {
      return res.status(400).json({ error: "embed_pricing_tiers must be an array" });
    }
    const cleaned = body.embed_pricing_tiers
      .map(sanitiseTier)
      .filter(Boolean)
      .slice(0, 20);

    const { data, error } = await (db as any)
      .from("companies")
      .update({ embed_pricing_tiers: cleaned })
      .eq("id", companyId)
      .select("embed_pricing_tiers")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, embed_pricing_tiers: data.embed_pricing_tiers });
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
