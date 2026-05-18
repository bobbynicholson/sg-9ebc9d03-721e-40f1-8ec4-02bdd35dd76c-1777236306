/**
 * Shared types for /account/settings and its tab sub-components.
 * Extracted in the P2-13 audit split.
 */

export interface NotificationPreferences {
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
  order_updates: boolean;
  delivery_updates: boolean;
  marketing_emails: boolean;
  weekly_summary: boolean;
}

export interface PrivacySettings {
  profile_visibility: "public" | "private" | "team";
  show_email: boolean;
  show_phone: boolean;
  allow_analytics: boolean;
}

export interface ProfileFormData {
  full_name: string;
  email: string;
  phone_number: string;
  company_name: string;
  avatar_url: string;
}

export interface AccountPreferences {
  language: string;
  timezone: string;
  date_format: string;
  currency_display: string;
}

export interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
