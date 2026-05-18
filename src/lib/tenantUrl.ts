/**
 * Tenant URL helpers.
 *
 * Bobby's rule: every page a tenant user touches must have their slug
 * in the URL. Spit Braai's owner sees /spit-braai-delivery/admin/...,
 * their kitchen staff sees /spit-braai-delivery/team-portal/kitchen,
 * their customers see /spit-braai-delivery/client-portal/...
 *
 * Use `useTenantHref()` inside any React component that renders Link
 * hrefs. It returns a `withSlug` wrapper that prefixes any tenant path
 * with the resolved slug for the current user.
 *
 * Slug resolution order (most authoritative first):
 *   1. router.query.company_slug - set by the next.config rewrite
 *      whenever the user is on a /[slug]/... URL.
 *   2. user.user_metadata.last_company_slug - written by the magic-link
 *      callback on every sign-in, and by the password sign-in flow on
 *      success.
 *   3. profile.companies.slug - the slug joined off the profiles row.
 *   4. company.slug from auth context.
 *
 * If none resolve we return the bare path - the rewrite still maps
 * /admin/... etc. to the right page, the page just doesn't get a tenant
 * prefix in its URL bar. This is the correct fallback for super-admin
 * users who navigate across tenants.
 */
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";

// The set of top-level path segments that ARE tenant-scoped pages.
// Every href starting with one of these gets the slug prefix.
const TENANT_SCOPED_PREFIXES = [
  "/admin",
  "/team-portal",
  "/client-portal",
  "/account",
  "/subscription",
] as const;

// Top-level path segments that are NEVER tenant-scoped, even if a
// component accidentally tries to slug-prefix them. These stay bare.
const GLOBAL_PREFIXES = [
  "/admin/platform", // super-admin only
  "/auth",
  "/api",
  "/_next",
  "/super-admin",
  "/blog",
  "/uk",
  "/us",
  "/page",
  "/pay",
  "/c",
  "/contact",
  "/pricing",
  "/features",
  "/terms",
  "/privacy",
  "/security",
  "/support",
  "/demo",
  "/company-signup",
] as const;

/**
 * Resolves the slug to use for the currently authenticated user.
 * Returns "" when no slug can be determined.
 */
export function useResolvedTenantSlug(): string {
  const router = useRouter();
  const { profile, user, company } = useAuth() as any;

  const fromQuery =
    typeof router.query.company_slug === "string" && router.query.company_slug
      ? router.query.company_slug
      : "";
  if (fromQuery) return fromQuery;

  const fromMetadata = (user as any)?.user_metadata?.last_company_slug;
  if (typeof fromMetadata === "string" && fromMetadata) return fromMetadata;

  const profileCompanies = profile?.companies;
  const fromProfile = Array.isArray(profileCompanies)
    ? profileCompanies?.[0]?.slug
    : profileCompanies?.slug;
  if (typeof fromProfile === "string" && fromProfile) return fromProfile;

  const fromCompanyContext = company?.slug;
  if (typeof fromCompanyContext === "string" && fromCompanyContext)
    return fromCompanyContext;

  return "";
}

/**
 * Returns a `withSlug` helper bound to the current user's slug.
 *
 * - withSlug("/admin/dashboard") => "/spit-braai-delivery/admin/dashboard"
 * - withSlug("/auth/login")      => "/auth/login"  (global, never prefixed)
 * - withSlug("https://...")      => "https://..."  (absolute URLs untouched)
 * - withSlug("/spit-braai-delivery/admin/dashboard") => unchanged (idempotent)
 *
 * Safe to call even when no slug is resolved - returns the bare path.
 */
export function useTenantHref() {
  const slug = useResolvedTenantSlug();

  const withSlug = (href: string): string => {
    if (!href) return href;
    // Absolute URLs and protocol-relative URLs pass through.
    if (/^[a-z]+:|^\/\//i.test(href)) return href;
    // Anchors and query-only links pass through.
    if (href.startsWith("#") || href.startsWith("?")) return href;
    if (!slug) return href;
    // Already slug-prefixed - idempotent.
    if (href.startsWith(`/${slug}/`) || href === `/${slug}`) return href;
    // Global path - never prefixed.
    for (const p of GLOBAL_PREFIXES) {
      if (href === p || href.startsWith(p + "/") || href.startsWith(p + "?")) {
        return href;
      }
    }
    // Tenant-scoped path - prefix it.
    for (const p of TENANT_SCOPED_PREFIXES) {
      if (href === p || href.startsWith(p + "/") || href.startsWith(p + "?")) {
        return `/${slug}${href}`;
      }
    }
    // Anything else (relative paths, custom routes) passes through.
    return href;
  };

  return { slug, withSlug };
}

/**
 * Non-hook version for utility code that runs outside React (e.g. inside
 * a service or signOut handler). Caller passes the slug they already
 * know about.
 */
export function buildTenantHref(slug: string | null | undefined, href: string): string {
  if (!href) return href;
  if (/^[a-z]+:|^\/\//i.test(href)) return href;
  if (href.startsWith("#") || href.startsWith("?")) return href;
  if (!slug) return href;
  if (href.startsWith(`/${slug}/`) || href === `/${slug}`) return href;
  for (const p of GLOBAL_PREFIXES) {
    if (href === p || href.startsWith(p + "/") || href.startsWith(p + "?")) {
      return href;
    }
  }
  for (const p of TENANT_SCOPED_PREFIXES) {
    if (href === p || href.startsWith(p + "/") || href.startsWith(p + "?")) {
      return `/${slug}${href}`;
    }
  }
  return href;
}
