import { getTenantSlugFromPathname } from "@/lib/tenantRoute";
import { isCompanySlug } from "./metadata";

const PRODUCT_PREFIXES = ["/admin", "/team-portal", "/client-portal", "/account", "/super-admin", "/order"];
export function normalizeProductPath(value: string): string {
  const path = (value || "").split(/[?#]/)[0];
  const slug = getTenantSlugFromPathname(path);
  return slug ? path.slice(slug.length + 1) : path;
}
export function isProductPath(value: string): boolean {
  const path = normalizeProductPath(value);
  return PRODUCT_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}
export function pwaRouteInfo(value: string) {
  const path = (value || "").split(/[?#]/)[0];
  const login = path.match(/^\/([^/]+)\/(?:login|client\/login|auth\/callback)\/?$/);
  const tenantSlug = getTenantSlugFromPathname(path) || (login && isCompanySlug(login[1]) ? login[1] : "");
  const installPage = path === "/auth/install";
  return {
    enabled: isProductPath(path) || Boolean(login) || ["/auth/login", "/auth/select-role", "/auth/install"].includes(path),
    showPrompt: isProductPath(path),
    tenantSlug,
    installPage,
  };
}
