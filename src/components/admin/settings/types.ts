/**
 * Shared types for the /admin/settings tab sub-components.
 * Extracted in the P2-13 split (see
 * docs/audits/p2-13-admin-settings-split-plan.md).
 *
 * The page owns one big `settings` object typed as AdminSettings
 * (the aggregate below); each tab gets handed its slice plus the
 * parent's `updateSetting` partial-application helper.
 *
 * A.15 #4 (2026-05-18): the parent used to declare `settings`
 * with an inline literal and the tabs cast each slice via
 * `as NotificationSettings`. That cast was the loophole - if a
 * tab interface gained a field the parent forgot to add to the
 * defaults, TS wouldn't catch it. With the parent now typed
 * against AdminSettings, every interface change forces a default
 * update at compile time.
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

export interface AutomationSettings {
  autoFollowUpDays: number;
  secondFollowUpDays: number;
  reminderDays: number[];
  autoDiscountPercent: number;
  reviewRequestDays: number;
  complaintResponseHours: number;
}

export interface PricingSettings {
  weekendPremium: number;
  lastMinuteSurcharge: number;
  earlyBirdDiscount: number;
  bulkDiscountThreshold: number;
  bulkDiscountPercent: number;
  minimumOrderValue: number;
}

export interface OperationsSettings {
  equipmentCleaningHours: number;
  kitchenPrepHours: number;
  deliveryBufferMinutes: number;
  maxConcurrentEvents: number;
  maxGuestsPerEvent: number;
  maxKitchenLoadPerDay: number;
  driverRadius: number;
  deliveryCostPerKm: number;
}

export interface CompanySettings {
  name: string;
  email: string;
  phone: string;
  address: string;
  logo: string;
  kitchenAddress: string;
  kitchenLat: number;
  kitchenLng: number;
}

export interface FinancialSettings {
  currency: string;
  taxRate: number;
  depositPercent: number;
  balanceDueDays: number;
  finalOrderChangeDays: number;
  cancellationFeePercent: number;
  refundProcessDays: number;
}

/**
 * The aggregate state owned by /admin/settings. Each tab reads
 * its own slice; the parent's `setSettings` writes whole-object
 * replacements. Listed in tab order for readability.
 */
export interface AdminSettings {
  company: CompanySettings;
  notifications: NotificationSettings;
  automation: AutomationSettings;
  pricing: PricingSettings;
  operations: OperationsSettings;
  financial: FinancialSettings;
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

export type UpdateAutomationSetting = (
  key: keyof AutomationSettings,
  value: number | number[],
) => void;

export type UpdatePricingSetting = (
  key: keyof PricingSettings,
  value: number,
) => void;

export type UpdateOperationsSetting = (
  key: keyof OperationsSettings,
  value: number,
) => void;

export type UpdateCompanySetting = (
  key: keyof CompanySettings,
  value: string | number,
) => void;

export type UpdateFinancialSetting = (
  key: keyof FinancialSettings,
  value: string | number,
) => void;
