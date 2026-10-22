/** @jest-environment node */
const mockAccess = jest.fn(); const mockCatalogue = jest.fn(); const mockFrom = jest.fn(); const mockRpc = jest.fn();
jest.mock("@/server/documentImport", () => ({ documentImportAccess: (...args: any[]) => mockAccess(...args), documentImportCatalogue: (...args: any[]) => mockCatalogue(...args), documentImportError: (e: any) => e.message || "Failed" }));
jest.mock("@/lib/ai/usageLog", () => ({ setAiUsageContext: jest.fn() }));
import handler from "@/pages/api/document-imports/[id]/[documentId]";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let doc: any; let calls: any[];
const response = () => { const res: any = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); res.end = jest.fn(); return res; };
const request = (body: any) => ({ method: "POST", query: { id: id(1), documentId: id(2) }, body } as any);
function query(table: string) {
  const q: any = {}; let operation = "read";
  q.select = jest.fn().mockReturnValue(q); q.eq = jest.fn((...args) => { calls.push({ table, eq: args }); return q; });
  q.update = jest.fn((value) => { operation = "update"; calls.push({ table, update: value }); return q; });
  const result = () => ({ data: table === "document_import_files" ? operation === "update" ? { ...doc, version: doc.version + 1 } : doc : table === "companies" ? { currency: "ZAR", pricing_includes_vat: false } : table === "regions" ? { id: id(4) } : null, error: null });
  q.single = jest.fn(async () => result()); q.maybeSingle = jest.fn(async () => result()); return q;
}
beforeEach(() => {
  jest.clearAllMocks(); calls = []; doc = { id: id(2), company_id: id(3), job_id: id(1), target_table: "quotes", version: 2, status: "review", extraction: { document_type: "quote", fields: {}, items: [], unmatched: [], warnings: [] } };
  mockFrom.mockImplementation(query); mockAccess.mockResolvedValue({ db: { from: mockFrom, rpc: mockRpc }, companyId: id(3), userId: id(5) }); mockCatalogue.mockResolvedValue([]);
});
test("unauthorised requests stop before reading source files or writing records", async () => {
  mockAccess.mockResolvedValue(null); await handler(request({ action: "extract" }), response()); expect(mockFrom).not.toHaveBeenCalled(); expect(mockRpc).not.toHaveBeenCalled();
});
test("a stale review cannot overwrite another administrator's corrections", async () => {
  const res = response(); await handler(request({ action: "save", version: 1, review: {} }), res); expect(res.status).toHaveBeenCalledWith(409); expect(calls.some((v) => v.update)).toBe(false);
});
test("saving incomplete corrections creates no customer, catalogue or financial records", async () => {
  const res = response(); await handler(request({ action: "save", version: 2, review: { fields: { client_name: "Jane" }, items: [{ kind: "menu", name: "Chicken" }], region_id: "", reviewed: false } }), res);
  expect(res.status).not.toHaveBeenCalled(); expect(mockRpc).not.toHaveBeenCalled(); expect(mockCatalogue).not.toHaveBeenCalled();
  expect(calls.filter((v) => v.update).map((v) => v.table)).toEqual(["document_import_files"]);
  expect(calls).toEqual(expect.arrayContaining([expect.objectContaining({ table: "document_import_files", eq: ["company_id", id(3)] })]));
});
test("a commit without event and amount details never reaches the transaction", async () => {
  const res = response(); await handler(request({ action: "commit", version: 2, review: { fields: { client_name: "Jane" }, items: [{ kind: "menu", name: "Chicken" }], region_id: id(4), reviewed: true } }), res);
  expect(res.status).toHaveBeenCalledWith(400); expect(mockRpc).not.toHaveBeenCalled(); expect(res.json.mock.calls[0][0].errors.join(" ")).toContain("Event date is missing");
});
test("retry after a committed response returns the existing record, with no repeat writes", async () => {
  doc.status = "committed"; doc.target_id = id(9); const res = response(); await handler(request({ action: "commit", version: 2 }), res);
  expect(res.json).toHaveBeenCalledWith({ targetId: id(9), alreadySaved: true }); expect(mockRpc).not.toHaveBeenCalled();
});
