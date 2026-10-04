/** @jest-environment node */
import claimHandler from "@/pages/api/payments/claim-eft";
import verifyHandler from "@/pages/api/payments/verify-claim";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: jest.fn() }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (handler: unknown) => handler }));
const invoiceId = "00000000-0000-0000-0000-000000000001";
const token = "00000000-0000-0000-0000-000000000002";
const user = { id: "user-1" };
const originalCronSecret = process.env.CRON_SECRET;
afterEach(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});
function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res); return res;
}
function query(data: unknown) {
  const chain = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn().mockResolvedValue({ data, error: null }) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); return chain;
}
beforeEach(() => { jest.clearAllMocks(); (createPagesServerClient as jest.Mock).mockReturnValue({ auth: {
  getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
} }); });

test("cron accepts only the configured private bearer secret", async () => {
  process.env.CRON_SECRET = "offline-test-secret";
  expect(await requireCronAuth({ headers: { authorization: "Bearer offline-test-secret" } } as never,response() as never))
    .toEqual({ ok: true, source: "cron" });
  expect(createPagesServerClient).not.toHaveBeenCalled();
});
test("missing cron secret never authorizes a guessed bearer", async () => {
  delete process.env.CRON_SECRET; const res = response();
  expect(await requireCronAuth({ headers: { authorization: "Bearer guessed" } } as never,res as never)).toEqual({ ok: false });
  expect(res.status).toHaveBeenCalledWith(401);
});
test("forged active role cannot authorize payment recovery; actual super admin can", async () => {
  delete process.env.CRON_SECRET;
  const profile = query({ role: "client", active_role: "super_admin" });
  (createPagesServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user } }) },
    from: jest.fn().mockReturnValue(profile) });
  const req = { headers: {} } as never;
  expect(await requireCronAuth(req,response() as never)).toEqual({ ok: false });
  profile.maybeSingle.mockResolvedValue({ data: { role: "super_admin" }, error: null });
  expect(await requireCronAuth(req,response() as never)).toEqual({ ok: true, source: "super_admin" });
});
test("whitespace EFT token cannot authorize an anonymous claim", async () => {
  const res = response(); await claimHandler({ method: "POST", body: { invoice_id: invoiceId, public_token: "   ", claimed_amount: 100 } } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(401); expect(getServiceSupabase).not.toHaveBeenCalled();
});
test("non UUID token and non finite/subcent claims are rejected before service writes", async () => {
  for (const body of [{ public_token: "junk", claimed_amount: 100 }, { public_token: token, claimed_amount: Infinity },
    { public_token: token, claimed_amount: 0.001 }]) {
    const res = response(); await claimHandler({ method: "POST", body: { invoice_id: invoiceId, ...body } } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(400);
  }
  expect(getServiceSupabase).not.toHaveBeenCalled();
});
test("valid invoice token is checked against the invoice even when payer is signed into another account", async () => {
  (createPagesServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user } }) } });
  const chain = query({ id: invoiceId, company_id: "company-1", client_id: "client-1", status: "sent" });
  const admin = { from: jest.fn().mockReturnValue(chain), rpc: jest.fn().mockResolvedValue({ data: { payment_id: "claim-1", deduped: true } }) };
  (getServiceSupabase as jest.Mock).mockReturnValue(admin);
  const res = response(); await claimHandler({ method: "POST", body: { invoice_id: invoiceId, public_token: ` ${token} `, claimed_amount: 100 } } as never, res as never);
  expect(chain.eq).toHaveBeenCalledWith("public_token",token);
  expect(admin.from).toHaveBeenCalledTimes(1); expect(res.status).toHaveBeenCalledWith(200);
});
test("a forged/nonmatching public token cannot save a claim", async () => {
  const admin = { from: jest.fn().mockReturnValue(query(null)), rpc: jest.fn() };
  (getServiceSupabase as jest.Mock).mockReturnValue(admin);
  const res = response(); await claimHandler({ method: "POST", body: { invoice_id: invoiceId, public_token: token, claimed_amount: 100 } } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(404); expect(admin.rpc).not.toHaveBeenCalled();
});
test("company owner can verify own EFT; another company's owner cannot", async () => {
  (createPagesServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user } }) } });
  const admin = { from: jest.fn().mockReturnValueOnce(query({ role: "owner", company_id: "company-1" }))
    .mockReturnValueOnce(query({ company_id: "company-1" })),
    rpc: jest.fn().mockResolvedValue({ data: { action: "confirmed", duplicate: true } }) };
  (getServiceSupabase as jest.Mock).mockReturnValue(admin);
  const res = response(); await verifyHandler({ method: "POST", body: { payment_id: invoiceId, action: "confirm" } } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(200); expect(admin.rpc).toHaveBeenCalledWith("verify_eft_payment_claim", expect.objectContaining({ p_company_id: "company-1" }));
  admin.from.mockReturnValueOnce(query({ role: "owner", company_id: "company-2" })).mockReturnValueOnce(query({ company_id: "company-1" }));
  admin.rpc.mockClear(); const denied = response();
  await verifyHandler({ method: "POST", body: { payment_id: invoiceId, action: "confirm" } } as never, denied as never);
  expect(denied.status).toHaveBeenCalledWith(403); expect(admin.rpc).not.toHaveBeenCalled();
});
test("database failure never acknowledges EFT verification as success", async () => {
  (createPagesServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user } }) } });
  (getServiceSupabase as jest.Mock).mockReturnValue({ from: jest.fn().mockReturnValueOnce(query({ role: "owner", company_id: "company-1" }))
    .mockReturnValueOnce(query({ company_id: "company-1" })), rpc: jest.fn().mockResolvedValue({ error: { code: "08006" } }) });
  const res = response(); await verifyHandler({ method: "POST", body: { payment_id: invoiceId, action: "confirm" } } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(503);
});
