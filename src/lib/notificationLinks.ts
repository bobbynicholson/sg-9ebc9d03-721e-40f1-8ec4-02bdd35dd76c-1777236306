import { isCompanySlug } from "@/lib/pwa/metadata";
import { canAccessRoute } from "@/lib/authGuards";
import { normalizeRoleValue } from "@/lib/roleDerivation";
import { UserRole } from "@/types/app";
import { shoppingNotificationLink } from "@/lib/shoppingNotificationLink";

type NotificationTarget = {
  link?: string | null;
  action_url?: string | null;
};

export function notificationInboxPathForRole(role?: string | null): string {
  const normalized = String(role || "").trim().toLowerCase();

  if (
    normalized === "owner" ||
    normalized.endsWith("_admin") ||
    normalized === "admin"
  ) return "/admin/notifications";
  if (normalized === "driver") return "/team-portal/driver/notifications";
  if (normalized === "waiter") return "/team-portal/waiter/notifications";
  if (normalized === "kitchen_staff" || normalized === "kitchen_manager") {
    return "/team-portal/kitchen/notifications";
  }
  if (normalized === "shopping_staff") return "/team-portal/shopping/notifications";
  if (normalized === "cleaning_staff" || normalized === "cleaning_manager") {
    return "/team-portal/cleaning/notifications";
  }
  return "/client-portal/notifications";
}

/** Resolve a stored notification link, with a role-specific inbox fallback. */
export function notificationDestination(
  notification: NotificationTarget,
  role?: string | null,
  companySlug?: string | null,
): string {
  const fallback = notificationInboxPathForRole(role);
  const source = notification.link || notification.action_url || fallback;
  const roleAdjusted = shoppingNotificationLink(source, role);
  const tenantQualify = (path: string) => {
    if (!companySlug || !isCompanySlug(companySlug)) return path;
    if (path === `/${companySlug}` || path.startsWith(`/${companySlug}/`)) return path;

    const tenantPaths = ["/admin", "/team-portal", "/client-portal", "/order", "/account", "/subscription"];
    if (tenantPaths.some(item => path === item || path.startsWith(`${item}/`) || path.startsWith(`${item}?`))) {
      return `/${companySlug}${path}`;
    }
    return path;
  };

  // Notification rows can contain URLs written by integrations. Only allow
  // normal web URLs through; never pass a javascript: or other active scheme.
  if (/^https?:\/\//i.test(roleAdjusted)) {
    try {
      const url = new URL(roleAdjusted);
      return url.protocol === "https:" || url.hostname === "localhost"
        ? url.href
        : tenantQualify(fallback);
    } catch {
      return tenantQualify(fallback);
    }
  }

  if (!roleAdjusted.startsWith("/") || roleAdjusted.startsWith("//")) return tenantQualify(fallback);

  const pathOnly = roleAdjusted.split(/[?#]/, 1)[0] || "/";
  const tenantPrefix = companySlug && isCompanySlug(companySlug) ? `/${companySlug}` : "";
  const appPath = tenantPrefix && (pathOnly === tenantPrefix || pathOnly.startsWith(`${tenantPrefix}/`))
    ? pathOnly.slice(tenantPrefix.length) || "/"
    : pathOnly;
  const effectiveRole = normalizeRoleValue(role);
  const isPlatformRoute = appPath === "/admin/platform" || appPath.startsWith("/admin/platform/");
  const isPayrollRoute = [
    "/admin/wages",
    "/admin/staff-hours",
    "/admin/kitchen-settlement",
    "/admin/driver-settlement",
  ].some(path => appPath === path || appPath.startsWith(`${path}/`));
  const roleCanOpenRoute = !!effectiveRole
    && !(isPlatformRoute && effectiveRole !== UserRole.SUPER_ADMIN)
    && !(isPayrollRoute && effectiveRole === UserRole.SUPER_ADMIN)
    && canAccessRoute(effectiveRole, appPath);

  if (!roleCanOpenRoute) {
    return tenantQualify(fallback);
  }
  return tenantQualify(roleAdjusted);
}
