import { resolveImportQuoteNumber } from "@/lib/importQuoteNumber";

const fakeDb = (result: { data: unknown; error: { message?: string } | null }) => {
  const rpc = jest.fn(async () => result);
  return { db: { rpc }, rpc };
};

describe("resolveImportQuoteNumber", () => {
  it("keeps the number from the file exactly, without touching the counter", async () => {
    const { db, rpc } = fakeDb({ data: "QUO-000099", error: null });
    await expect(resolveImportQuoteNumber(db, "co-1", " Q-2027-001 ", false))
      .resolves.toEqual({ quoteNumber: "Q-2027-001", allocated: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("gives a blank row the company's next quote number", async () => {
    const { db, rpc } = fakeDb({ data: "QUO-000042", error: null });
    await expect(resolveImportQuoteNumber(db, "co-1", "", false))
      .resolves.toEqual({ quoteNumber: "QUO-000042", allocated: true });
    expect(rpc).toHaveBeenCalledWith("consume_next_document_number", { p_company_id: "co-1", p_document_type: "quote" });
  });

  it("never uses up a number in a test run", async () => {
    const { db, rpc } = fakeDb({ data: "QUO-000042", error: null });
    await expect(resolveImportQuoteNumber(db, "co-1", null, true))
      .resolves.toEqual({ quoteNumber: null, allocated: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails the row with a retry message when no number can be allocated", async () => {
    const { db } = fakeDb({ data: null, error: { message: "permission denied" } });
    await expect(resolveImportQuoteNumber(db, "co-1", undefined, false))
      .rejects.toThrow("Could not give this quote a number (permission denied). Run the import again to retry this row.");
    const empty = fakeDb({ data: null, error: null });
    await expect(resolveImportQuoteNumber(empty.db, "co-1", "", false)).rejects.toThrow("no number returned");
  });
});
