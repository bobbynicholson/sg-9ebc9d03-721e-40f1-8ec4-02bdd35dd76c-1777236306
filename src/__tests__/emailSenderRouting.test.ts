/** @jest-environment node */
import { emailService, type EmailSettings } from "@/services/emailService";
jest.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

describe("application sender routing", () => {
  const config = {
    enabled: true, provider: "resend", from_name: "Wilma's team", from_email: "office@example.com",
    resend_sending_domain: "example.com", resend_domain_status: "verified",
  } as EmailSettings;
  it("uses a verified matching custom domain", () => {
    expect(emailService.resolveFromAddress(config)).toEqual({ from: "Wilma's team <office@example.com>" });
  });
  it.each([
    { resend_domain_status: "pending" },
    { resend_domain_status: "failed" },
    { resend_sending_domain: null },
    { from_email: "office@other.com" },
    { force_platform_sender: true },
  ])("uses shared mail when custom mail is unsuitable: %j", (overrides) => {
    const selected = emailService.resolveFromAddress({ ...config, ...overrides });
    expect(selected.from).toBe("Wilma's team <noreply@send.cateringms.com>");
    expect(selected.replyTo).toBe(overrides.from_email || config.from_email);
  });
  it("preserves configured SMTP delivery", () => {
    expect(emailService.resolveFromAddress({ ...config, provider: "smtp" }).from).toBe("Wilma's team <office@example.com>");
  });
  describe("actual delivery selection", () => {
    const key = process.env.RESEND_API_KEY;
    beforeEach(() => { process.env.RESEND_API_KEY = "test-key"; });
    afterEach(() => {
      jest.restoreAllMocks();
      if (key === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = key;
    });
    function client() {
      const q: any = { then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve) };
      for (const method of ["select", "eq", "limit"]) q[method] = () => q;
      q.maybeSingle = async () => ({ data: { company_name: "Team" }, error: null });
      return { from: () => q };
    }
    it.each([
      [false, "Wilma's team <office@example.com>"],
      [true, "Wilma's team <noreply@send.cateringms.com>"],
    ])("honors the platform override (%s) during delivery", async (forcePlatform, expectedFrom) => {
      jest.spyOn(emailService, "getEmailConfig").mockResolvedValue({ ...config, force_platform_sender: forcePlatform as boolean });
      jest.spyOn(emailService, "logEmailSent").mockResolvedValue(null);
      const transport = jest.spyOn(emailService, "sendViaResend").mockResolvedValue({ ok: true });
      const result = await emailService.sendEmailDetailed({ companyId: "company", to: "person@example.net", subject: "Hello", body: "<html>Hello</html>", bypassQuarantine: true, skipUnsubscribeFooter: true, _client: client() });
      expect(result.success).toBe(true);
      expect(transport).toHaveBeenCalledWith(expect.objectContaining({ from: expectedFrom }));
    });
    it("reports a missing local key without attempting delivery", async () => {
      delete process.env.RESEND_API_KEY;
      jest.spyOn(emailService, "getEmailConfig").mockResolvedValue(config);
      const log = jest.spyOn(emailService, "logEmailSent").mockResolvedValue(null);
      const transport = jest.spyOn(emailService, "sendViaResend");
      const result = await emailService.sendEmailDetailed({ companyId: "company", to: "person@example.net", subject: "Hello", body: "<html>Hello</html>", bypassQuarantine: true, skipUnsubscribeFooter: true, _client: client() });
      expect(result).toMatchObject({ success: false, error_code: "resend_auth" });
      expect(transport).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith("company", "custom", "person@example.net", "N/A", "Hello", undefined, undefined, expect.anything(), "failed", "RESEND_API_KEY missing on the server");
    });
    it.each([null, { ...config, from_email: "office@other.com" }])("delivers ordinary mail through shared when config is %j", async (settings) => {
      jest.spyOn(emailService, "getEmailConfig").mockResolvedValue(settings);
      jest.spyOn(emailService, "logEmailSent").mockResolvedValue(null);
      const transport = jest.spyOn(emailService, "sendViaResend").mockResolvedValue({ ok: true });
      const result = await emailService.sendEmailDetailed({ companyId: "company", to: "person@example.net", subject: "Hello", body: "<html>Hello</html>", bypassQuarantine: true, skipUnsubscribeFooter: true, _client: client() });
      expect(result.success).toBe(true);
      expect(transport).toHaveBeenCalledWith(expect.objectContaining({ from: expect.stringContaining("<noreply@send.cateringms.com>") }));
    });
    it("reports provider rejection instead of claiming success", async () => {
      jest.spyOn(emailService, "getEmailConfig").mockResolvedValue(config);
      jest.spyOn(emailService, "logEmailSent").mockResolvedValue(null);
      jest.spyOn(emailService, "sendViaResend").mockResolvedValue({ ok: false, status: 401, body: {}, message: "Invalid key" });
      const result = await emailService.sendEmailDetailed({ companyId: "company", to: "person@example.net", subject: "Hello", body: "<html>Hello</html>", bypassQuarantine: true, skipUnsubscribeFooter: true, _client: client() });
      expect(result).toMatchObject({ success: false, error_code: "resend_auth" });
    });
  });
});
