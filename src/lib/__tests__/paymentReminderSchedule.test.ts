import * as lib from "@/lib/paymentReminderSchedule";
import {
  hasPaymentDueSetting,
  isPaymentReminderDue,
  paymentDueDate,
  paymentReminderTargetDate,
  readPaymentDueSettings,
  readPaymentReminderSettings,
} from "@/lib/paymentReminderSchedule";

describe("readPaymentReminderSettings", () => {
  it("is off when the company never set it", () => {
    expect(readPaymentReminderSettings(null).mode).toBe("off");
    expect(readPaymentReminderSettings({}).mode).toBe("off");
    expect(readPaymentReminderSettings({ paymentTermsText: "x" }).mode).toBe("off");
  });

  it("reads a saved setting, including from a JSON string", () => {
    expect(readPaymentReminderSettings({ paymentReminders: { mode: "before_due", days: 5 } }))
      .toEqual({ mode: "before_due", days: 5 });
    expect(readPaymentReminderSettings(JSON.stringify({ paymentReminders: { mode: "before_due", days: "2" } })))
      .toEqual({ mode: "before_due", days: 2 });
  });

  it("treats an unknown mode as off and keeps 0 days", () => {
    expect(readPaymentReminderSettings({ paymentReminders: { mode: "daily", days: 0 } }))
      .toEqual({ mode: "off", days: 0 });
  });
});

describe("readPaymentDueSettings", () => {
  it("defaults to before the event using balance_due_days", () => {
    expect(readPaymentDueSettings(null, 7)).toEqual({ direction: "before_event", days: 7 });
    expect(hasPaymentDueSetting(null)).toBe(false);
  });

  it("reads after the event and keeps 0 days", () => {
    const dispatch = { paymentDue: { direction: "after_event" } };
    expect(readPaymentDueSettings(dispatch, 30)).toEqual({ direction: "after_event", days: 30 });
    expect(readPaymentDueSettings({}, 0)).toEqual({ direction: "before_event", days: 0 });
    expect(hasPaymentDueSetting(dispatch)).toBe(true);
  });
});

describe("payment due and reminder dates", () => {
  const remindOn = (days: number) => ({ mode: "before_due" as const, days });

  it("pays before: due on the event day, reminder 5 days before", () => {
    const due = { direction: "before_event" as const, days: 0 };
    expect(paymentDueDate("2026-11-20", due)).toBe("2026-11-20");
    expect(paymentReminderTargetDate(remindOn(5), due, "2026-11-20")).toBe("2026-11-15");
  });

  it("pays after: due 30 days after the event, reminder 2 days before (day 28)", () => {
    const due = { direction: "after_event" as const, days: 30 };
    expect(paymentDueDate("2026-11-20", due)).toBe("2026-12-20");
    expect(paymentReminderTargetDate(remindOn(2), due, "2026-11-20")).toBe("2026-12-18");
  });

  it("no reminder when off or without an event date", () => {
    const due = { direction: "before_event" as const, days: 7 };
    expect(paymentReminderTargetDate({ mode: "off", days: 5 }, due, "2026-11-20")).toBeNull();
    expect(paymentReminderTargetDate(remindOn(5), due, null)).toBeNull();
  });
});

describe("isPaymentReminderDue", () => {
  it("sends on the day and up to two days after, never before or long after", () => {
    expect(isPaymentReminderDue("2026-11-15", "2026-11-14")).toBe(false);
    expect(isPaymentReminderDue("2026-11-15", "2026-11-15")).toBe(true);
    expect(isPaymentReminderDue("2026-11-15", "2026-11-17")).toBe(true);
    expect(isPaymentReminderDue("2026-11-15", "2026-11-18")).toBe(false);
    expect(isPaymentReminderDue(null, "2026-11-15")).toBe(false);
  });
});

describe("client override (Contacts) beats company setting", () => {
  const company = {
    due: { direction: "before_event" as const, days: 0 },
    reminders: { mode: "before_due" as const, days: 5 },
  };

  it("uses the company setting when the client has none", () => {
    expect(lib.resolvePaymentSchedule(company, {})).toEqual(company);
    expect(lib.resolvePaymentSchedule(company, null)).toEqual(company);
  });

  it("client pays 30 days after the event, reminder 2 days before", () => {
    const client = lib.readClientPaymentSchedule({
      due_direction: "after_event", due_days: 30, reminder_mode: "before_due", reminder_days: 2,
    });
    const r = lib.resolvePaymentSchedule(company, client);
    expect(r).toEqual({
      due: { direction: "after_event", days: 30 },
      reminders: { mode: "before_due", days: 2 },
    });
    expect(lib.paymentReminderTargetDate(r.reminders, r.due, "2026-11-20")).toBe("2026-12-18");
  });

  it("client can switch reminders off while the company has them on", () => {
    const r = lib.resolvePaymentSchedule(company, lib.readClientPaymentSchedule({ reminder_mode: "off" }));
    expect(r.reminders.mode).toBe("off");
    expect(r.due).toEqual(company.due);
  });

  it("client can turn reminders on while the company has them off", () => {
    const off = { ...company, reminders: { mode: "off" as const, days: 5 } };
    const r = lib.resolvePaymentSchedule(off, lib.readClientPaymentSchedule({ reminder_mode: "before_due", reminder_days: 3 }));
    expect(r.reminders).toEqual({ mode: "before_due", days: 3 });
  });

  it("stores only what the client overrides", () => {
    expect(lib.toClientPaymentScheduleJson({})).toBeNull();
    expect(lib.toClientPaymentScheduleJson({ reminderMode: "off", reminderDays: 4 })).toEqual({ reminder_mode: "off" });
    expect(lib.toClientPaymentScheduleJson({ dueDirection: "after_event", dueDays: 30 }))
      .toEqual({ due_direction: "after_event", due_days: 30 });
  });
});
