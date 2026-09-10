/**
 * TIGHTEN I.103 regression test: atomic claim before PayFast refund.
 *
 * The race window: two concurrent processRefund() calls for the same
 * refund_payment_id both read payment_status='pending', both pass the
 * idempotency check, both hit PayFast - the merchant is charged twice.
 *
 * The fix: a conditional UPDATE
 *   UPDATE payments SET payment_status='processing'
 *   WHERE id=? AND payment_status='pending'
 *   RETURNING id
 * runs BEFORE the PayFast call. Whoever flips the row first wins; the
 * loser sees 0 rows back and bails with already_completed.
 */

import { processRefund } from "@/services/refundService";

// ── Mocks ─────────────────────────────────────────────────────────

const mockPfRefund = jest.fn();
jest.mock("@/lib/payfastService", () => ({
  PayFastService: jest.fn().mockImplementation(() => ({
    refundTransaction: mockPfRefund,
  })),
}));

const mockAdminFrom = jest.fn();
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({ from: mockAdminFrom }),
}));

const REFUND_ID = "refund-uuid-1";

// Default rows the table-router serves.
const DEFAULTS = {
  refundRow: {
    id: REFUND_ID,
    company_id: "co-1",
    order_id: "ord-1",
    amount: 100,
    payment_type: "refund",
    payment_status: "pending" as string,
    gateway: null,
    gateway_provider: null,
    cancellation_request_id: null,
    reason: "Test refund",
  },
  parentPayment: {
    id: "parent-payment-1",
    amount: 100,
    gateway: "payfast",
    gateway_provider: "payfast",
    gateway_transaction_id: "pf-tx-1",
    payment_method: "payfast",
    payment_type: "capture",
    payment_status: "completed",
    processed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  gateway: { id: "pgw-1", is_test: true, is_active: true },
  creds: {
    credentials: {
      merchantId: "mid",
      merchantKey: "mkey",
      passphrase: "ppk",
    },
  },
};

/**
 * Build a chainable thenable that resolves to `result`. Each chain
 * method returns the same proxy so .eq().eq().select() all flow
 * through cleanly.
 */
function buildQuery(result: any) {
  const proxy: any = {};
  const chain = [
    "select", "update", "insert", "upsert", "eq", "neq", "in", "is",
    "gt", "lt", "gte", "lte", "order", "limit",
  ];
  for (const k of chain) proxy[k] = jest.fn().mockReturnValue(proxy);
  // Terminal awaitables - some refundService paths call .single() /
  // .maybeSingle() before awaiting; both must resolve to the result.
  proxy.single = jest.fn().mockResolvedValue(result);
  proxy.maybeSingle = jest.fn().mockResolvedValue(result);
  // Plain `await query` path uses .then().
  proxy.then = (resolve: any, reject?: any) =>
    Promise.resolve(result).then(resolve, reject);
  return proxy;
}

interface RouteOptions {
  /** Override the refund row (eg. payment_status='completed' to test
   *  the line-209 idempotency short-circuit). */
  refundRow?: typeof DEFAULTS.refundRow;
  /** What the atomic-claim UPDATE returns. data=[{id}] means winner;
   *  data=[] means loser; error set means a DB failure. */
  claimResult: { data: any[] | null; error: any };
}

/**
 * Route .from(table) calls through a table-name dispatcher. The
 * atomic-claim UPDATE is the second `.from("payments")` call after the
 * select-refund + select-parents reads, so we count payments calls.
 */
function routeQueries(opts: RouteOptions) {
  let paymentsCallCount = 0;
  mockAdminFrom.mockImplementation((table: string) => {
    switch (table) {
      case "payments":
        paymentsCallCount += 1;
        if (paymentsCallCount === 1) {
          // First call: select refund row.
          return buildQuery({ data: opts.refundRow ?? DEFAULTS.refundRow, error: null });
        }
        if (paymentsCallCount === 2) {
          // Second call: select parent payments.
          return buildQuery({ data: [DEFAULTS.parentPayment], error: null });
        }
        if (paymentsCallCount === 3) {
          // Third call: atomic claim UPDATE. This is the path we're
          // pinning behaviour on.
          return buildQuery(opts.claimResult);
        }
        // Subsequent calls: success-flip / revert UPDATEs.
        return buildQuery({ data: null, error: null });
      case "payment_gateways":
        return buildQuery({ data: DEFAULTS.gateway, error: null });
      case "payment_gateway_credentials":
        return buildQuery({ data: DEFAULTS.creds, error: null });
      case "audit_logs":
        return buildQuery({ data: null, error: null });
      default:
        return buildQuery({ data: null, error: null });
    }
  });
}

describe("processRefund atomic claim (TIGHTEN I.103)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPfRefund.mockReset();
  });

  it("succeeds when the claim flips pending -> processing (winner)", async () => {
    routeQueries({ claimResult: { data: [{ id: REFUND_ID }], error: null } });
    mockPfRefund.mockResolvedValue({ ok: true, status: 200, body: { ok: true } });

    const result = await processRefund(REFUND_ID, "actor-1");

    expect(result.status).toBe("auto_processed");
    expect(mockPfRefund).toHaveBeenCalledTimes(1);
  });

  it("returns already_completed when the claim returns zero rows (loser)", async () => {
    routeQueries({ claimResult: { data: [], error: null } });

    const result = await processRefund(REFUND_ID, "actor-1");

    expect(result.status).toBe("already_completed");
    expect(result.refund_payment_id).toBe(REFUND_ID);
    // The crucial assertion: PayFast was NOT called when we lost the
    // claim. This is the bit that prevents the double-charge.
    expect(mockPfRefund).not.toHaveBeenCalled();
  });

  it("returns already_completed when the claim returns null data (loser)", async () => {
    routeQueries({ claimResult: { data: null, error: null } });

    const result = await processRefund(REFUND_ID, "actor-1");

    expect(result.status).toBe("already_completed");
    expect(mockPfRefund).not.toHaveBeenCalled();
  });

  it("returns error when the claim itself errors (DB failure)", async () => {
    routeQueries({
      claimResult: { data: null, error: { message: "DB connection lost" } },
    });

    const result = await processRefund(REFUND_ID, "actor-1");

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/claim failed: DB connection lost/);
    expect(mockPfRefund).not.toHaveBeenCalled();
  });

  it("short-circuits at the line-209 idempotency check (already completed row)", async () => {
    routeQueries({
      refundRow: { ...DEFAULTS.refundRow, payment_status: "completed" },
      claimResult: { data: [], error: null }, // never reached
    });

    const result = await processRefund(REFUND_ID, "actor-1");

    expect(result.status).toBe("already_completed");
    expect(mockPfRefund).not.toHaveBeenCalled();
  });

  it("reverts processing -> pending when PayFast HTTP fails", async () => {
    routeQueries({ claimResult: { data: [{ id: REFUND_ID }], error: null } });
    mockPfRefund.mockResolvedValue({
      ok: false,
      status: 500,
      error: "PayFast 5xx",
      body: { error: "internal" },
    });

    const result = await processRefund(REFUND_ID, "actor-1");

    expect(result.status).toBe("auto_failed");
    // The revert UPDATE happened as one of the later .from("payments")
    // calls. Smoke-check by counting how many were made: 1 refund
    // select + 1 parents select + 1 claim + 1 revert + (maybe 1
    // success no-op for the gated completion). We at minimum expect
    // >=4 payments-table accesses.
    const paymentsCalls = mockAdminFrom.mock.calls.filter(
      (call: any[]) => call[0] === "payments",
    );
    expect(paymentsCalls.length).toBeGreaterThanOrEqual(4);
  });
});
