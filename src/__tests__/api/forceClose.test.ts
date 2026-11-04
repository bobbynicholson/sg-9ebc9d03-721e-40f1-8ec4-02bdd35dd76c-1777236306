/** @jest-environment node */
import handler from "@/pages/api/orders/[id]/force-close";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { updateOrderStatus } from "@/services/order/orderWorkflow";

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: jest.fn() }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
jest.mock("@/services/order/orderWorkflow", () => ({ updateOrderStatus: jest.fn() }));

const orderId = "00000000-0000-0000-0000-000000000001";
const companyId = "00000000-0000-0000-0000-000000000002";
const userId = "00000000-0000-0000-0000-000000000003";

function setup() {
  const order = {
    id: orderId,
    order_number: "ORD-918945",
    company_id: companyId,
    status: "delivered",
    event_date: "2026-10-30",
    event_time: "17:30:00",
    prep_started_at: "2026-10-30T16:00:00.000Z",
    ready_at: "2026-10-30T17:00:00.000Z",
    picked_up_at: "2026-10-30T17:15:00.000Z",
    delivered_at: "2026-10-30T17:30:00.000Z",
  };
  const profile = { role: "company_admin", active_role: null, company_id: companyId };
  const sessionClient = {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: userId } } })) },
    from: jest.fn((table: string) => {
      const query: any = {
        select: jest.fn(() => query),
        eq: jest.fn(() => query),
        is: jest.fn(() => query),
        maybeSingle: jest.fn(async () => ({ data: table === "profiles" ? profile : order, error: null })),
      };
      return query;
    }),
  };
  const adminClient = {
    from: jest.fn((table: string) => {
      if (table === "kitchen_prep_tasks") {
        return {
          update: jest.fn(() => ({
            eq: jest.fn(() => ({ in: jest.fn(async () => ({ count: 0, error: null })) })),
          })),
        };
      }
      if (table === "audit_logs") return { insert: jest.fn(async () => ({ error: null })) };
      throw new Error(`Unexpected service-client table: ${table}`);
    }),
  };

  (createPagesServerClient as jest.Mock).mockReturnValue(sessionClient);
  (getServiceSupabase as jest.Mock).mockReturnValue(adminClient);
  (updateOrderStatus as jest.Mock).mockResolvedValue({ success: true, data: order });

  const req: any = { method: "POST", query: { id: orderId }, body: {} };
  const res: any = {
    status: jest.fn(function (this: any, code: number) { this.code = code; return this; }),
    json: jest.fn(function (this: any, body: unknown) { this.body = body; return this; }),
  };
  return { req, res, adminClient };
}

beforeEach(() => jest.clearAllMocks());

test("force-close passes its authorized service client into every order status transition", async () => {
  const { req, res, adminClient } = setup();

  await handler(req, res);

  expect(updateOrderStatus).toHaveBeenCalledWith(orderId, "completed", userId, adminClient);
  expect(res.code).toBe(200);
  expect(res.body.ok).toBe(true);
});
