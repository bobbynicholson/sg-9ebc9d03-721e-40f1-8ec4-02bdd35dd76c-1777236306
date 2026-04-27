/**
 * Inbound integration endpoint -- catering company's tool (Zapier,
 * Make, Facebook Lead Ads, custom form) creates a new lead in
 * CateringMS using their API key.
 *
 *   POST /api/integrations/leads
 *   Authorization: Bearer cms_<prefix>_<random>
 *   Content-Type: application/json
 *   {
 *     "contact_name": "Jane Doe",
 *     "email": "jane@example.com",
 *     "phone": "+27 82 555 0100",
 *     "event_date": "2026-08-15",
 *     "guest_count": 80,
 *     "budget_range": "R40,000 - R60,000",
 *     "venue_address": "Sandton",
 *     "source": "facebook_ads",
 *     "notes": "Wedding reception, 80 guests, evening"
 *   }
 *
 * Auth + insert run through the public.api_create_lead SECURITY DEFINER
 * Postgres function so we don't need the service-role key in the API
 * runtime. The function looks up the api_keys.key_hash, validates
 * scope, and inserts into leads -- which fires the lead.created
 * webhook trigger automatically.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const sha256Hex = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function setCors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (!m) return res.status(401).json({ error: "Missing Authorization: Bearer <api key>" });
  const rawKey = m[1];
  const keyHash = sha256Hex(rawKey);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return res.status(500).json({ error: "Server misconfigured" });
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};

  const { data, error } = await client.rpc("api_create_lead", {
    p_key_hash: keyHash,
    p_payload: body,
  });

  if (error) {
    console.error("api_create_lead failed:", error);
    return res.status(500).json({ error: error.message });
  }

  const result = data as any;
  if (!result?.ok) {
    const codeMap: Record<string, number> = {
      invalid_key: 401,
      revoked: 401,
      no_scope: 403,
      contact_name_required: 400,
    };
    return res.status(codeMap[result?.code] ?? 400).json({ error: result?.code || "unknown_error" });
  }

  return res.status(201).json({
    ok: true,
    lead_id: result.lead_id,
    company_id: result.company_id,
  });
}
