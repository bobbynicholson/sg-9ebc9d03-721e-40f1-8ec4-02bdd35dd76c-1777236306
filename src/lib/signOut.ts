import { createClient } from "@/lib/supabase/client";

/**
 * Pull the active company slug from whatever surface is available right now,
 * BEFORE we clear the session. Order:
 *   1. Profile passed in by caller (most reliable)
 *   2. URL slug — first path segment if it's not one of our top-level routes
 *   3. sb-* cookie metadata (we don't bother — supabase doesn't expose slug)
 * Returns "" if no slug can be determined (super_admin, /auth/login, etc).
 */
export function detectCompanySlug(profile: any | null | undefined): string {
  if (typeof window === "undefined") return "";

  const fromProfile = (profile as any)?.company_slug;
  if (fromProfile && typeof fromProfile === "string") return fromProfile;

  const path = window.location.pathname || "";
  const first = path.split("/").filter(Boolean)[0] || "";
  // Top-level routes that aren't tenant slugs
  const reserved = new Set([
    "admin", "auth", "team-portal", "client-portal", "client",
    "super-admin", "blog", "uk", "us", "page", "pay", "api",
    "company-signup", "subscription", "account", "demo", "contact",
    "pricing", "features", "support", "privacy", "security", "terms",
  ]);
  if (first && !reserved.has(first)) return first;
  return "";
}

/**
 * Centralised sign-out: clear the supabase session, nuke local cookies +
 * storage, then bounce the user to either their tenant-scoped login page
 * (so they can re-enter via the same branded URL they came from) or the
 * universal login if no slug is available.
 */
export async function signOutAndRedirect(profile?: any | null) {
  const slug = detectCompanySlug(profile);
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Sign out error", err);
  }
  try {
    document.cookie.split(";").forEach((c) => {
      const n = c.split("=")[0].trim();
      document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
    localStorage.clear();
    sessionStorage.clear();
  } catch {}
  const target = slug ? `/${slug}/login` : "/auth/login";
  window.location.assign(target);
}
