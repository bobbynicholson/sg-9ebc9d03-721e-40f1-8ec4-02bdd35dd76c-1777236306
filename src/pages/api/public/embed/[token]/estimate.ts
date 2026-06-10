/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  applyCorsHeaders,
  checkAndIncrementRateLimit,
  getClientIp,
  hashIp,
  isUuid,
} from "@/lib/embedFormApi";
import { withApiLogging } from "@/lib/withApiLogging";


/**
 * GET /api/public/embed/[token]/estimate?guests=N&tierId=X
 *
 * Returns a low/high price estimate using the tenant's saved pricing tiers.
 * Public, unauthenticated - guarded by token + rate-limit.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res, { cacheSeconds: 30 });

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) {
    return res.status(404).json({ ok: false, message: "Not found" });
  }

  const guestsRaw = req.query.guests;
  const tierIdRaw = req.query.tierId;

  const guests = parseInt(String(guestsRaw ?? ""), 10);
  if (!Number.isFinite(guests) || guests <= 0 || guests > 100_000) {
    return res
      .status(400)
      .json({ ok: false, message: "Invalid guest count" });
  }

  const tierId = typeof tierIdRaw === "string" ? tierIdRaw.slice(0, 100) : "";

  const supabase = getServiceSupabase();

  const ip = getClientIp(req as any);
  const ipHash = hashIp(ip);
  const rl = await checkAndIncrementRateLimit(token, ipHash, supabase, {
    limit: 600,
    bucket: "minute",
  });
  if (!rl.allowed) {
    res.setHeader("Cache-Control", "no-store");
    return res
      .status(429)
      .json({ ok: false, message: "Too many requests, slow down" });
  }

  const { data: company, error: companyErr } = await (supabase as any)
    .from("companies")
    .select(
      "id, currency, is_active, deleted_at, embed_token, embed_pricing_tiers"
    )
    .eq("embed_token", token)
    .maybeSingle();
  if (companyErr) {
    console.error("[public/embed/[token]/estimate] companies fetch failed:", companyErr);
  }

  if (!company || company.is_active === false || company.deleted_at) {
    return res.status(404).json({ ok: false, message: "Not found" });
  }

  const tiers = Array.isArray(company.embed_pricing_tiers)
    ? company.embed_pricing_tiers
    : [];
  if (tiers.length === 0) {
    return res
      .status(200)
      .json({ ok: false, message: "No pricing configured" });
  }

  const tier = tierId
    ? tiers.find((t: any) => String(t?.id) === tierId)
    : tiers[0];
  if (!tier) {
    return res
      .status(200)
      .json({ ok: false, message: "No pricing configured" });
  }

  const minPp = Number(tier.price_per_person_min);
  const maxPp = Number(tier.price_per_person_max);
  if (!Number.isFinite(minPp) || !Number.isFinite(maxPp)) {
    return res
      .status(200)
      .json({ ok: false, message: "No pricing configured" });
  }

  const low = Math.round(guests * minPp * 100) / 100;
  const high = Math.round(guests * maxPp * 100) / 100;

  return res.status(200).json({
    ok: true,
    low,
    high,
    currency: company.currency || "ZAR",
    perPerson: { min: minPp, max: maxPp },
    tier: {
      id: String(tier.id),
      name: tier.name || "Standard",
    },
  });
}

export default withApiLogging(handler);
