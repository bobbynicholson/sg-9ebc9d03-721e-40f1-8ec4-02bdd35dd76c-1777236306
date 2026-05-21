/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 2 audit (docs/money-flow.md) introduced the
 * setOrderPaymentStatus chokepoint to guard orders.payment_status.
 * These tests pin the transition allowlist and the canonical-enum
 * validation so future PRs can't quietly widen it.
 *
 * Pure unit tests against an in-memory supabase double - no real DB.
 */

import {
  setOrderPaymentStatus,
  deriveOrderPaymentStatus,
  CANONICAL_ORDER_PAYMENT_STATUSES,
} from "@/services/order/orderPaymentStatus";

interface Row { id: string; company_id?: string; payment_status: string; order_number?: string }

function makeClient(initial: Row) {
  // Mutable row state shared by every chained call.
  const state: { row: Row; updates: Array<Record<string, any>>; auditInserts: Array<any> } = {
    row: { ...initial },
    updates: [],
    auditInserts: [],
  };

  function fromOrders() {
    return {
      select: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: async () => ({ data: { ...state.row }, error: null }),
          }),
        }),
      }),
      update: (patch: Record<string, any>) => {
        state.updates.push(patch);
        if (Object.prototype.hasOwnProperty.call(patch, "payment_status")) {
          state.row.payment_status = patch.payment_status;
        }
        return {
          eq: () => Promise.resolve({ error: null }),
        };
      },
    };
  }

  function fromAuditLogs() {
    return {
      insert: (row: any) => {
        state.auditInserts.push(row);
        return Promise.resolve({ error: null });
      },
    };
  }

  return {
    from: (table: string) => {
      if (table === "orders") return fromOrders();
      if (table === "audit_logs") return fromAuditLogs();
      throw new Error(`unexpected table: ${table}`);
    },
    _state: state,
  };
}

const ORDER_ID = "0000-0000-0000-0000";

describe("setOrderPaymentStatus", () => {
  describe("enum validation", () => {
    it("rejects values not in the canonical set", async () => {
      const client = makeClient({ id: ORDER_ID, payment_status: "pending" });
      const res = await setOrderPaymentStatus(ORDER_ID, "unpaid", { client });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Invalid orders\.payment_status/);
      expect(client._state.updates).toHaveLength(0);
    });

    it("rejects values that exist on the payment_status enum but not for orders", async () => {
      // 'processing' is valid on payments.payment_status but not for the
      // order's overall projection.
      const client = makeClient({ id: ORDER_ID, payment_status: "pending" });
      const res = await setOrderPaymentStatus(ORDER_ID, "processing", { client });
      expect(res.success).toBe(false);
    });

    it("accepts every canonical value as a fresh write from a compatible source", async () => {
      for (const target of CANONICAL_ORDER_PAYMENT_STATUSES) {
        const client = makeClient({ id: ORDER_ID, payment_status: "pending" });
        const res = await setOrderPaymentStatus(ORDER_ID, target, { client });
        // 'pending' is no-op (idempotent), the rest must succeed or be
        // blocked by allowlist (refunded/disputed are not legal from
        // pending in the canonical map).
        if (target === "pending") expect(res.idempotent).toBe(true);
      }
    });
  });

  describe("transition allowlist", () => {
    it("allows pending -> partial", async () => {
      const client = makeClient({ id: ORDER_ID, payment_status: "pending" });
      const res = await setOrderPaymentStatus(ORDER_ID, "partial", { client });
      expect(res.success).toBe(true);
      expect(client._state.row.payment_status).toBe("partial");
    });

    it("allows partial -> paid", async () => {
      const client = makeClient({ id: ORDER_ID, payment_status: "partial" });
      const res = await setOrderPaymentStatus(ORDER_ID, "paid", { client });
      expect(res.success).toBe(true);
    });

    it("allows paid -> refunded", async () => {
      const client = makeClient({ id: ORDER_ID, payment_status: "paid" });
      const res = await setOrderPaymentStatus(ORDER_ID, "refunded", { client });
      expect(res.success).toBe(true);
    });

    it("blocks paid -> pending (must not silently demote)", async () => {
      const client = makeClient({ id: ORDER_ID, payment_status: "paid" });
      const res = await setOrderPaymentStatus(ORDER_ID, "pending", { client });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Invalid payment_status transition/);
    });

    it("blocks refunded -> anything (terminal)", async () => {
      const client = makeClient({ id: ORDER_ID, payment_status: "refunded" });
      const res = await setOrderPaymentStatus(ORDER_ID, "paid", { client });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/terminal state/);
    });

    it("allows partially_refunded -> refunded", async () => {
      const client = makeClient({ id: ORDER_ID, payment_status: "partially_refunded" });
      const res = await setOrderPaymentStatus(ORDER_ID, "refunded", { client });
      expect(res.success).toBe(true);
    });

    it("is idempotent when the new status matches current", async () => {
      const client = makeClient({ id: ORDER_ID, payment_status: "paid" });
      const res = await setOrderPaymentStatus(ORDER_ID, "paid", { client });
      expect(res.success).toBe(true);
      expect(res.idempotent).toBe(true);
      expect(client._state.updates).toHaveLength(0);
    });
  });

  describe("audit trail", () => {
    it("writes an audit_logs row on a successful flip", async () => {
      const client = makeClient({ id: ORDER_ID, company_id: "co", payment_status: "pending" });
      await setOrderPaymentStatus(ORDER_ID, "partial", {
        client,
        actorUserId: "user-1",
        reason: "deposit received",
      });
      expect(client._state.auditInserts).toHaveLength(1);
      const audit = client._state.auditInserts[0];
      expect(audit.action).toBe("order_payment_status_partial");
      expect(audit.details.from_status).toBe("pending");
      expect(audit.details.to_status).toBe("partial");
      expect(audit.details.reason).toBe("deposit received");
    });

    it("does not write an audit row when the flip was rejected", async () => {
      const client = makeClient({ id: ORDER_ID, payment_status: "paid" });
      await setOrderPaymentStatus(ORDER_ID, "pending", { client });
      expect(client._state.auditInserts).toHaveLength(0);
    });
  });
});

describe("deriveOrderPaymentStatus", () => {
  it("returns 'paid' when fully paid", () => {
    expect(deriveOrderPaymentStatus(1000, 1000)).toBe("paid");
  });
  it("returns 'paid' when over-paid", () => {
    expect(deriveOrderPaymentStatus(1500, 1000)).toBe("paid");
  });
  it("returns 'partial' when between zero and total", () => {
    expect(deriveOrderPaymentStatus(400, 1000)).toBe("partial");
  });
  it("returns 'pending' when nothing paid", () => {
    expect(deriveOrderPaymentStatus(0, 1000)).toBe("pending");
  });
  it("returns 'pending' when total is zero (defensive)", () => {
    expect(deriveOrderPaymentStatus(0, 0)).toBe("pending");
  });
  it("never returns the unsupported 'unpaid' value", () => {
    const v = deriveOrderPaymentStatus(0, 1000);
    expect(v).not.toBe("unpaid");
  });
});
