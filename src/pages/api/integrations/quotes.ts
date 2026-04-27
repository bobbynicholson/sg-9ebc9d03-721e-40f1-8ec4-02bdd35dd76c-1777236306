/**
 * Inbound: create / update a CateringMS quote from an external system.
 * Designed for Xero -> Zapier -> us, but works for any tool that can
 * POST JSON.
 *
 *   POST /api/integrations/quotes
 *   Authorization: Bearer cms_<key>
 *   Content-Type: application/json
 *   {
 *     "xero_quote_id": "QUOTE-0042",
 *     "quote_number":  "Q-0042",
 *     "quote_name":    "Le Roux Wedding",
 *     "client_name":   "Tollie Le Roux",
 *     "client_email":  "tollie@example.com",
 *     "event_date":    "2026-08-15",
 *     "guest_count":   80,
 *     "venue_address": "Stellenbosch",
 *     "subtotal":      52173.91,
 *     "tax_amount":    7826.09,
 *     "total_amount":  60000.00,
 *     "status":        "sent",
 *     "valid_until":   "2026-05-31",
 *     "notes":         "..."
 *   }
 *
 * Idempotent on (company_id, xero_quote_id) -- delivering the same
 * payload twice updates the existing row instead of creating a
 * duplicate.
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
  const tokenHash = sha256Hex(m[1]);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return res.status(500).json({ error: "Server misconfigured" });
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
  const { data, error } = await client.rpc("api_create_quote", {
    p_key_hash: tokenHash,
    p_payload: body,
  });
  if (error) return res.status(500).json({ error: error.message });

  const result = data as any;
  if (!result?.ok) {
    const map: Record<string, number> = {
      invalid_key: 401, no_scope: 403, client_required: 400,
    };
    return res.status(map[result?.code] ?? 400).json({ error: result?.code });
  }
  return res.status(result.created ? 201 : 200).json(result);
}
