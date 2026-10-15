import { getRelevantNavigation } from "@/lib/chatbot/navigation";
import { getRelevantWorkflows } from "@/lib/chatbot/workflows";

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
});
