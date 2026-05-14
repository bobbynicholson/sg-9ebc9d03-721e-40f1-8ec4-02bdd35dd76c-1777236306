/**
 * Wave 28.1 -- pure-function tests for the cancellation rules engine.
 *
 * These mirror the eventualities listed in the cancellation chain
 * reaction matrix. No DB, no React -- if these break, the wizard's
 * "note before action" copy is wrong, full stop.
 */

import { computeCancellationTerms } from "@/services/cancellation/computeCancellationTerms";
import type { CancellationPolicy } from "@/services/cancellation/types";

const TODAY = new Date("2026-05-14T08:00:00Z");

const STANDARD_POLICY: CancellationPolicy = {
  deposit_refund_tiers: [
    { min_days_before_event: 30, refund_pct: 100, label: "Month or more out" },
    { min_days_before_event: 14, refund_pct: 50, label: "2 weeks or more" },
    { min_days_before_event: 7, refund_pct: 25, label: "1 week or more" },
    { min_days_before_event: 0, refund_pct: 0, label: "Less than 1 week" },
  ],
  postponement_notice_days: 14,
  late_cancel_requires_owner_override_days: 3,
  credit_bonus_pct: 10,
};

// Helper -- N days from TODAY in YYYY-MM-DD.
const dateInDays = (n: number): string => {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe("computeCancellationTerms", () => {
  describe("policy tier matching", () => {
    it("returns 100% refund when more than a month out", () => {
      const t = computeCancellationTerms({
        amountPaid: 965,
        depositAmount: 965,
        depositPaid: true,
        eventDate: dateInDays(45),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.refundPct).toBe(100);
      expect(t.refundAmount).toBe(965);
      expect(t.tierLabel).toBe("full");
      expect(t.creditPct).toBe(100); // capped, not 110
    });

    it("returns 50% refund and 60% credit when 14-29 days out", () => {
      const t = computeCancellationTerms({
        amountPaid: 1000,
        depositAmount: 1000,
        depositPaid: true,
        eventDate: dateInDays(20),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.refundPct).toBe(50);
      expect(t.refundAmount).toBe(500);
      expect(t.creditPct).toBe(60);
      expect(t.creditAmount).toBe(600);
      expect(t.chargeAmount).toBe(500);
      // 50% falls into the "most" bucket (< 100), matching the SQL function.
      expect(t.tierLabel).toBe("most");
    });

    it("returns 25% refund when 7-13 days out", () => {
      const t = computeCancellationTerms({
        amountPaid: 1000,
        depositAmount: 1000,
        depositPaid: true,
        eventDate: dateInDays(10),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.refundPct).toBe(25);
      expect(t.refundAmount).toBe(250);
      expect(t.creditPct).toBe(35);
      expect(t.creditAmount).toBe(350);
    });

    it("returns 0% (forfeit) when inside the tightest window", () => {
      const t = computeCancellationTerms({
        amountPaid: 1000,
        depositAmount: 1000,
        depositPaid: true,
        eventDate: dateInDays(2),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.refundPct).toBe(0);
      expect(t.refundAmount).toBe(0);
      expect(t.creditPct).toBe(10); // bonus still applies on top of 0
      expect(t.creditAmount).toBe(100);
      expect(t.chargeAmount).toBe(1000);
      expect(t.tierLabel).toBe("forfeit");
    });
  });

  describe("legacy fallback", () => {
    it("falls back to companies.cancellation_fee_percent when no tiers", () => {
      const t = computeCancellationTerms({
        amountPaid: 1000,
        depositAmount: 1000,
        depositPaid: true,
        eventDate: dateInDays(20),
        status: "confirmed",
        policy: {},
        legacyCancelFeePct: 25,
        now: TODAY,
      });
      // 25% fee = 75% refund.
      expect(t.refundPct).toBe(75);
      expect(t.refundAmount).toBe(750);
      expect(t.tierLabel).toBe("most");
    });

    it("defaults to 25% fee when no policy AND no legacy field", () => {
      const t = computeCancellationTerms({
        amountPaid: 1000,
        depositAmount: 1000,
        depositPaid: true,
        eventDate: dateInDays(20),
        status: "confirmed",
        policy: {},
        now: TODAY,
      });
      expect(t.refundPct).toBe(75);
    });
  });

  describe("override window flag", () => {
    it("flags requiresOwnerOverride when inside the late-override window", () => {
      const t = computeCancellationTerms({
        amountPaid: 500,
        depositAmount: 500,
        depositPaid: true,
        eventDate: dateInDays(2),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.requiresOwnerOverride).toBe(true);
    });

    it("does NOT flag when outside the late-override window", () => {
      const t = computeCancellationTerms({
        amountPaid: 500,
        depositAmount: 500,
        depositPaid: true,
        eventDate: dateInDays(10),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.requiresOwnerOverride).toBe(false);
    });
  });

  describe("postponement availability", () => {
    it("offers postponement when notice days satisfied", () => {
      const t = computeCancellationTerms({
        amountPaid: 500,
        depositAmount: 500,
        depositPaid: true,
        eventDate: dateInDays(20),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.canPostpone).toBe(true);
    });

    it("does not offer postponement inside notice window", () => {
      const t = computeCancellationTerms({
        amountPaid: 500,
        depositAmount: 500,
        depositPaid: true,
        eventDate: dateInDays(5),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.canPostpone).toBe(false);
    });
  });

  describe("amount-paid base selection", () => {
    it("uses amountPaid when balance also paid (larger than deposit)", () => {
      const t = computeCancellationTerms({
        amountPaid: 5000,
        depositAmount: 1000,
        depositPaid: true,
        eventDate: dateInDays(20),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      // 50% of 5000 = 2500, NOT 50% of 1000.
      expect(t.refundAmount).toBe(2500);
    });

    it("uses depositAmount when amountPaid is 0 (deposit paid via different rail)", () => {
      const t = computeCancellationTerms({
        amountPaid: 0,
        depositAmount: 1000,
        depositPaid: true,
        eventDate: dateInDays(20),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.refundAmount).toBe(500);
    });

    it("returns 0 amounts when nothing paid", () => {
      const t = computeCancellationTerms({
        amountPaid: 0,
        depositAmount: 0,
        depositPaid: false,
        eventDate: dateInDays(20),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.refundAmount).toBe(0);
      expect(t.creditAmount).toBe(0);
      expect(t.chargeAmount).toBe(0);
      expect(t.reasoning.some((r) => r.includes("Nothing has been paid"))).toBe(
        true,
      );
    });
  });

  describe("committed-cost notes", () => {
    it("flags committed cost when shopping done", () => {
      const t = computeCancellationTerms({
        amountPaid: 500,
        depositAmount: 500,
        depositPaid: true,
        eventDate: dateInDays(2),
        status: "confirmed",
        shoppingDone: true,
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.committedCostNote).not.toBeNull();
      expect(t.committedCostNote).toContain("shopped");
    });

    it("flags committed cost when kitchen prep started", () => {
      const t = computeCancellationTerms({
        amountPaid: 500,
        depositAmount: 500,
        depositPaid: true,
        eventDate: dateInDays(2),
        status: "ready",
        kitchenPrepStarted: true,
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.committedCostNote).toContain("kitchen prep");
    });

    it("returns null committedCostNote when nothing committed", () => {
      const t = computeCancellationTerms({
        amountPaid: 500,
        depositAmount: 500,
        depositPaid: true,
        eventDate: dateInDays(20),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.committedCostNote).toBeNull();
    });
  });

  describe("blocked paths", () => {
    it("blocks when status is out_for_delivery", () => {
      const t = computeCancellationTerms({
        amountPaid: 1000,
        depositAmount: 500,
        depositPaid: true,
        eventDate: dateInDays(0),
        status: "out_for_delivery",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.blocked).not.toBeNull();
      expect(t.blocked?.reason).toContain("on its way");
    });

    it("blocks when status is delivered", () => {
      const t = computeCancellationTerms({
        amountPaid: 1000,
        depositAmount: 500,
        depositPaid: true,
        eventDate: dateInDays(0),
        status: "delivered",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.blocked).not.toBeNull();
    });

    it("blocks when already cancelled (idempotency hint)", () => {
      const t = computeCancellationTerms({
        amountPaid: 0,
        depositAmount: 0,
        depositPaid: false,
        eventDate: dateInDays(20),
        status: "cancelled",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.blocked?.reason).toContain("already cancelled");
    });

    it("blocks when already completed", () => {
      const t = computeCancellationTerms({
        amountPaid: 1000,
        depositAmount: 500,
        depositPaid: true,
        eventDate: dateInDays(-3),
        status: "completed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.blocked?.reason).toContain("complete");
    });

    it("does NOT block when status is just confirmed", () => {
      const t = computeCancellationTerms({
        amountPaid: 500,
        depositAmount: 500,
        depositPaid: true,
        eventDate: dateInDays(20),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.blocked).toBeNull();
    });
  });

  describe("credit bonus configuration", () => {
    it("respects custom credit_bonus_pct", () => {
      const t = computeCancellationTerms({
        amountPaid: 1000,
        depositAmount: 1000,
        depositPaid: true,
        eventDate: dateInDays(20),
        status: "confirmed",
        policy: { ...STANDARD_POLICY, credit_bonus_pct: 20 },
        now: TODAY,
      });
      expect(t.creditPct).toBe(70); // 50 + 20
      expect(t.creditAmount).toBe(700);
    });

    it("caps credit at 100% even with large bonus", () => {
      const t = computeCancellationTerms({
        amountPaid: 1000,
        depositAmount: 1000,
        depositPaid: true,
        eventDate: dateInDays(45),
        status: "confirmed",
        policy: { ...STANDARD_POLICY, credit_bonus_pct: 50 },
        now: TODAY,
      });
      expect(t.creditPct).toBe(100);
      expect(t.creditAmount).toBe(1000);
    });

    it("disables bonus when credit_bonus_pct = 0", () => {
      const t = computeCancellationTerms({
        amountPaid: 1000,
        depositAmount: 1000,
        depositPaid: true,
        eventDate: dateInDays(20),
        status: "confirmed",
        policy: { ...STANDARD_POLICY, credit_bonus_pct: 0 },
        now: TODAY,
      });
      expect(t.creditPct).toBe(50);
      expect(t.creditAmount).toBe(t.refundAmount);
    });
  });

  describe("freed-slot note", () => {
    it("always includes a freed-slot note", () => {
      const t = computeCancellationTerms({
        amountPaid: 500,
        depositAmount: 500,
        depositPaid: true,
        eventDate: dateInDays(20),
        status: "confirmed",
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.freedSlotNote).toContain("free");
    });
  });

  describe("reasoning trail", () => {
    it("populates the reasoning array with the steps it took", () => {
      const t = computeCancellationTerms({
        amountPaid: 1000,
        depositAmount: 1000,
        depositPaid: true,
        eventDate: dateInDays(20),
        status: "confirmed",
        kitchenPrepStarted: true,
        policy: STANDARD_POLICY,
        now: TODAY,
      });
      expect(t.reasoning.length).toBeGreaterThan(3);
      // Should mention days-to-event, tier match, credit bonus, kitchen
      // prep, freed slot.
      expect(t.reasoning.join(" ")).toMatch(/day\(s\)/);
      expect(t.reasoning.join(" ")).toMatch(/tier/i);
    });
  });
});
