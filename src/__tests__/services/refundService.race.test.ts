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
 * loser sees 0 rows back and requires reconciliation without another payout.
 */

import { processRefund } from "@/services/refundService";
import { getCheckoutGatewayCredentials } from "@/lib/checkoutGatewayCredentials";
jest.mock("@/lib/checkoutGatewayCredentials", () => ({ getCheckoutGatewayCredentials: jest.fn() }));
jest.mock("@/services/email/cancellationEmails", () => ({ sendRefundPaidEmail: jest.fn() }));

// ── Mocks ─────────────────────────────────────────────────────────

const mockPfRefund = jest.fn();
const mockPfQueryRefund = jest.fn();
jest.mock("@/lib/payfastService", () => ({
  PayFastService: jest.fn().mockImplementation(() => ({
    refundTransaction: mockPfRefund,
    queryRefundAvailability: mockPfQueryRefund,
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
  credentialsMissing?: boolean;
  savedAttempt?: Record<string, unknown>;
  completionResult?: { data: { id: string } | null; error: { message: string } | null };
}

/**
 * Route .from(table) calls through a table-name dispatcher. The
 * atomic-claim UPDATE is the second `.from("payments")` call after the
 * select-refund + select-parents reads, so we count payments calls.
 */
function routeQueries(opts: RouteOptions) {
  (getCheckoutGatewayCredentials as jest.Mock).mockResolvedValue(opts.credentialsMissing ? null : {
    gateway: { id: "pgw-1", company_id: "co-1", provider: "payfast", is_test: false }, credentials: DEFAULTS.creds.credentials,
  });
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
        return buildQuery(opts.completionResult ?? { data: { id: REFUND_ID }, error: null });
      case "payment_gateways":
        return buildQuery({ data: DEFAULTS.gateway, error: null });
      case "payment_gateway_credentials":
        return buildQuery({ data: opts.credentialsMissing ? null : DEFAULTS.creds, error: null });
      case "payment_gateway_events":
        return buildQuery({ data: opts.savedAttempt ? { payload: { attemptId: "attempt-1" } } : null, error: null });
      case "payment_attempts":
        return buildQuery({ data: opts.savedAttempt || null, error: null });
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
    mockPfQueryRefund.mockReset();
    mockPfQueryRefund.mockResolvedValue({ ok: true, status: 200, body: { status: "REFUNDABLE", amount_original: 10000,
      amount_available_for_refund: 10000, refund_full: { method: "PAYMENT_SOURCE" }, refund_partial: { method: "PAYMENT_SOURCE" } } });
  });

  it("succeeds when the claim flips pending -> processing (winner)", async () => {
    routeQueries({ claimResult: { data: [{ id: REFUND_ID }], error: null } });
    mockPfRefund.mockResolvedValue({ ok: true, status: 200, body: { ok: true } });

    const result = await processRefund(REFUND_ID, "actor-1");

    expect(result.status).toBe("auto_processed");
    expect(mockPfRefund).toHaveBeenCalledTimes(1);
  });

  it("reports reconciliation needed when another operation claimed the refund", async () => {
    routeQueries({ claimResult: { data: [], error: null } });

    const result = await processRefund(REFUND_ID, "actor-1");

    expect(result.status).toBe("pending_reconciliation");
    expect(result.refund_payment_id).toBe(REFUND_ID);
    // The crucial assertion: PayFast was NOT called when we lost the
    // claim. This is the bit that prevents the double-charge.
    expect(mockPfRefund).not.toHaveBeenCalled();
  });

  it("does not mistake a missing claim result for a completed refund", async () => {
    routeQueries({ claimResult: { data: null, error: null } });

    const result = await processRefund(REFUND_ID, "actor-1");

    expect(result.status).toBe("pending_reconciliation");
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

  it("retains processing when a PayFast server error leaves the payout outcome unknown", async () => {
    routeQueries({ claimResult: { data: [{ id: REFUND_ID }], error: null } });
    mockPfRefund.mockResolvedValue({
      ok: false,
      status: 500,
      error: "PayFast 5xx",
      body: { error: "internal" },
    });

    const result = await processRefund(REFUND_ID, "actor-1");

    expect(result.status).toBe("pending_reconciliation");
    const paymentsCalls = mockAdminFrom.mock.calls.filter(
      (call: any[]) => call[0] === "payments",
    );
    expect(paymentsCalls).toHaveLength(3);
  });

  it("retains processing after a lost network response instead of making a second refund retryable", async () => {
    routeQueries({ claimResult: { data: [{ id: REFUND_ID }], error: null } });
    mockPfRefund.mockResolvedValue({ ok: false, status: 0, body: null, error: "timeout" });
    expect((await processRefund(REFUND_ID)).status).toBe("pending_reconciliation");
    expect(mockAdminFrom.mock.calls.filter(([table]) => table === "payments")).toHaveLength(3);
  });

  it("a definite rejected provider request can return to pending", async () => {
    routeQueries({ claimResult: { data: [{ id: REFUND_ID }], error: null } });
    mockPfRefund.mockResolvedValue({ ok: false, status: 400, body: { error: "invalid" } });
    expect((await processRefund(REFUND_ID)).status).toBe("auto_failed");
    expect(mockAdminFrom.mock.calls.filter(([table]) => table === "payments")).toHaveLength(4);
  });

  it("missing credentials never claim a refund that has not been sent", async () => {
    routeQueries({ claimResult: { data: [{ id: REFUND_ID }], error: null }, credentialsMissing: true });
    expect((await processRefund(REFUND_ID)).status).toBe("auto_failed");
    expect(mockAdminFrom.mock.calls.filter(([table]) => table === "payments")).toHaveLength(2);
    expect(mockPfRefund).not.toHaveBeenCalled();
  });

  it("an already processing refund cannot be reissued", async () => {
    routeQueries({ refundRow: { ...DEFAULTS.refundRow, payment_status: "processing" }, claimResult: { data: [], error: null } });
    expect((await processRefund(REFUND_ID)).status).toBe("pending_reconciliation");
    expect(mockPfRefund).not.toHaveBeenCalled();
  });

  it("refund larger than one capture goes to manual reconciliation without hitting the provider", async () => {
    routeQueries({ refundRow: { ...DEFAULTS.refundRow, amount: 200 }, claimResult: { data: [], error: null } });
    expect((await processRefund(REFUND_ID)).status).toBe("pending_manual");
    expect(mockPfRefund).not.toHaveBeenCalled();
  });

  it("uses the original checkout credential resolver for a saved attempt after merchant edits", async () => {
    const attempt = { id: "attempt-1", company_id: "co-1", provider: "payfast", metadata: { gatewayVersionId: "old-version" } };
    routeQueries({ savedAttempt: attempt, claimResult: { data: [{ id: REFUND_ID }], error: null } });
    (getCheckoutGatewayCredentials as jest.Mock).mockResolvedValue({ gateway: { company_id: "co-1", provider: "payfast", is_test: true },
      credentials: { merchantId: "original-id", merchantKey: "original-key" } });
    mockPfRefund.mockResolvedValue({ ok: true, status: 200, body: {} });
    expect((await processRefund(REFUND_ID)).status).toBe("auto_processed");
    expect(getCheckoutGatewayCredentials).toHaveBeenCalledWith(expect.anything(), attempt);
  });

  it("previous partial refunds reduce the refundable amount before any new claim", async () => {
    routeQueries({ claimResult: { data: [], error: null } });
    mockPfQueryRefund.mockResolvedValue({ ok: true, body: { status: "REFUNDABLE", amount_original: 10000,
      amount_available_for_refund: 5000, refund_full: { method: "PAYMENT_SOURCE" } } });
    expect((await processRefund(REFUND_ID)).status).toBe("pending_manual");
    expect(mockPfRefund).not.toHaveBeenCalled();
    expect(mockAdminFrom.mock.calls.filter(([table]) => table === "payments")).toHaveLength(2);
  });

  it("bank payout requirements go to finance rather than guessing a recipient account", async () => {
    routeQueries({ claimResult: { data: [], error: null } });
    mockPfQueryRefund.mockResolvedValue({ ok: true, body: { status: "REFUNDABLE", amount_original: 10000,
      amount_available_for_refund: 10000, refund_full: { method: "BANK_PAYOUT" } } });
    expect((await processRefund(REFUND_ID)).status).toBe("pending_manual");
    expect(mockPfRefund).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { message: "Connection lost after payout" } },
  ])("confirmed provider payout with unconfirmed ledger completion requires reconciliation: %p", async (completionResult) => {
    routeQueries({ claimResult: { data: [{ id: REFUND_ID }], error: null }, completionResult });
    mockPfRefund.mockResolvedValue({ ok: true, status: 200, body: { status: "success" } });
    const result = await processRefund(REFUND_ID);
    expect(result.status).toBe("pending_reconciliation");
    expect(result.message).toMatch(/PayFast confirmed the refund/);
    expect(mockPfRefund).toHaveBeenCalledTimes(1);
  });
});
