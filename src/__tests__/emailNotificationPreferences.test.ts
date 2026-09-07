import {
  EMAIL_NOTIFICATION_PREFERENCE_KEYS,
  resolveEmailNotificationPreference,
} from "@/lib/emailNotificationPreferences";

describe("email notification preference mapping", () => {
  it("covers every account-settings email preference key", () => {
    expect(EMAIL_NOTIFICATION_PREFERENCE_KEYS).toHaveLength(14);
    expect(new Set(EMAIL_NOTIFICATION_PREFERENCE_KEYS).size).toBe(14);
  });

  it("maps operational templates to the saved user preference", () => {
    expect(resolveEmailNotificationPreference("order_confirmed")).toBe("order_confirmed");
    expect(resolveEmailNotificationPreference("order_in_transit")).toBe("order_status_changed");
    expect(resolveEmailNotificationPreference("order_ready")).toBe("order_ready_for_pickup");
    expect(resolveEmailNotificationPreference("balance_reminder_email")).toBe("payment_due");
    expect(resolveEmailNotificationPreference("deposit_invoice_issued")).toBe("invoice_sent");
    expect(resolveEmailNotificationPreference("driver_assigned")).toBe("driver_assigned");
    expect(resolveEmailNotificationPreference("cleaning_task_assigned")).toBe("task_assigned");
    expect(resolveEmailNotificationPreference("daily_operations_task")).toBe("task_assigned");
    expect(resolveEmailNotificationPreference("collection_complete")).toBe("order_status_changed");
  });

  it("leaves manual and system mail ungated unless explicitly requested", () => {
    expect(resolveEmailNotificationPreference("custom")).toBeNull();
    expect(resolveEmailNotificationPreference("password_reset")).toBeNull();
    expect(resolveEmailNotificationPreference(undefined)).toBeNull();
    expect(resolveEmailNotificationPreference("custom", "weekly_report")).toBe("weekly_report");
  });
});
