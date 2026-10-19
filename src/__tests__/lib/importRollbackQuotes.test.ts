/**
 * @jest-environment node
 */
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));

import { splitImportedQuotesForRollback, type ImportedQuoteCandidate } from "@/services/importService";

const q = (id: string, extra: Partial<ImportedQuoteCandidate> = {}): ImportedQuoteCandidate => ({
  id, sent_at: null, accepted_at: null, converted_to_order_id: null, ...extra,
});

describe("splitImportedQuotesForRollback", () => {
  it("removes imported quotes nobody has touched", () => {
    expect(splitImportedQuotesForRollback([q("a"), q("b")], new Set())).toEqual({ remove: ["a", "b"], keep: [] });
  });

  it("keeps quotes sent, accepted or converted since the import", () => {
    const result = splitImportedQuotesForRollback([
      q("untouched"),
      q("sent", { sent_at: "2026-10-19T08:00:00Z" }),
      q("accepted", { accepted_at: "2026-10-19T08:00:00Z" }),
      q("converted", { converted_to_order_id: "order-1" }),
    ], new Set());
    expect(result).toEqual({ remove: ["untouched"], keep: ["sent", "accepted", "converted"] });
  });

  it("keeps a quote an order points at, even without converted_to_order_id", () => {
    expect(splitImportedQuotesForRollback([q("a"), q("b")], new Set(["b"]))).toEqual({ remove: ["a"], keep: ["b"] });
  });

  it("handles an import with no quotes", () => {
    expect(splitImportedQuotesForRollback([], new Set())).toEqual({ remove: [], keep: [] });
  });
});
