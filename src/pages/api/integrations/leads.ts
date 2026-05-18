/**
 * Inbound integration endpoint - catering company's tool (Zapier,
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
 * scope, and inserts into leads - which fires the lead.created
 * webhook trigger automatically.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { consumeApiKeyRateLimitDb } from "@/lib/apiKeyRateLimit";
import { getServiceSupabase } from "@/lib/supabase/service";
import { notifyAdminOfEmbedLead } from "@/lib/embed/notifyAdminOfEmbedLead";

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

  // Per-key rate limit. DB-backed so the cap is a hard ceiling
  // regardless of Vercel function instance count [P2F-2]. Falls back
  // to in-memory on RPC error so a transient DB blip doesn't fail-
  // open the limiter entirely.
  let rateLimitClient: any = null;
  try { rateLimitClient = getServiceSupabase(); } catch { /* falls back */ }
  const rl = rateLimitClient
    ? await consumeApiKeyRateLimitDb(rateLimitClient, keyHash, { maxPerMinute: 60 })
    : { allowed: true, remaining: 60, resetInMs: 60_000 };
  if (!rl.allowed) {
    res.setHeader("Retry-After", Math.ceil(rl.resetInMs / 1000).toString());
    return res.status(429).json({ error: "Rate limit exceeded for this API key. Try again shortly." });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return res.status(500).json({ error: "Server misconfigured" });
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};

  // Email is mandatory at every lead entry point. The follow-up
  // engine, invoice flow and lifecycle hooks all assume an
  // addressable client. Reject up front so the embed form / Zapier
  // / direct API caller gets a clear 400 instead of a downstream
  // NOT NULL constraint violation.
  const submittedEmail = String(body?.email || body?.client_email || "").trim();
  if (!submittedEmail) {
    return res.status(400).json({
      error: "email_required",
      message: "Every lead must include a contact email. No deal without one.",
    });
  }

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

  // Wave 11 #3: leads.created webhook trigger fires automatically when
  // api_create_lead inserts the row, but the operator-facing fan-out
  // (in-portal toast, admin email, WhatsApp, region-manager push) used
  // to live in the embed-form path only. Inbound integration leads
  // (Zapier, Make, Facebook Lead Ads) sat silently in the table; the
  // operator only saw them by manually opening /admin/leads. Mirror
  // the embed-form fan-out via notifyAdminOfEmbedLead so every lead
  // entry point gets the same alert chain.
  void (async () => {
    try {
      const svc = getServiceSupabase();
      const [{ data: leadRow }, { data: company }] = await Promise.all([
        svc.from("leads").select("*").eq("id", result.lead_id).maybeSingle(),
        svc.from("companies").select("owner_id").eq("id", result.company_id).maybeSingle(),
      ]);
      const proto = (req.headers["x-forwarded-proto"] || "https") as string;
      const host = (req.headers["x-forwarded-host"] || req.headers.host || "") as string;
      const appOrigin =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : "") ||
        (host ? `${proto}://${host}` : "");
      await notifyAdminOfEmbedLead(svc, {
        companyId: result.company_id,
        ownerUserId: ((company as any)?.owner_id as string | null) ?? null,
        regionId: ((leadRow as any)?.region_id as string | null) ?? null,
        leadId: result.lead_id,
        leadInsert: (leadRow as any) ?? body,
        formName: typeof body?.source === "string" ? `Inbound integration (${body.source})` : "Inbound integration",
        formId: null,
        formNotifyAdminEmail: true,
        appOrigin,
      });
    } catch (e) {
      console.warn("[api/integrations/leads] notification fan-out failed (non-blocking):", e);
    }
  })();

  return res.status(201).json({
    ok: true,
    lead_id: result.lead_id,
    company_id: result.company_id,
  });
}
