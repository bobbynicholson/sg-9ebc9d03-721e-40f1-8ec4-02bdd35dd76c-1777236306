/** @jest-environment node */
import { SETUP_TASKS, setupTasksDoneFromSettings } from "@/lib/setupChecklist";
import { onboardingProgressService } from "@/services/onboardingProgressService";

let dispatchSettings: Record<string, unknown> | null = null;

jest.mock("@/integrations/supabase/client", () => {
  const query: any = {};
  query.select = () => query;
  query.eq = () => query;
  query.then = (resolve: any) => Promise.resolve({ count: 0, error: null }).then(resolve);
  query.maybeSingle = async () => ({
    data: {
      company_name: "Spit Braai", phone: "012", email: "a@b.c",
      onboarding_completed_at: null, onboarding_dismissed_at: null,
      dispatch_settings: dispatchSettings,
    },
    error: null,
  });
  return { supabase: { from: () => query } };
});

describe("onboarding: payment reminders + automatic emails", () => {
  it("is on the day-to-day setup checklist, linking to the onboarding step", () => {
    const task = SETUP_TASKS.find((t) => t.id === "reminders");
    expect(task).toMatchObject({ href: "/admin/onboarding?step=reminders", title: "Set payment reminders and automatic emails" });
  });

  it("is an optional onboarding step, not done until a choice is saved", async () => {
    dispatchSettings = { paymentTermsText: "x" };
    const state = await onboardingProgressService.getState("c1", "spit-braai");
    const step = state.steps.find((s) => s.id === "setup_reminders");
    expect(step).toMatchObject({ required: false, completed: false, href: "/spit-braai/admin/onboarding?step=reminders" });
    // Optional: adding it never changes how many required steps there are.
    expect(state.steps.filter((s) => s.required).map((s) => s.id)).toEqual(
      ["welcome", "company_info", "import_team", "setup_payment", "final_review"],
    );
  });

  it("is done once payment reminders or payment due are saved", async () => {
    dispatchSettings = { paymentReminders: { mode: "off", days: 5 } };
    let state = await onboardingProgressService.getState("c1", "");
    expect(state.steps.find((s) => s.id === "setup_reminders")?.completed).toBe(true);
    dispatchSettings = { paymentDue: { direction: "before_event" } };
    state = await onboardingProgressService.getState("c1", "");
    expect(state.steps.find((s) => s.id === "setup_reminders")?.completed).toBe(true);
  });
});

describe("day-to-day checklist ticks itself from real settings", () => {
  it("ticks reminders once the onboarding step reports a saved choice", () => {
    expect(setupTasksDoneFromSettings([{ id: "setup_reminders", completed: true }])).toEqual({ reminders: true });
    expect(setupTasksDoneFromSettings([{ id: "setup_reminders", completed: false }])).toEqual({});
    expect(setupTasksDoneFromSettings(undefined)).toEqual({});
  });
});
