import { AUTOMATED_EMAIL_TEMPLATES } from "@/lib/email/automatedEmailTemplates";
import { AUTOMATED_EMAIL_DESCRIPTIONS } from "@/lib/email/automatedEmailDescriptions";

describe("automatic email descriptions (Email settings 'What is this?' chip)", () => {
  it("has a description for every automatic email listed in Email settings", () => {
    const missing = AUTOMATED_EMAIL_TEMPLATES
      .map((t) => t.key)
      .filter((key) => !AUTOMATED_EMAIL_DESCRIPTIONS[key]);
    expect(missing).toEqual([]);
  });

  it("fills in who, when and if-off for every description", () => {
    for (const [key, info] of Object.entries(AUTOMATED_EMAIL_DESCRIPTIONS)) {
      expect([key, info.who.trim().length > 0]).toEqual([key, true]);
      expect([key, info.when.trim().length > 0]).toEqual([key, true]);
      expect([key, info.ifOff.trim().length > 0]).toEqual([key, true]);
    }
  });

  it("only describes emails that are on the Email settings list", () => {
    const listed = new Set(AUTOMATED_EMAIL_TEMPLATES.map((t) => t.key));
    const extra = Object.keys(AUTOMATED_EMAIL_DESCRIPTIONS).filter((key) => !listed.has(key));
    expect(extra).toEqual([]);
  });

  it("says the always-sent emails can't be turned off", () => {
    for (const t of AUTOMATED_EMAIL_TEMPLATES.filter((t) => !t.controllable)) {
      expect(AUTOMATED_EMAIL_DESCRIPTIONS[t.key].ifOff).toMatch(/^Can't be turned off/);
    }
  });
});
