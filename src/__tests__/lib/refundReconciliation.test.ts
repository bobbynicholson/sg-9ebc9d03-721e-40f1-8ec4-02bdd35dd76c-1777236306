/** @jest-environment node */
import handler from "@/pages/api/refunds/[id]/reconcile";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: jest.fn() }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (h: unknown) => h }));
const id = "00000000-0000-0000-0000-000000000001";
const request = { method: "POST", query: { id }, body: {
  outcome: "paid", provider_verified: true, provider_reference: "refund-confirmation", evidence: "Checked merchant dashboard and confirmed completed refund.",
} };
function setup(role = "owner", company = "company-1", profileError: unknown = null) {
  const chain = (data: unknown, error: unknown = null) => {
    const q = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn().mockResolvedValue({ data, error }) };
    q.select.mockReturnValue(q); q.eq.mockReturnValue(q); return q;
  };
  (createPagesServerClient as jest.Mock).mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "owner-1" } } }) },
    from: jest.fn().mockReturnValue(chain({ role, active_role: "owner", company_id: "company-1" }, profileError)),
  });
  const admin = { from: jest.fn().mockReturnValue(chain({ company_id: company, payment_type: "refund" })),
    rpc: jest.fn().mockResolvedValue({ data: { payment_id: id, payment_status: "completed", duplicate: false }, error: null }) };
  (getServiceSupabase as jest.Mock).mockReturnValue(admin);
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() }; res.status.mockReturnValue(res);
  return { admin, res };
}
beforeEach(() => jest.clearAllMocks());
test("records authenticated owner's verified evidence without issuing a new payout", async () => {
  const { admin, res } = setup(); await handler(request as never, res as never);
  expect(admin.rpc).toHaveBeenCalledWith("reconcile_company_refund", expect.objectContaining({ p_payment_id: id,
    p_company_id: "company-1", p_actor_user_id: "owner-1", p_outcome: "paid", p_provider_reference: "refund-confirmation" }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, payment_status: "completed" }));
});
test.each(["client", "driver", "sales_admin"])("%s cannot borrow the selected owner role", async (role) => {
  const { admin, res } = setup(role); await handler(request as never, res as never);
  expect(res.status).toHaveBeenCalledWith(403); expect(admin.rpc).not.toHaveBeenCalled();
});
test("profile database error fails closed", async () => {
  const { admin, res } = setup("owner", "company-1", { message: "Unavailable" }); await handler(request as never, res as never);
  expect(res.status).toHaveBeenCalledWith(503); expect(admin.from).not.toHaveBeenCalled();
});
test("cross-company evidence cannot change a refund", async () => {
  const { admin, res } = setup("owner", "company-2"); await handler(request as never, res as never);
  expect(res.status).toHaveBeenCalledWith(403); expect(admin.rpc).not.toHaveBeenCalled();
});
test.each([{ provider_verified: false }, { outcome: "pending" }, { evidence: "" }, { provider_reference: "" },
  { evidence: "a".repeat(2001) }, { paid_at: "invalid" }, { paid_at: "2999-01-01" }])("rejects incomplete or invalid provider evidence %p", async (body) => {
  const { admin, res } = setup(); await handler({ ...request, body: { ...request.body, ...body } } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(400); expect(admin.rpc).not.toHaveBeenCalled();
});
test.each([["42501",403], ["22023",400], ["55000",409], ["XX000",503]])("database rejection %s maps to %i without claiming completion", async (code, status) => {
  const { admin, res } = setup(); admin.rpc.mockResolvedValue({ data: null, error: { code, message: "Cannot reconcile" } });
  await handler(request as never, res as never); expect(res.status).toHaveBeenCalledWith(status);
  expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
});
test("a lost response can return the original reconciliation without another payout", async () => {
  const { admin, res } = setup(); admin.rpc.mockResolvedValue({ data: { duplicate: true, payment_status: "completed" }, error: null });
  await handler(request as never, res as never); expect(res.json).toHaveBeenCalledWith({ ok: true, duplicate: true, payment_status: "completed" });
});
