import { isCompanySlug } from "@/lib/pwa/metadata";
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

  // Notification rows can contain URLs written by integrations. Only allow
  // normal web URLs through; never pass a javascript: or other active scheme.
  if (/^https?:\/\//i.test(roleAdjusted)) {
    try {
      const url = new URL(roleAdjusted);
      return url.protocol === "https:" || url.hostname === "localhost"
        ? url.href
        : fallback;
    } catch {
      return fallback;
    }
  }

  if (!roleAdjusted.startsWith("/")) return fallback;
  if (!companySlug || !isCompanySlug(companySlug)) return roleAdjusted;
  if (roleAdjusted === `/${companySlug}` || roleAdjusted.startsWith(`/${companySlug}/`)) {
    return roleAdjusted;
  }
  if (roleAdjusted === "/admin/platform" || roleAdjusted.startsWith("/admin/platform/")) {
    return roleAdjusted;
  }

  const tenantPaths = ["/admin", "/team-portal", "/client-portal", "/order", "/account", "/subscription"];
  if (tenantPaths.some(path => roleAdjusted === path || roleAdjusted.startsWith(`${path}/`) || roleAdjusted.startsWith(`${path}?`))) {
    return `/${companySlug}${roleAdjusted}`;
  }
  return roleAdjusted;
}
