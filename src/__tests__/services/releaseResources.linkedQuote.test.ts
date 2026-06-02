/**
 * TIGHTEN I.109: lock in that the cancel cascade in releaseOrderResources
 * stamps lost_reason='order_cancelled' on linked quotes regardless of
 * quote.status.
 *
 * Path 1 (accepted) and path 2 (draft/sent) were already there pre-I.109.
 * Path 3 (rejected/expired + lost_reason IS NULL) is the new defensive
 * belt-and-braces that catches the QT-20260504-KZBHFY shape Smoke walk
 * #3 surfaced on Spit Braai Delivery.
 *
 * The full releaseOrderResources function fires 13 cascade steps - this
 * test only exercises the quote-cascade slice. Other steps (inventory
 * release, driver de-assignment, etc.) have their .from() calls stubbed
 * to no-op so the test stays focused.
 */

import { releaseOrderResources } from "@/services/order/releaseResources";

const QUOTE_ID = "quote-uuid-1";
const ORDER_ID = "order-uuid-1";

interface MockState {
  /** Captured args passed to the .update() call that handles the
   *  rejected/expired path. Null if it never fired. */
  rejectedExpiredUpdate?: Record<string, any> | null;
  /** Captured for the accepted path 1. */
  acceptedUpdate?: Record<string, any> | null;
  /** Captured for the draft/sent path 2. */
  draftSentUpdate?: Record<string, any> | null;
}

function buildMockSb(state: MockState) {
  // Each table gets its own no-op chainable. The "quotes" branch
  // distinguishes between the three paths by inspecting the args
  // passed to .update() and the .eq() / .in() filter that follows.
  function noopChain(result: any = { data: null, error: null, count: 0 }) {
    const proxy: any = {};
    for (const k of [
      "select", "update", "insert", "upsert", "eq", "neq", "in", "is",
      "gt", "lt", "gte", "lte", "order", "limit", "delete",
    ]) {
      proxy[k] = jest.fn().mockReturnValue(proxy);
    }
    proxy.maybeSingle = jest.fn().mockResolvedValue(result);
    proxy.single = jest.fn().mockResolvedValue(result);
    proxy.then = (resolve: any, reject?: any) =>
      Promise.resolve(result).then(resolve, reject);
    return proxy;
  }

  return {
    from: jest.fn((table: string) => {
      if (table === "orders") {
        // The first orders.select returns the order's quote_id so
        // the quote-cascade kicks in. Subsequent orders.update calls
        // (status flip, etc.) get a vanilla no-op.
        return noopChain({ data: { quote_id: QUOTE_ID }, error: null });
      }
      if (table === "quotes") {
        // The three quote .update() calls are sequenced; we
        // distinguish by the filter applied. Path 1: .eq(status,
        // accepted). Path 2: .in(status, draft|sent). Path 3:
        // .in(status, rejected|expired) + .is(lost_reason, null).
        const proxy: any = {};
        let lastUpdate: any = null;
        for (const k of ["select", "delete"]) proxy[k] = jest.fn().mockReturnValue(proxy);
        proxy.update = jest.fn((args: any) => {
          lastUpdate = args;
          return proxy;
        });
        proxy.eq = jest.fn((col: string, val: any) => {
          if (col === "status" && val === "accepted") {
            state.acceptedUpdate = lastUpdate;
          }
          return proxy;
        });
        proxy.in = jest.fn((col: string, vals: any[]) => {
          if (col === "status") {
            const set = new Set(vals);
            if (set.has("draft") && set.has("sent")) {
              state.draftSentUpdate = lastUpdate;
            }
            if (set.has("rejected") && set.has("expired")) {
              state.rejectedExpiredUpdate = lastUpdate;
            }
          }
          return proxy;
        });
        proxy.is = jest.fn().mockReturnValue(proxy);
        proxy.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
        proxy.then = (resolve: any, reject?: any) =>
          Promise.resolve({ data: null, error: null, count: 1 }).then(resolve, reject);
        return proxy;
      }
      // Every other table - no-op chain that doesn't capture state.
      return noopChain();
    }),
  };
}

describe("releaseOrderResources quote cascade (TIGHTEN I.109)", () => {
  it("fires the rejected/expired path with lost_reason='order_cancelled' on mode=cancel", async () => {
    const state: MockState = {};
    const sb = buildMockSb(state);

    await releaseOrderResources({
      orderId: ORDER_ID,
      companyId: "co-1",
      mode: "cancel",
      sb,
      silent: true,
    });

    // Path 1 + 2 are pre-I.109 and still expected to fire.
    expect(state.acceptedUpdate).toMatchObject({
      lost_reason: "order_cancelled",
    });
    expect(state.draftSentUpdate).toMatchObject({
      status: "rejected",
      lost_reason: "order_cancelled",
    });
    // Path 3 is the new bit.
    expect(state.rejectedExpiredUpdate).toMatchObject({
      lost_reason: "order_cancelled",
    });
    // Status MUST NOT be flipped on path 3 - the quote is already
    // terminal, we only stamp the reason.
    expect(state.rejectedExpiredUpdate).not.toHaveProperty("status");
    expect(state.rejectedExpiredUpdate).not.toHaveProperty("rejected_at");
  }, 30000); // 13-step cascade can run long under jest

  it("skips the entire quote cascade on mode=postpone (event same, new date)", async () => {
    const state: MockState = {};
    const sb = buildMockSb(state);

    await releaseOrderResources({
      orderId: ORDER_ID,
      companyId: "co-1",
      mode: "postpone",
      sb,
      silent: true,
    });

    expect(state.acceptedUpdate).toBeUndefined();
    expect(state.draftSentUpdate).toBeUndefined();
    expect(state.rejectedExpiredUpdate).toBeUndefined();
  });

  it("skips the entire quote cascade on mode=reject (no order to read from)", async () => {
    const state: MockState = {};
    const sb = buildMockSb(state);

    await releaseOrderResources({
      orderId: ORDER_ID,
      companyId: "co-1",
      mode: "reject",
      sb,
      silent: true,
    });

    expect(state.acceptedUpdate).toBeUndefined();
    expect(state.draftSentUpdate).toBeUndefined();
    expect(state.rejectedExpiredUpdate).toBeUndefined();
  });
});
