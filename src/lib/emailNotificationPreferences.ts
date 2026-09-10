/**
 * Per-user email notification controls shared by the account settings UI and
 * the server-side email transport. Keep this list aligned with the boolean
 * columns on email_notification_preferences.
 */
export const EMAIL_NOTIFICATION_PREFERENCE_KEYS = [
  "order_confirmed",
  "order_status_changed",
  "order_ready_for_pickup",
  "order_delivered",
  "order_cancelled",
  "payment_received",
  "payment_due",
  "invoice_sent",
  "driver_assigned",
  "task_assigned",
  "low_stock_alert",
  "out_of_stock_alert",
  "daily_summary",
  "weekly_report",
] as const;

export type EmailNotificationPreferenceKey =
  (typeof EMAIL_NOTIFICATION_PREFERENCE_KEYS)[number];

/**
 * Template names used by current and legacy senders. A missing mapping is
 * intentional: password resets, invitations, manual emails, and provider
 * tests must not be blocked by an operational preference.
 */
const TEMPLATE_PREFERENCE_MAP: Record<string, EmailNotificationPreferenceKey> = {
  order_confirmed: "order_confirmed",
  order_status_confirmed: "order_confirmed",
  order_preparing: "order_status_changed",
  order_status_preparing: "order_status_changed",
  order_in_transit: "order_status_changed",
  order_status_in_transit: "order_status_changed",
  out_for_delivery: "order_status_changed",
  order_ready: "order_ready_for_pickup",
  order_status_ready: "order_ready_for_pickup",
  order_delivered: "order_delivered",
  order_status_delivered: "order_delivered",
  order_cancelled: "order_cancelled",
  order_status_cancelled: "order_cancelled",
  payment_received: "payment_received",
  deposit_payment_received: "payment_received",
  balance_payment_received: "payment_received",
  balance_reminder_email: "payment_due",
  deposit_reminder: "payment_due",
  payment_reminder: "payment_due",
  deposit_invoice_issued: "invoice_sent",
  balance_invoice_issued: "invoice_sent",
  invoice_sent: "invoice_sent",
  driver_assigned: "driver_assigned",
  collection_en_route: "order_status_changed",
  collection_arrived: "order_status_changed",
  collection_complete: "order_status_changed",
  task_assigned: "task_assigned",
  cleaning_task_assigned: "task_assigned",
  kitchen_task_assigned: "task_assigned",
  shift_task_assigned: "task_assigned",
  daily_operations_task: "task_assigned",
  low_stock_alert: "low_stock_alert",
  stock_low: "low_stock_alert",
  stale_shopping_list_alert: "low_stock_alert",
  out_of_stock_alert: "out_of_stock_alert",
  stock_out: "out_of_stock_alert",
  daily_summary: "daily_summary",
  weekly_report: "weekly_report",
};

export function resolveEmailNotificationPreference(
  template?: string | null,
  explicit?: EmailNotificationPreferenceKey | null,
): EmailNotificationPreferenceKey | null {
  if (explicit && EMAIL_NOTIFICATION_PREFERENCE_KEYS.includes(explicit)) {
    return explicit;
  }
  const normalized = String(template || "").trim().toLowerCase();
  return TEMPLATE_PREFERENCE_MAP[normalized] || null;
}
