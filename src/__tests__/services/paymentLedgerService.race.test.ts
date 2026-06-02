/**
 * TIGHTEN I.104 regression test: atomic claim on staff_work_sessions
 * BEFORE the staff_payment_ledger insert.
 *
 * The race window: two concurrent processStaffPayment() calls (operator
 * double-click on Pay All, or one tab + a cron) both read the same set
 * of unpaid sessions, both insert ledger rows, both flip sessions to
 * paid. The staff member gets paid twice for the same hours.
 *
 * The fix: a conditional UPDATE
 *   UPDATE staff_work_sessions SET payment_status='paid'
 *   WHERE id IN (...) AND payment_status='unpaid'
 *   RETURNING id
 * runs BEFORE recordPayment(). If claimed.length !== expected.length we
 * revert any rows we did claim and throw without writing a ledger row.
 */

import { paymentLedgerService } from "@/services/paymentLedgerService";
import { supabase } from "@/integrations/supabase/client";

jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "auth-user-1" } },
      }),
    },
  },
}));

const STAFF_ID = "staff-1";
const SESSION_IDS = ["sess-a", "sess-b", "sess-c"];

const UNPAID_SESSIONS = SESSION_IDS.map((id, i) => ({
  id,
  staff_id: STAFF_ID,
  payment_status: "unpaid",
  total_hours: 4,
  total_earnings: 200,
  hourly_rate: 50,
  clock_in_time: new Date(Date.UTC(2026, 0, 1 + i, 8, 0)).toISOString(),
}));

/**
 * Chainable supabase query proxy. Each method returns the same proxy
 * so .eq().in().select() flows. Awaiting the proxy resolves to result.
 */
function buildQuery(result: any) {
  const proxy: any = {};
  for (const k of [
    "select", "update", "insert", "upsert", "eq", "neq", "in", "is",
    "gt", "lt", "gte", "lte", "order", "limit",
  ]) {
    proxy[k] = jest.fn().mockReturnValue(proxy);
  }
  proxy.single = jest.fn().mockResolvedValue(result);
  proxy.maybeSingle = jest.fn().mockResolvedValue(result);
  proxy.then = (resolve: any, reject?: any) =>
    Promise.resolve(result).then(resolve, reject);
  return proxy;
}

interface RouteOptions {
  /** What the preflight SELECT on staff_work_sessions returns. */
  preflightSessions?: typeof UNPAID_SESSIONS;
  /** What the atomic-claim UPDATE returns. data is the rows actually
   *  flipped from unpaid→paid. data.length < claimed.length means a
   *  concurrent run beat us to some of them. */
  claimResult: { data: any[] | null; error: any };
  /** What recordPayment's INSERT into staff_payment_ledger returns.
   *  When `error` is set the test exercises the post-claim rollback. */
  ledgerInsertResult?: { data: any; error: any };
}

let revertCount: number;

function routeQueries(opts: RouteOptions) {
  revertCount = 0;
  let sessionsCallCount = 0;
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    switch (table) {
      case "staff_work_sessions":
        sessionsCallCount += 1;
        if (sessionsCallCount === 1) {
          // Preflight select.
          return buildQuery({
            data: opts.preflightSessions ?? UNPAID_SESSIONS,
            error: null,
          });
        }
        if (sessionsCallCount === 2) {
          // Atomic claim UPDATE.
          return buildQuery(opts.claimResult);
        }
        // Subsequent calls are reverts (in the loser / failure paths).
        revertCount += 1;
        return buildQuery({ data: null, error: null });
      case "staff_payment_ledger":
        return buildQuery(
          opts.ledgerInsertResult ?? {
            data: { id: "ledger-1", staff_id: STAFF_ID },
            error: null,
          },
        );
      default:
        return buildQuery({ data: null, error: null });
    }
  });
}

describe("processStaffPayment atomic claim (TIGHTEN I.104)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    revertCount = 0;
  });

  it("succeeds when the claim matches all preflight sessions (winner)", async () => {
    routeQueries({
      claimResult: {
        data: SESSION_IDS.map((id) => ({ id })),
        error: null,
      },
    });

    const result = await paymentLedgerService.processStaffPayment(
      STAFF_ID,
      SESSION_IDS,
      "cash",
      "REF-1",
      "test notes",
    );

    expect(result).toBeTruthy();
    expect((result as any).id).toBe("ledger-1");
    // No revert should have fired on the happy path.
    expect(revertCount).toBe(0);
  });

  it("throws + reverts the partial claim when a concurrent run took some sessions", async () => {
    // Preflight saw 3 unpaid sessions, but the atomic UPDATE only
    // flipped 1 (the other 2 were already paid by a concurrent run
    // between the read and the claim). The fix must revert the 1 we
    // did claim and throw - it MUST NOT insert a partial ledger row.
    routeQueries({
      claimResult: { data: [{ id: "sess-a" }], error: null },
    });

    await expect(
      paymentLedgerService.processStaffPayment(STAFF_ID, SESSION_IDS, "cash"),
    ).rejects.toThrow(/paid concurrently/);

    // The "winner_ids → revert to unpaid" path must fire when claimed
    // length is short.
    expect(revertCount).toBeGreaterThanOrEqual(1);
    // No ledger insert should have run since we threw before it.
    const ledgerCalls = (supabase.from as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0] === "staff_payment_ledger",
    );
    expect(ledgerCalls.length).toBe(0);
  });

  it("throws + reverts when claim returns zero rows (total loser)", async () => {
    routeQueries({
      claimResult: { data: [], error: null },
    });

    await expect(
      paymentLedgerService.processStaffPayment(STAFF_ID, SESSION_IDS, "cash"),
    ).rejects.toThrow(/paid concurrently/);

    // Zero claimed → no winner_ids → no revert needed. The throw is
    // the only thing that matters here.
    const ledgerCalls = (supabase.from as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0] === "staff_payment_ledger",
    );
    expect(ledgerCalls.length).toBe(0);
  });

  it("throws + reverts when recordPayment fails after claim", async () => {
    // Claim succeeds (3 of 3), but the ledger INSERT throws. The fix
    // must revert the claimed sessions back to unpaid so finance can
    // retry.
    routeQueries({
      claimResult: {
        data: SESSION_IDS.map((id) => ({ id })),
        error: null,
      },
      ledgerInsertResult: { data: null, error: new Error("constraint violation") },
    });

    let didThrow = false;
    try {
      await paymentLedgerService.processStaffPayment(
        STAFF_ID, SESSION_IDS, "cash",
      );
    } catch (e: any) {
      didThrow = true;
      expect(String(e.message || e)).toMatch(/constraint violation/);
    }
    expect(didThrow).toBe(true);

    // Revert fired exactly once (claim was full, ledger failed).
    expect(revertCount).toBeGreaterThanOrEqual(1);
  });

  it("throws on a claim-step DB failure (does not insert ledger)", async () => {
    routeQueries({
      claimResult: { data: null, error: { message: "deadlock detected" } },
    });

    await expect(
      paymentLedgerService.processStaffPayment(STAFF_ID, SESSION_IDS, "cash"),
    ).rejects.toThrow(/Session claim failed/);

    const ledgerCalls = (supabase.from as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0] === "staff_payment_ledger",
    );
    expect(ledgerCalls.length).toBe(0);
  });

  it("throws when preflight returns no unpaid sessions", async () => {
    routeQueries({
      preflightSessions: [],
      claimResult: { data: [], error: null }, // never reached
    });

    await expect(
      paymentLedgerService.processStaffPayment(STAFF_ID, SESSION_IDS, "cash"),
    ).rejects.toThrow(/No unpaid sessions/);
  });
});
