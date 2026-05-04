/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/admin/embed/rotate-token
 *
 * Rotates companies.embed_token to a fresh UUID. Every existing embed
 * snippet (the data-token in HTML the tenant has scattered across their
 * marketing pages, helpdesk articles, etc) will stop working
 * immediately -- that's the point. Use cases:
 *   - The token leaked (a developer pasted it into a public ticket).
 *   - The tenant changed agencies and wants the old agency's snippets
 *     to stop spamming leads in.
 *   - Periodic hygiene rotation.
 *
 * Returns the new token so the caller can refresh the visible snippet
 * inline without re-fetching the company record.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

const ALLOWED = new Set(["super_admin", "company_admin", "admin"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Authentication required" });

  const { data: profile } = await ssr
    .from("profiles")
    .select("role, active_role, company_id")
    .eq("id", user.id)
    .single();
  if (!profile) return res.status(403).json({ error: "Profile not found" });

  const role = (profile as any).active_role || (profile as any).role;
  if (!ALLOWED.has(role)) return res.status(403).json({ error: "Forbidden" });
  const companyId = (profile as any).company_id as string | null;
  if (!companyId) return res.status(400).json({ error: "Missing company" });

  const db = getServiceSupabase();

  // Postgres generates the new token via gen_random_uuid() (the column
  // already has the default; we do it inline so we don't depend on
  // whether the column DEFAULT fires on UPDATE).
  const { data: rotated, error } = await (db as any).rpc(
    "rotate_company_embed_token",
    { p_company_id: companyId },
  );
  if (error) {
    // Fallback for environments where the helper RPC isn't yet
    // installed -- generate the uuid in-process and update directly.
    try {
      const fresh = (await import("crypto")).randomUUID();
      const { data: row, error: upErr } = await (db as any)
        .from("companies")
        .update({ embed_token: fresh })
        .eq("id", companyId)
        .select("embed_token")
        .single();
      if (upErr) throw upErr;
      return res.status(200).json({ ok: true, embed_token: row.embed_token });
    } catch (fallbackErr: any) {
      console.error("[admin/embed/rotate-token] failed", fallbackErr);
      return res.status(500).json({ error: fallbackErr?.message || "Rotation failed" });
    }
  }

  return res.status(200).json({ ok: true, embed_token: rotated });
}
