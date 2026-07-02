/**
 * Shared types for /account/settings and its tab sub-components.
 * Extracted in the P2-13 audit split; reworked in the account-settings
 * persistence rebuild (localStorage-only saves replaced with real DB
 * persistence).
 */

/**
 * Per-event email notification toggles. Mirrors the boolean columns on
 * the `email_notification_preferences` table (one row per user, unique
 * on user_id). These are the REAL switches: DB triggers such as
 * send_order_status_email() and the driver-assignment mailer consult
 * these columns before queueing an email.
 */
export interface EmailNotificationPrefs {
  order_confirmed: boolean;
  order_status_changed: boolean;
  order_ready_for_pickup: boolean;
  order_delivered: boolean;
  order_cancelled: boolean;
  payment_received: boolean;
  payment_due: boolean;
  invoice_sent: boolean;
  driver_assigned: boolean;
  task_assigned: boolean;
  low_stock_alert: boolean;
  out_of_stock_alert: boolean;
  daily_summary: boolean;
  weekly_report: boolean;
}

/**
 * Column defaults from migration 20260425222716: everything on except
 * the two digest emails. Used when the user has no row yet and as the
 * per-column fallback for NULLs on legacy rows.
 */
export const EMAIL_PREF_DEFAULTS: EmailNotificationPrefs = {
  order_confirmed: true,
  order_status_changed: true,
  order_ready_for_pickup: true,
  order_delivered: true,
  order_cancelled: true,
  payment_received: true,
  payment_due: true,
  invoice_sent: true,
  driver_assigned: true,
  task_assigned: true,
  low_stock_alert: true,
  out_of_stock_alert: true,
  daily_summary: false,
  weekly_report: false,
};

/**
 * Privacy settings. Persisted cross-device on
 * profiles.notification_preferences (jsonb) under the namespaced
 * `account_privacy` key so they coexist with any other keys stored in
 * that JSON.
 */
export interface PrivacySettings {
  profile_visibility: "public" | "private" | "team";
  show_email: boolean;
  show_phone: boolean;
  allow_analytics: boolean;
}

export const PRIVACY_DEFAULTS: PrivacySettings = {
  profile_visibility: "team",
  show_email: false,
  show_phone: false,
  allow_analytics: true,
};

/** Namespace key inside profiles.notification_preferences jsonb. */
export const ACCOUNT_PRIVACY_JSON_KEY = "account_privacy";

export interface ProfileFormData {
  full_name: string;
  email: string;
  phone_number: string;
  company_name: string;
  avatar_url: string;
}

export interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
