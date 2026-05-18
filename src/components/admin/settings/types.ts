/**
 * Shared types for the /admin/settings tab sub-components.
 * Extracted in the P2-13 split (see
 * docs/audits/p2-13-admin-settings-split-plan.md).
 *
 * The page owns one big `settings` object; each tab gets handed
 * its slice of that object plus the parent's `updateSetting`
 * partial-application helper.
 */

export interface NotificationSettings {
  emailNewLead: boolean;
  emailQuoteAccepted: boolean;
  emailPaymentReceived: boolean;
  smsDriverAssigned: boolean;
  smsDeliveryUpdate: boolean;
  emailComplaint: boolean;
  emailDailyReport: boolean;
}

/**
 * Per-key updater partial-applied for one settings category. The
 * parent's full `updateSetting(category, key, value)` is too wide
 * for a tab to need; binding the category at the call-site keeps
 * the sub-component free of the parent's internal shape.
 */
export type UpdateNotificationSetting = (
  key: keyof NotificationSettings,
  value: boolean,
) => void;
