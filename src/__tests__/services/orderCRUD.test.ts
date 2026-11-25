jest.mock("@/integrations/supabase/client", () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from "@/integrations/supabase/client";
import { getOrdersPage } from "@/services/order/orderCRUD";

function createQuery(rows: unknown[]) {
  const query: any = {};
  for (const method of ["select", "eq", "is", "neq", "in", "or", "gte", "lte", "order", "limit"]) {
    query[method] = jest.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  return query;
}

test("All statuses includes cancelled orders", async () => {
  const rows = [
    { id: "confirmed-order", status: "confirmed", created_at: "2026-11-24T10:00:00Z" },
    { id: "cancelled-order", status: "cancelled", created_at: "2026-11-24T09:00:00Z" },
  ];
  const query = createQuery(rows);
  (supabase.from as jest.Mock).mockReturnValue(query);

  const result = await getOrdersPage("company-1", { status: "all" });

  expect(query.neq).not.toHaveBeenCalledWith("status", "cancelled");
  expect(result.orders.map((order: any) => order.status)).toEqual(["confirmed", "cancelled"]);
});
