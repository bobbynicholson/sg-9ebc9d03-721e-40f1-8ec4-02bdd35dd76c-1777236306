/** @jest-environment node */
import { getEmailProviderStatus } from "@/lib/email/providerStatus";

describe("email setup describes the actual sender", () => {
  const row = { provider: "resend", from_email: "hello@example.com", resend_sending_domain: "example.com", resend_domain_status: "verified", force_platform_sender: false };
  function client(data: unknown) {
    const q: any = {};
    for (const name of ["select", "eq", "neq", "order", "limit"]) q[name] = jest.fn(() => q);
    q.maybeSingle = async () => ({ data, error: null });
    return { sb: { from: jest.fn(() => q) } as any, q };
  }
  it("chooses the same single transactional provider as the transport", async () => {
    const { sb, q } = client(row);
    expect((await getEmailProviderStatus(sb, "company-1")).state).toBe("verified");
    expect(q.eq).toHaveBeenCalledWith("company_id", "company-1");
    expect(q.neq).toHaveBeenCalledWith("provider", "mailchimp");
    expect(q.order).toHaveBeenCalledWith("is_verified", { ascending: false });
    expect(q.limit).toHaveBeenCalledWith(1);
  });
  it.each([
    { force_platform_sender: true }, { resend_domain_status: "pending" },
    { from_email: "hello@different.com" }, { resend_sending_domain: null },
  ])("shows the shared sender when %j", async (override) => {
    expect((await getEmailProviderStatus(client({ ...row, ...override }).sb, "company")).state).toBe("platform_default");
  });
  it("permits the shared fallback for a company without a provider row", async () => {
    expect(await getEmailProviderStatus(client(null).sb, "company")).toMatchObject({ configured: true, state: "platform_default" });
  });
});
