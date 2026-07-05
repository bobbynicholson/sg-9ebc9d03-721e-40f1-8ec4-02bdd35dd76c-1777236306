/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Server-side geocoding.
 *
 * Why not Google here: the only Maps key in this project is the
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, which is HTTP-referrer restricted for
 * the browser. Google's Geocoding REST API rejects referrer-restricted
 * keys server-side ("API keys with referer restrictions cannot be used
 * with this API" / REQUEST_DENIED), so a server call with that key never
 * works. Rather than block geocode-on-save on someone provisioning a
 * second, unrestricted server key, we geocode against OpenStreetMap
 * Nominatim - keyless, and the same dataset that already backs the
 * Leaflet map tiles the customer sees on the tracking page.
 *
 * If a dedicated server key is ever added (env GEOCODE_GOOGLE_KEY or a
 * non-referrer-restricted GOOGLE_MAPS_API_KEY), this is the single place
 * to switch providers.
 *
 * Contract: best-effort. Returns null on any failure (no key, bad
 * address, network, rate-limit, timeout). Callers must treat a null as
 * "leave coords empty" and never let it break the save.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

// Nominatim asks every caller to send an identifying User-Agent and to
// keep volume low (<= ~1 req/s). Geocode-on-save is inherently low volume
// (one lookup when an address is first set or changed), so we stay well
// within that. A tight timeout keeps a slow geocoder from stalling saves.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "CateringMS/1.0 (+https://cateringms.com)";
const TIMEOUT_MS = 6000;

/**
 * Geocode a free-text address into { lat, lng }, or null if it can't be
 * resolved. `country` biases results (default South Africa, the platform
 * market) but does not hard-exclude - a clearly foreign address still
 * resolves.
 */
export async function geocodeAddressServer(
  address: string | null | undefined,
  opts: { country?: string } = {},
): Promise<GeoPoint | null> {
  const q = (address || "").trim();
  // A bare token like "venue" or a 2-char scrap isn't worth a lookup and
  // just wastes a Nominatim call; require something address-shaped.
  if (q.length < 4) return null;

  const country = (opts.country || "za").toLowerCase();
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "1",
    addressdetails: "0",
  });
  if (country) params.set("countrycodes", country);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const rows: any[] = await res.json();
    const hit = Array.isArray(rows) ? rows[0] : null;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    // Aborted (timeout), network error, or bad JSON. Best-effort: caller
    // keeps the row's coords empty and the tracking page degrades to a
    // driver-only view instead of erroring.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
