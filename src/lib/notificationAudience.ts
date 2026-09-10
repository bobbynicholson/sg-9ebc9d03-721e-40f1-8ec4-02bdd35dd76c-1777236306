import type { EmailNotificationPreferenceKey } from "@/lib/emailNotificationPreferences";

/**
 * Operational notification types that have a real email preference column.
 * Keep this mapping separate from transport code so assignment routing can be
 * tested without importing Supabase or the email provider.
 */
export function emailPreferenceForOperationalNotification(
  type: string,
  title: string,
  message: string,
): EmailNotificationPreferenceKey | null {
  const text = `${title} ${message}`.toLowerCase();
  if (type === "driver_assigned") return "driver_assigned";
  if ([
    "task_assigned",
    "shift_task_assigned",
    "chef_assigned",
    "kitchen_task_assigned",
    "cleaning_task_assigned",
    "daily_operations_task",
  ].includes(type)) {
    return "task_assigned";
  }
  if (type === "stock_low") {
    return /out\s+of\s+stock|newstock\s*[:=]?\s*0/.test(text)
      ? "out_of_stock_alert"
      : "low_stock_alert";
  }
  return null;
}

type NotificationProfile = {
  role?: string | null;
  active_role?: string | null;
};

/**
 * active_role is the user's current operational context. The legacy base
 * role is only a fallback for profiles that have no active role yet. This
 * prevents a cross-trained waiter stored as kitchen_staff from receiving a
 * kitchen-only broadcast while still allowing waiter-targeted broadcasts to
 * reach that user.
 */
export function profileMatchesTargetRoles(
  profile: NotificationProfile,
  targetRoles?: readonly string[],
): boolean {
  if (!targetRoles || targetRoles.length === 0) return true;
  const effectiveRole = String(profile.active_role || profile.role || "");
  return targetRoles.some((role) => String(role) === effectiveRole);
}

export function profileHasRole(
  profile: NotificationProfile,
  role: string,
): boolean {
  const target = String(role);
  return String(profile.active_role || profile.role || "") === target;
}
