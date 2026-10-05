import type { GetServerSidePropsContext } from "next";
import { getTenantSlugFromPathname } from "@/lib/tenantRoute";

/** Preserve the company URL when a legacy admin route redirects. */
export function tenantRedirectPrefix(ctx: GetServerSidePropsContext): string {
  const fromPath = getTenantSlugFromPathname(ctx.resolvedUrl) || getTenantSlugFromPathname(ctx.req.url);
  const querySlug = Array.isArray(ctx.query.company_slug) ? ctx.query.company_slug[0] : ctx.query.company_slug;
  const slug = fromPath || querySlug || "";
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug) ? `/${slug}` : "";
}
