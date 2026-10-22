/** @jest-environment node */
const mockInfo = jest.fn(); const mockText = jest.fn(); const mockScreens = jest.fn(); const mockDestroy = jest.fn(); const mockAi = jest.fn(); const mockVision = jest.fn();
jest.mock("pdf-parse/worker", () => ({ getData: () => "data:text/javascript;base64,fixture-worker", CanvasFactory: class {} }));
jest.mock("pdf-parse", () => ({ PDFParse: Object.assign(jest.fn().mockImplementation(() => ({ getInfo: mockInfo, getText: mockText, getScreenshot: mockScreens, destroy: mockDestroy })), { setWorker: jest.fn() }) }));
jest.mock("@/lib/ai/textLlm", () => ({ callTextJson: (...args: any[]) => mockAi(...args), chatCompletion: (...args: any[]) => mockVision(...args), parseJsonLoose: JSON.parse, visionModels: () => ({ primary: "fixture-vision" }), visionProviderOrder: () => ["openai"] }));
import { extractBookingDocument } from "@/server/extractBookingDocument";
import { PDFParse } from "pdf-parse";

const extraction = () => ({ document_type: "quote", fields: { client_name: { value: "Jane", evidence: "Bill to Jane", page: 1, confidence: .9 } }, items: [{ kind: "menu", name: "Chicken", quantity: null, unit_price: 100, line_total: null }], unmatched: [], warnings: [] });
const pdf = Buffer.from("%PDF-1.7 synthetic test");
beforeEach(() => {
  jest.clearAllMocks(); mockInfo.mockResolvedValue({ total: 2 }); mockText.mockResolvedValue({ text: "a".repeat(200), pages: [{ num: 1, text: "FIRST PAGE ".repeat(15) }, { num: 2, text: "SECOND PAGE ".repeat(15) }] });
  mockAi.mockResolvedValue({ data: extraction(), model: "fixture-text" }); mockScreens.mockResolvedValue({ pages: [{ pageNumber: 2, dataUrl: "data:image/png;base64,AA==" }] }); mockVision.mockResolvedValue({ content: JSON.stringify(extraction()), model: "fixture-vision" });
});
test("all text pages reach the extractor; missing quantities are never invented", async () => {
  const result = await extractBookingDocument(pdf, "quotes");
  expect(PDFParse.setWorker).toHaveBeenCalledWith("data:text/javascript;base64,fixture-worker");
  expect(PDFParse).toHaveBeenCalledWith(expect.objectContaining({ CanvasFactory: expect.any(Function) }));
  expect(mockAi.mock.calls[0][0].user).toContain("PAGE 1"); expect(mockAi.mock.calls[0][0].user).toContain("PAGE 2");
  expect(result.extraction.items[0].quantity).toBeNull(); expect(mockDestroy).toHaveBeenCalled();
});
test("mixed scanned and text PDFs include the missing page in vision without dropping text", async () => {
  mockText.mockResolvedValue({ text: "header", pages: [{ num: 1, text: "TEXT PAGE ".repeat(20) }, { num: 2, text: "" }] });
  const result = await extractBookingDocument(pdf, "orders");
  expect(mockScreens.mock.calls[0][0].partial).toEqual([2]); expect(mockAi).not.toHaveBeenCalled();
  expect(JSON.stringify(mockVision.mock.calls[0][0].messages)).toContain("SCANNED PAGE 2"); expect(result.usedVision).toBe(true);
});
test("model-invented database columns become unmatched notes, never an executable field", async () => {
  const data: any = extraction(); data.fields.company_id = { value: "another tenant", page: 1 };
  mockAi.mockResolvedValue({ data, model: "fixture" }); const result = await extractBookingDocument(pdf, "quotes");
  expect(result.extraction.fields.company_id).toBeUndefined(); expect(result.extraction.unmatched).toEqual(expect.arrayContaining([expect.objectContaining({ label: "company_id", value: "another tenant" })]));
});
test("large PDFs are rejected before spending tokens and still release the parser", async () => {
  mockInfo.mockResolvedValue({ total: 21 }); await expect(extractBookingDocument(pdf, "orders")).rejects.toThrow(/1-20 pages/); expect(mockAi).not.toHaveBeenCalled(); expect(mockDestroy).toHaveBeenCalled();
});
test("fake PDFs never reach parser or model", async () => {
  await expect(extractBookingDocument(Buffer.from("not a PDF"), "orders")).rejects.toThrow(/not a PDF/); expect(mockInfo).not.toHaveBeenCalled();
});
test("incomplete or multi-document extraction cannot be silently accepted", async () => {
  const data = extraction(); data.warnings = ["Multiple unrelated documents detected"];
  mockAi.mockResolvedValue({ data, model: "fixture" }); await expect(extractBookingDocument(pdf, "orders")).rejects.toThrow(/Split it/);
});
