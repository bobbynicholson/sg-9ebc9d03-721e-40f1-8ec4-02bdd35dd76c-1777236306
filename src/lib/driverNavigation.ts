/**
 * Shared driver navigation helper.
 *
 * Builds a Google Maps directions URL with origin + destination so the
 * driver lands inside Google Maps with a real route already drawn from
 * the kitchen to the venue. Falls back gracefully when one or the other
 * is missing.
 *
 * Origin preference: lat/lng > address > device GPS (Google's default).
 * Destination preference: lat/lng > address.
 */

export interface NavOrigin {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}

export interface NavDestination {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}

function formatPoint(p: { lat?: number | null; lng?: number | null; address?: string | null }): string | null {
  if (p.lat != null && p.lng != null && !isNaN(Number(p.lat)) && !isNaN(Number(p.lng))) {
    return `${p.lat},${p.lng}`;
  }
  if (p.address && p.address.trim().length > 0) {
    return p.address.trim();
  }
  return null;
}

export function buildNavigationUrl(destination: NavDestination, origin?: NavOrigin): string {
  const dest = formatPoint(destination);
  const orig = origin ? formatPoint(origin) : null;
  const params = new URLSearchParams({ api: "1", travelmode: "driving" });
  if (dest) params.set("destination", dest);
  if (orig) params.set("origin", orig);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function openNavigation(destination: NavDestination, origin?: NavOrigin): void {
  if (typeof window === "undefined") return;
  const url = buildNavigationUrl(destination, origin);
  window.open(url, "_blank", "noopener,noreferrer");
}
