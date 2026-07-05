/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Geocode-on-save backstop for a venue address.
 *
 * Both `orders` and `quotes` carry venue_address / venue_lat / venue_lng.
 * The client live-tracking map needs venue_lat/lng to draw the
 * destination pin, route line, and ETA; historically these were only
 * filled when an operator picked a Google Places suggestion in the
 * browser, so hand-typed or imported addresses left them NULL and
 * tracking degraded to a driver-only view.
 *
 * This helper fills them server-side (via Nominatim, see geocodeServer)
 * whenever a row has an address but no coordinates - or when the address
 * changed and the caller asks to re-resolve. It is BEST-EFFORT by
 * design: any failure returns null and never throws, so a slow or failed
 * geocode can never block or roll back the underlying save.
 */
import { geocodeAddressServer, type GeoPoint } from "@/lib/geo/geocodeServer";

export async function ensureVenueCoords(opts: {
  /** Service-role (or otherwise RLS-clear) Supabase client. */
  sb: any;
  table: "orders" | "quotes";
  id: string;
  address: string | null | undefined;
  currentLat?: number | null;
  currentLng?: number | null;
  /**
   * Re-geocode even when coords already exist. Pass true when the venue
   * address has just changed so stale coordinates get refreshed.
   */
  force?: boolean;
  country?: string;
}): Promise<GeoPoint | null> {
  try {
    const address = (opts.address || "").trim();
    if (!address) return null;

    const hasCoords =
      opts.currentLat != null &&
      opts.currentLng != null &&
      Number.isFinite(Number(opts.currentLat)) &&
      Number.isFinite(Number(opts.currentLng));

    // Already geocoded and the caller didn't ask to refresh: nothing to do.
    if (hasCoords && !opts.force) {
      return { lat: Number(opts.currentLat), lng: Number(opts.currentLng) };
    }

    const point = await geocodeAddressServer(address, { country: opts.country });
    if (!point) return null;

    const { error } = await opts.sb
      .from(opts.table)
      .update({ venue_lat: point.lat, venue_lng: point.lng })
      .eq("id", opts.id);
    if (error) {
      console.warn(
        `[ensureVenueCoords] ${opts.table} ${opts.id} coord update failed (non-fatal):`,
        error.message,
      );
      // We still return the point - the geocode itself succeeded, and a
      // caller that also writes the row can persist it.
      return point;
    }
    return point;
  } catch (e: any) {
    console.warn("[ensureVenueCoords] crashed (non-fatal):", e?.message || e);
    return null;
  }
}
