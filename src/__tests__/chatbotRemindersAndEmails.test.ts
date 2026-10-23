import { getRelevantNavigation, NAVIGATION_REFS } from "@/lib/chatbot/navigation";
import { getRelevantWorkflows } from "@/lib/chatbot/workflows";
import { AUTOMATED_EMAIL_TEMPLATES } from "@/lib/email/automatedEmailTemplates";
import { AUTOMATED_EMAIL_SECTIONS, automatedEmailControlId, automatedEmailNavigationRef } from "@/lib/email/automatedEmailSections";

describe("chatbot: payment reminders and automatic emails", () => {
  const refs = (query: string, role = "company_admin") => getRelevantNavigation(query, role, 5).map((r) => r.ref);

  it.each([
    ["how do I stop payment reminders", "admin.settings.payment-reminders"],
    ["turn off payment reminders", "admin.settings.payment-reminders"],
    ["clients pay after the event on 30 day terms", "admin.settings.payment-due"],
    ["turn off automatic emails", "admin.email-settings.automatic-emails"],
    ["too many emails going to clients", "admin.email-settings.automatic-emails"],
    ["onboarding reminders setup", "admin.onboarding.reminders"],
    ["where do I roster kitchen tablet staff", "admin.kitchen-schedule"],
  ])("sends '%s' to %s", (query, expected) => {
    expect(refs(query)).toContain(expected);
  });

  it("links straight to the right section, which opens itself", () => {
    const [reminders] = getRelevantNavigation("turn off payment reminders", "company_admin", 5).filter((r) => r.ref === "admin.settings.payment-reminders");
    expect(reminders.href).toBe("/admin/settings#payment-reminders");
    const [emails] = getRelevantNavigation("turn off automatic emails", "company_admin", 5).filter((r) => r.ref === "admin.email-settings.automatic-emails");
    expect(emails.href).toBe("/admin/email-settings#automatic-emails");
  });

  it("walks an admin through setting up payment reminders, including the per-client rule", () => {
    const [workflow] = getRelevantWorkflows("how do I set up payment reminders", "company_admin");
    expect(workflow.id).toBe("payment-reminders");
    expect(workflow.steps.map((s) => s.href)).toEqual([
      "/admin/settings#payment-due",
      "/admin/settings#payment-reminders",
      "/admin/contacts",
    ]);
  });

  it("walks an admin through turning automatic emails on or off", () => {
    const [workflow] = getRelevantWorkflows("I want to turn off automatic emails", "company_admin");
    expect(workflow.id).toBe("automatic-emails");
    expect(workflow.steps.map((s) => s.href)).toEqual([
      "/admin/email-settings#automatic-emails",
      "/admin/email-settings#each-automatic-email",
    ]);
  });

  it("does not offer these admin settings to kitchen staff or clients", () => {
    expect(refs("turn off payment reminders", "kitchen_staff")).not.toContain("admin.settings.payment-reminders");
    expect(refs("turn off automatic emails", "client")).not.toContain("admin.email-settings.automatic-emails");
    expect(getRelevantWorkflows("turn off payment reminders", "client")).toEqual([]);
  });

  it.each([
    ["stop balance payment reminder emails", "balance_reminder_email"],
    ["turn off deposit reminder emails", "deposit_reminder"],
    ["I don't want clients receiving delivery emails", "order_in_transit"],
    ["turn off order confirmation emails", "order_confirmed"],
    ["clients are not getting payment receipt emails", "balance_payment_received"],
    ["where do I change quote follow up 2", "email_lead_quiet"],
    ["stop sending review request emails", "review_request"],
    ["turn off event tomorrow kitchen email", "event_tomorrow_kitchen_email"],
    ["turn off quote change emails", "quote_price_updated"],
    ["stop quote price update emails", "quote_price_updated"],
  ])("opens the specific control for '%s'", (query, key) => {
    const [first] = getRelevantNavigation(query, "company_admin", 3);
    expect(first?.ref).toBe(automatedEmailNavigationRef(key));
    expect(first?.href).toBe(`/admin/email-settings#${automatedEmailControlId(key)}`);
  });

  it("keeps every automatic email in exactly one category with a direct chatbot link", () => {
    const grouped = AUTOMATED_EMAIL_SECTIONS.flatMap((section) => section.templates);
    expect(grouped).toHaveLength(AUTOMATED_EMAIL_TEMPLATES.length);
    expect(new Set(grouped.map((template) => template.key)).size).toBe(grouped.length);
    for (const template of AUTOMATED_EMAIL_TEMPLATES) {
      const target = NAVIGATION_REFS.find((item) => item.ref === automatedEmailNavigationRef(template.key));
      expect(target?.href).toBe(`/admin/email-settings#${automatedEmailControlId(template.key)}`);
      if (!template.controllable) expect(target?.description).toContain("always sent");
    }
    const payments = AUTOMATED_EMAIL_SECTIONS.find((section) => section.id === "payments")!;
    for (const key of ["refund_paid", "equipment_damage_charge", "invoices_overdue_admin_digest"]) {
      expect(payments.templates.some((template) => template.key === key)).toBe(true);
    }
  });

  it.each(["client", "driver", "kitchen_staff", "sales_admin", "region_admin"])("does not expose email control links to %s", (role) => {
    expect(getRelevantNavigation("stop balance payment reminder emails", role, 10)
      .some((item) => item.ref.startsWith("admin.email-settings.template."))).toBe(false);
  });
});
