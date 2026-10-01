/** @jest-environment node */
import * as React from "react";
import { sendBrandedEmail } from "@/server/emails/sendBrandedEmail";
import { emailService } from "@/services/emailService";
jest.mock("@react-email/render", () => ({ render: async () => "<html>Invite</html>" }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: () => ({ service: true }) }));
jest.mock("@/services/emailService", () => ({ emailService: { sendEmailDetailed: jest.fn() } }));

describe("branded mail uses central sender routing", () => {
  const args = { component: React.createElement("div"), to: "person@example.com", subject: "Invite", companyId: "company", templateType: "staff_invite_kitchen" };
  it("delegates tenant templates with shared fallback and service credentials", async () => {
    (emailService.sendEmailDetailed as jest.Mock).mockResolvedValue({ success: true });
    expect((await sendBrandedEmail(args)).ok).toBe(true);
    expect(emailService.sendEmailDetailed).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company", allowPlatformFallback: true, _client: { service: true } }));
  });
  it("propagates delivery failures", async () => {
    (emailService.sendEmailDetailed as jest.Mock).mockResolvedValue({ success: false, error: "Provider rejected" });
    expect(await sendBrandedEmail(args)).toMatchObject({ ok: false, error: "Provider rejected" });
  });
  it("never treats missing platform credentials as a sent email", async () => {
    const key = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try { expect((await sendBrandedEmail({ ...args, companyId: undefined })).ok).toBe(false); }
    finally { if (key !== undefined) process.env.RESEND_API_KEY = key; }
  });
});
