/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { applyCorsHeaders, getClientIp, hashIp, isUuid } from "@/lib/embedFormApi";
import { withApiLogging } from "@/lib/withApiLogging";

/**
 * GET /api/public/embed/[token]/address-suggest?q=...
 *
 * Address suggestions for the venue field while a visitor types, on any
 * website the form is embedded in. Public, unauthenticated; the embed
 * token must belong to an active company.
 *
 * Provider: Photon (komoot), the OpenStreetMap search built for
 * type-ahead. Not Google: the only Maps key is referrer-restricted to our
 * own domain, so it cannot serve tenant websites. Not Nominatim: its usage
 * policy forbids autocomplete. Best-effort: any failure returns an empty
 * list and the visitor simply types the full address.
 */

const PHOTON_URL = "https://photon.komoot.io/api/";
const TIMEOUT_MS = 4500;
const PER_IP_PER_MINUTE = 60;

// Bounding boxes (minLon,minLat,maxLon,maxLat) keep suggestions in the
// tenant's market. Keyed by the company's currency, the closest proxy for
// country the companies row carries.
const BBOX_BY_CURRENCY: Record<string, string> = {
  ZAR: "16.3,-35.0,33.0,-22.0",
  GBP: "-8.7,49.8,1.8,60.9",
  AUD: "112.9,-43.7,153.7,-10.6",
  NZD: "166.3,-47.4,178.6,-34.3",
};

const companyCache = new Map<string, { ok: boolean; currency: string; at: number }>();
const ipHits = new Map<string, { count: number; windowStart: number }>();

function throttled(ipKey: string): boolean {
  const now = Date.now();
  const hit = ipHits.get(ipKey);
  if (!hit || now - hit.windowStart > 60_000) {
    ipHits.set(ipKey, { count: 1, windowStart: now });
    if (ipHits.size > 5000) ipHits.clear();
    return false;
  }
  hit.count += 1;
  return hit.count > PER_IP_PER_MINUTE;
}

async function resolveCompany(token: string) {
  const cached = companyCache.get(token);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached;
  const { data } = await (getServiceSupabase() as any)
    .from("companies")
    .select("id, is_active, deleted_at, currency")
    .eq("embed_token", token)
    .maybeSingle();
  const entry = {
    ok: Boolean(data && data.is_active !== false && !data.deleted_at),
    currency: String(data?.currency || "ZAR").toUpperCase(),
    at: Date.now(),
  };
  companyCache.set(token, entry);
  return entry;
}

function formatFeature(f: any): string | null {
  const p = f?.properties || {};
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const parts = [
    p.name && p.name !== p.street ? p.name : null,
    street || null,
    p.district || p.locality || null,
    p.city || p.county || null,
    p.postcode || null,
  ].filter(Boolean) as string[];
  const unique = parts.filter((part, i) => parts.indexOf(part) === i);
  return unique.length >= 2 ? unique.join(", ") : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) return res.status(404).json({ ok: false, message: "Not found" });

  const q = String(req.query.q || "").trim().slice(0, 200);
  if (q.length < 3) return res.status(200).json({ ok: true, suggestions: [] });

  if (throttled(hashIp(getClientIp(req as any)))) {
    return res.status(429).json({ ok: false, message: "Too many requests", suggestions: [] });
  }

  const company = await resolveCompany(token);
  if (!company.ok) return res.status(404).json({ ok: false, message: "Not found" });

  const params = new URLSearchParams({ q, limit: "6", lang: "en" });
  const bbox = BBOX_BY_CURRENCY[company.currency];
  if (bbox) params.set("bbox", bbox);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${PHOTON_URL}?${params.toString()}`, {
      headers: { "User-Agent": "CateringMS/1.0 (+https://cateringms.com)", Accept: "application/json" },
      signal: controller.signal,
    });
    if (!resp.ok) return res.status(200).json({ ok: true, suggestions: [] });
    const json: any = await resp.json();
    const seen = new Set<string>();
    const suggestions: string[] = [];
    for (const feature of Array.isArray(json?.features) ? json.features : []) {
      const label = formatFeature(feature);
      if (label && !seen.has(label)) {
        seen.add(label);
        suggestions.push(label);
      }
    }
    // Same query from many visitors (e.g. a popular venue) is cheap to cache.
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
    return res.status(200).json({ ok: true, suggestions: suggestions.slice(0, 6) });
  } catch {
    return res.status(200).json({ ok: true, suggestions: [] });
  } finally {
    clearTimeout(timer);
  }
}

export default withApiLogging(handler);
