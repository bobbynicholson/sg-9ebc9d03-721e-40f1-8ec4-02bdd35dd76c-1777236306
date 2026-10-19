import {
  flagRepeatedQuoteNumbers, flagQuoteNumbersOnFile, QUOTE_ON_FILE_WARNING, type QuotePreviewRow,
} from "@/lib/importQuoteDuplicates";

const row = (id: string, quote_number: unknown, extra: Partial<QuotePreviewRow> = {}): QuotePreviewRow => ({
  id, target: "quotes", status: "pending", errorMessage: null, warnings: [], mapped: { quote_number }, ...extra,
});
const lines: Record<string, number> = { a: 2, b: 3, c: 4, d: 5 };
const lineOf = (id: string) => lines[id] ?? null;

describe("flagRepeatedQuoteNumbers", () => {
  it("marks later copies of a number as errors naming the first row", () => {
    const rows = [row("a", "Q-1"), row("b", "Q-2"), row("c", " Q-1 ")];
    expect(flagRepeatedQuoteNumbers(rows, lineOf)).toEqual(["Q-1", "Q-2"]);
    expect(rows[0].status).toBe("pending");
    expect(rows[1].status).toBe("pending");
    expect(rows[2]).toMatchObject({
      status: "error",
      errorMessage: "Same quote number as row 2 in this file. Change the number, or skip this row",
    });
  });

  it("ignores rows already in error, other record types and blank numbers", () => {
    const rows = [
      row("a", "Q-1", { status: "error", errorMessage: "Quote is missing a total amount" }),
      row("b", "Q-1"),
      row("c", "Q-1", { target: "orders" }),
      row("d", ""),
    ];
    expect(flagRepeatedQuoteNumbers(rows, lineOf)).toEqual(["Q-1"]);
    expect(rows[1].status).toBe("pending");
    expect(rows[2].status).toBe("pending");
    expect(rows[3].status).toBe("pending");
  });
});

describe("flagQuoteNumbersOnFile", () => {
  it("warns on rows whose number the company already has", () => {
    const rows = [row("a", "Q-1"), row("b", "Q-2"), row("c", "Q-3", { status: "error", errorMessage: "x" })];
    expect(flagQuoteNumbersOnFile(rows, new Set(["Q-2", "Q-3"]))).toBe(1);
    expect(rows[0].warnings).toEqual([]);
    expect(rows[1].warnings).toEqual([QUOTE_ON_FILE_WARNING]);
    expect(rows[1].status).toBe("pending");
    expect(rows[2].warnings).toEqual([]);
  });
});
