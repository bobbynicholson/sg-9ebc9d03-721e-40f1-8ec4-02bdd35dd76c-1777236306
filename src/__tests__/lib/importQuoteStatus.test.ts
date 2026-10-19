import { normaliseQuoteStatus, QUOTE_STATUSES } from "@/lib/importNormalise";

describe("normaliseQuoteStatus", () => {
  it("keeps the five database statuses, whatever the case or spacing", () => {
    for (const s of QUOTE_STATUSES) {
      expect(normaliseQuoteStatus(s)).toEqual({ value: s, warnings: [] });
      expect(normaliseQuoteStatus(`  ${s.toUpperCase()} `).value).toBe(s);
    }
    expect(normaliseQuoteStatus("Sent").value).toBe("sent");
  });

  it("maps words other systems use", () => {
    expect(normaliseQuoteStatus("Declined").value).toBe("rejected");
    expect(normaliseQuoteStatus("lost").value).toBe("rejected");
    expect(normaliseQuoteStatus("Won").value).toBe("accepted");
    expect(normaliseQuoteStatus("Confirmed").value).toBe("accepted");
    expect(normaliseQuoteStatus("Awaiting_Response").value).toBe("sent");
    expect(normaliseQuoteStatus("Lapsed").value).toBe("expired");
    expect(normaliseQuoteStatus("not-sent").value).toBe("draft");
  });

  it("treats a blank cell as no status, with no warning", () => {
    expect(normaliseQuoteStatus("")).toEqual({ value: null, warnings: [] });
    expect(normaliseQuoteStatus(null)).toEqual({ value: null, warnings: [] });
    expect(normaliseQuoteStatus(undefined)).toEqual({ value: null, warnings: [] });
  });

  it("drops an unknown word with a warning that says what happens", () => {
    const r = normaliseQuoteStatus("Maybe later");
    expect(r.value).toBeNull();
    expect(r.warnings).toEqual([
      '"Maybe later" is not a quote status (use draft, sent, accepted, rejected or expired); it will be saved as sent',
    ]);
  });
});
