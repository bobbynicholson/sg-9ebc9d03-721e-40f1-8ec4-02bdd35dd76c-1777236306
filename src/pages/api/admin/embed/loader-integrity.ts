/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/admin/embed/loader-integrity
 *
 * Returns the SRI integrity attribute for /embed/loader.js so the
 * snippet builder can lock the script tag to a specific hash. Mitigates
 * the supply-chain risk the auditors flagged: if cateringms.com's CDN
 * is ever compromised and loader.js is swapped, host-site browsers
 * with the integrity attribute set will refuse to execute the modified
 * script.
 *
 * The hash is computed from the file on disk. Cached in module memory
 * for the process lifetime (Vercel re-deploys spawn fresh processes,
 * so the hash always tracks the deployed file).
 *
 * Auth: any logged-in admin role. The hash itself isn't sensitive
 * (it's literally a one-way digest of a public file) but we gate the
 * endpoint to keep it out of unauthenticated scrapers' reach.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { createPagesServerClient } from "@/lib/supabase/server";

const ALLOWED = new Set(["super_admin", "company_admin", "admin"]);

let cached: { integrity: string; sha384: string } | null = null;

function computeIntegrity(): { integrity: string; sha384: string } {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "public", "embed", "loader.js");
  const buf = readFileSync(filePath);
  const hash = createHash("sha384").update(buf).digest("base64");
  cached = { sha384: hash, integrity: `sha384-${hash}` };
  return cached;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Authentication required" });

  const { data: profile, error: profileErr } = await ssr
    .from("profiles")
    .select("role, active_role")
    .eq("id", user.id)
    .single();
  if (profileErr) {
    console.error("[admin/embed/loader-integrity] profiles fetch failed:", profileErr);
  }
  const role = (profile as any)?.active_role || (profile as any)?.role;
  if (!ALLOWED.has(role)) return res.status(403).json({ error: "Forbidden" });

  try {
    const result = computeIntegrity();
    // Cache aggressively -- the integrity hash only changes on deploy,
    // and a fresh process always recomputes.
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).json({
      ok: true,
      integrity: result.integrity,
      crossorigin: "anonymous",
    });
  } catch (err: any) {
    console.error("[admin/embed/loader-integrity] failed", err);
    return res.status(500).json({ error: err?.message || "Could not compute integrity" });
  }
}
