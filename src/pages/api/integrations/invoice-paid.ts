/**
 * Inbound: flip a CateringMS order's payment_status when the matching
 * Xero invoice is paid. Wire this to a Xero "Invoice paid" Zapier
 * trigger -> "Webhooks - POST" action pointed here.
 *
 *   POST /api/integrations/invoice-paid
 *   Authorization: Bearer cms_<key>
 *   Content-Type: application/json
 *   {
 *     "xero_invoice_id": "INV-0042",     // optional, preferred match
 *     "order_number":    "ORD-20260502", // fallback match
 *     "amount":          60000.00         // optional, defaults to "fully paid"
 *   }
 *
 * Smart partial vs full handling: amount >= total means fully paid;
 * less means deposit_paid + payment_status='partial'.
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
  const { data, error } = await client.rpc("api_mark_invoice_paid", {
    p_key_hash: tokenHash,
    p_payload: body,
  });
  if (error) return res.status(500).json({ error: error.message });

  const result = data as any;
  if (!result?.ok) {
    const map: Record<string, number> = {
      invalid_key: 401, no_scope: 403, order_not_found: 404,
    };
    return res.status(map[result?.code] ?? 400).json({ error: result?.code });
  }
  return res.status(200).json(result);
}
