jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
jest.mock("@/lib/cronAuth", () => ({ requireCronAuth: jest.fn(async () => ({ ok: true, source: "test" })) }));
jest.mock("@/lib/cronHeartbeat", () => ({ recordCronHeartbeat: jest.fn() }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (handler: any) => handler }));
jest.mock("@/services/invoiceDueDateService", () => ({ reconcileCompanyInvoiceDueDates: jest.fn(), reconcileOpenInvoiceDueDates: jest.fn() }));
jest.mock("@/lib/email/automatedDelivery", () => ({ deliverAutomatedEmail: jest.fn() }));

import balanceReminder from "@/pages/api/cron/balance-reminder";
import overdueSweep from "@/pages/api/cron/update-overdue-invoices";
import { getServiceSupabase } from "@/lib/supabase/service";
import { reconcileCompanyInvoiceDueDates, reconcileOpenInvoiceDueDates } from "@/services/invoiceDueDateService";
import { deliverAutomatedEmail } from "@/lib/email/automatedDelivery";

function response() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
}

function database(events: string[]) {
  return {
    rpc: jest.fn(),
    from: jest.fn((table: string) => {
      events.push(table);
      let columns: string;
      const builder: any = {
        select: (value: string) => { columns = value; return builder; },
        eq: () => builder, in: () => builder, gt: () => builder, is: () => builder, neq: () => builder, limit: () => builder,
        then: (resolve: any) => Promise.resolve(resolve({ data: table === "companies"
          ? columns === "id" ? [{ id: "company-1" }] : [{ id: "company-1", balance_due_days: 2, dispatch_settings: { paymentDue: { direction: "before_event" }, paymentReminders: { mode: "before_due", days: 3 } } }]
          : [], error: null })),
      };
      return builder;
    }),
  };
}

beforeEach(() => jest.clearAllMocks());

it("does not send a balance reminder when current due dates cannot be reconciled", async () => {
  const events: string[] = [];
  const db = database(events);
  (getServiceSupabase as jest.Mock).mockReturnValue(db);
  (reconcileCompanyInvoiceDueDates as jest.Mock).mockRejectedValueOnce(new Error("Date refresh failed"));
  const res = response();
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  await balanceReminder({} as any, res);
  log.mockRestore();
  expect(res.status).toHaveBeenCalledWith(500);
  expect(events).not.toContain("invoices");
  expect(deliverAutomatedEmail).not.toHaveBeenCalled();
});

it("reconciles dates before loading invoices to remind", async () => {
  const events: string[] = [];
  (getServiceSupabase as jest.Mock).mockReturnValue(database(events));
  (reconcileCompanyInvoiceDueDates as jest.Mock).mockImplementationOnce(async () => { events.push("date-refresh"); return {}; });
  const res = response();
  await balanceReminder({} as any, res);
  expect(events.indexOf("date-refresh")).toBeLessThan(events.indexOf("invoices"));
  expect(res.status).toHaveBeenCalledWith(200);
  expect(deliverAutomatedEmail).not.toHaveBeenCalled();
});

it("does not sweep statuses or send an overdue digest if the date repair fails", async () => {
  const db = database([]);
  (getServiceSupabase as jest.Mock).mockReturnValue(db);
  (reconcileOpenInvoiceDueDates as jest.Mock).mockRejectedValueOnce(new Error("Date refresh failed"));
  const res = response();
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  await overdueSweep({} as any, res);
  log.mockRestore();
  expect(res.status).toHaveBeenCalledWith(500);
  expect(db.rpc).not.toHaveBeenCalled();
  expect(deliverAutomatedEmail).not.toHaveBeenCalled();
});
