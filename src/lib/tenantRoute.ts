/**
 * Returns the tenant slug from a browser pathname such as
 * /spit-braai-delivery/admin/dashboard.
 *
 * Global platform paths (/admin/platform/*) intentionally return an empty
 * string. This helper has no React or auth dependencies so it can be shared
 * by the auth context, navigation, and branding layers without a module
 * cycle.
 */
const TENANT_ENTRY_POINTS = new Set([
  "admin",
  "team-portal",
  "client-portal",
  "account",
  "subscription",
  "order",
]);

const GLOBAL_ROOTS = new Set([
  "admin",
  "auth",
  "api",
  "_next",
  "super-admin",
  "blog",
  "uk",
  "us",
  "eu",
  "page",
  "pay",
  "c",
  "contact",
  "pricing",
  "features",
  "terms",
  "privacy",
  "security",
  "support",
  "demo",
  "company-signup",
]);

export function getTenantSlugFromPathname(pathname: string | null | undefined): string {
  const cleanPath = String(pathname || "").split(/[?#]/)[0];
  const parts = cleanPath.split("/").filter(Boolean);
  if (parts.length < 2) return "";

  const [first, second] = parts;
  if (!first || GLOBAL_ROOTS.has(first)) return "";
  return TENANT_ENTRY_POINTS.has(second) ? first : "";
}
