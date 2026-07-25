import {
  buildQuoteChangeEditorPath,
  buildQuoteSentLifecyclePatch,
  savedQuantityWasOverridden,
} from "@/lib/quotes/revisionLifecycle";

describe("quote revision lifecycle", () => {
  describe("savedQuantityWasOverridden", () => {
    it("preserves a custom per-person quantity when reopening a quote", () => {
      expect(savedQuantityWasOverridden("per_person", 10, 50)).toBe(true);
    });

    it("keeps guest-count quantities automatic", () => {
      expect(savedQuantityWasOverridden("per_person", 50, 50)).toBe(false);
    });

    it("does not classify portion or empty quantities as guest overrides", () => {
      expect(savedQuantityWasOverridden("per_portion", 10, 50)).toBe(false);
      expect(savedQuantityWasOverridden("per_person", 0, 50)).toBe(false);
    });
  });

  describe("buildQuoteSentLifecyclePatch", () => {
    const sentAt = "2026-07-25T10:00:00.000Z";

    it("reopens a changed quote for client acceptance", () => {
      expect(
        buildQuoteSentLifecyclePatch({
          isConverted: false,
          contentChanged: true,
          sentAt,
        }),
      ).toEqual({
        sent_at: sentAt,
        status: "sent",
        accepted_at: null,
        viewed_at: null,
        rejected_at: null,
      });
    });

    it("does not erase acceptance fields for an unchanged resend", () => {
      expect(
        buildQuoteSentLifecyclePatch({
          isConverted: false,
          contentChanged: false,
          sentAt,
        }),
      ).toEqual({
        sent_at: sentAt,
        status: "sent",
      });
    });

    it("keeps converted quotes accepted", () => {
      expect(
        buildQuoteSentLifecyclePatch({
          isConverted: true,
          contentChanged: true,
          sentAt,
        }),
      ).toEqual({ sent_at: sentAt });
    });
  });

  it("links change-request alerts directly to the editable builder", () => {
    expect(buildQuoteChangeEditorPath("quote id", "request/id")).toBe(
      "/admin/quotes/new?fromQuoteId=quote%20id&change_request_id=request%2Fid",
    );
  });
});
