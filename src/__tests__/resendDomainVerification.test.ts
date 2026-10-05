/** @jest-environment node */
import handler from "@/pages/api/admin/resend/verify-domain";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { listResendDomains, getResendDomain, verifyResendDomain } from "@/lib/resendDomains";
jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: jest.fn() }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (h: any) => h }));
jest.mock("@/services/emailService", () => ({ emailService: { sendEmailDetailed: jest.fn() } }));
jest.mock("@/lib/resendDomains", () => ({ listResendDomains: jest.fn(), getResendDomain: jest.fn(), verifyResendDomain: jest.fn(), isResendError: (r: any) => !!r?.error }));

describe("own-domain activation for every company", () => {
  it.each(["company-a", "company-b"])("activates the matching sender and keeps full DNS records for %s", async (companyId) => {
    let saved: any;
    const records = [{ type: "TXT", name: "resend._domainkey", value: "dns-value" }];
    const row = { id: "provider-id", resend_domain_id: "domain-id", resend_sending_domain: "example.com", resend_domain_status: "verified", resend_domain_verified_at: "2026-09-01", from_email: "hello@example.com", resend_dns_records: records };
    const chain = (data: any, write = false) => {
      const q: any = { then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) };
      for (const m of ["select", "eq"]) q[m] = () => q;
      q.single = q.maybeSingle = async () => ({ data, error: null });
      q.update = (value: unknown) => { if (write) saved = value; return q; };
      return q;
    };
    (createPagesServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: "staff-id" } } }) }, from: () => chain({ role: "company_admin", company_id: companyId }) });
    (getServiceSupabase as jest.Mock).mockReturnValue({ from: () => chain(row, true) });
    (listResendDomains as jest.Mock).mockResolvedValue([{ id: "domain-id", name: "example.com", status: "verified" }]);
    (getResendDomain as jest.Mock).mockResolvedValue({ id: "domain-id", name: "example.com", status: "verified", records });
    const res: any = { status: jest.fn(() => res), json: jest.fn() };
    await handler({ method: "POST", body: {} } as any, res);
    expect(saved).toMatchObject({ force_platform_sender: false, from_email: "hello@example.com", resend_dns_records: records, resend_domain_status: "verified" });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(verifyResendDomain).not.toHaveBeenCalled();
    // A list response without DNS details must never erase saved records.
    (getResendDomain as jest.Mock).mockResolvedValue({ error: "Temporary provider outage" });
    await handler({ method: "POST", body: {} } as any, res);
    expect(saved.resend_dns_records).toEqual(records);
  });
});
