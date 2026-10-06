/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { callTextJson, parseJsonLoose, textProviderOrder, visionProviderOrder, isTextAiConfigured } from "@/lib/ai/textLlm";
import { mapColumnsViaAI, repairRowViaAI, extractReceiptViaAI } from "@/lib/importAi";
import { analyzeEftProof } from "@/lib/eftProofVision";

const AI_KEYS = ["OPENROUTER_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_MODEL", "OPENROUTER_TEXT_MODEL", "GROQ_TEXT_MODEL"];
const saved: Record<string, string | undefined> = {};
const originalFetch = global.fetch;

function setKeys(keys: Partial<Record<string, string>>) {
  for (const k of AI_KEYS) delete process.env[k];
  Object.assign(process.env, keys);
}

function chatOk(content: unknown, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return { ok: true, json: async () => ({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: "stop" }], usage }) };
}

function bodyOf(call: any[]): any {
  return JSON.parse(call[1].body);
}

beforeAll(() => { for (const k of AI_KEYS) saved[k] = process.env[k]; });
afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });
afterAll(() => {
  for (const k of AI_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("provider order", () => {
  it("puts gpt-oss providers first and Claude last", () => {
    setKeys({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o", GROQ_API_KEY: "g", OPENROUTER_API_KEY: "r" });
    expect(textProviderOrder()).toEqual(["openrouter", "groq", "openai", "anthropic"]);
    expect(visionProviderOrder()).toEqual(["openrouter", "openai", "groq"]);
  });

  it("keeps features working with only an OpenAI key", () => {
    setKeys({ OPENAI_API_KEY: "o" });
    expect(isTextAiConfigured()).toBe(true);
    expect(textProviderOrder()).toEqual(["openai"]);
    expect(visionProviderOrder()).toEqual(["openai"]);
  });

  it("is unconfigured with no keys", () => {
    setKeys({});
    expect(isTextAiConfigured()).toBe(false);
  });
});

describe("callTextJson", () => {
  it("calls gpt-oss-20b on OpenRouter with JSON mode and low reasoning", async () => {
    setKeys({ OPENROUTER_API_KEY: "r", ANTHROPIC_API_KEY: "a" });
    global.fetch = jest.fn().mockResolvedValue(chatOk({ ok: 1 })) as any;
    const r = await callTextJson({ system: "s", user: "u", maxTokens: 100 });
    expect(r.data).toEqual({ ok: 1 });
    expect(r.model).toBe("openai/gpt-oss-20b");
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = bodyOf(call);
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.reasoning).toEqual({ effort: "low", exclude: true });
    expect(body.max_tokens).toBe(1124); // reasoning headroom
    expect(global.fetch).toHaveBeenCalledTimes(1); // Claude never touched
  });

  it("falls through to Groq, then OpenAI, when earlier providers fail", async () => {
    setKeys({ OPENROUTER_API_KEY: "r", GROQ_API_KEY: "g", OPENAI_API_KEY: "o" });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "down" })
      .mockResolvedValueOnce(chatOk("not json"))
      .mockResolvedValueOnce(chatOk({ ok: 2 })) as any;
    const r = await callTextJson({ system: "s", user: "u" });
    expect(r.provider).toBe("openai");
    expect(r.model).toBe("gpt-4o-mini");
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[1][0]).toContain("api.groq.com");
    expect(bodyOf(calls[1]).reasoning_effort).toBe("low");
    expect(calls[2][0]).toBe("https://api.openai.com/v1/chat/completions");
    expect(bodyOf(calls[2]).reasoning).toBeUndefined();
  });

  it("uses Claude Haiku only as the last resort", async () => {
    setKeys({ ANTHROPIC_API_KEY: "a" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: '{"ok":3}' }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" }),
    }) as any;
    const r = await callTextJson({ system: "s", user: "u" });
    expect(r).toMatchObject({ data: { ok: 3 }, provider: "anthropic", model: "claude-haiku-4-5" });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
  });

  it("throws a clear error when no key is set", async () => {
    setKeys({});
    await expect(callTextJson({ system: "s", user: "u" })).rejects.toThrow(/No AI key configured/);
  });

  it("parses fenced JSON", () => {
    expect(parseJsonLoose("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
    expect(parseJsonLoose("here: {\"a\":2} done")).toEqual({ a: 2 });
    expect(parseJsonLoose("nope")).toBeNull();
  });
});

describe("client / CSV import", () => {
  it("maps columns on gpt-oss-120b and fills headers the model skipped", async () => {
    setKeys({ OPENROUTER_API_KEY: "r", ANTHROPIC_API_KEY: "a" });
    global.fetch = jest.fn().mockResolvedValue(chatOk({
      mappings: [{ source_header: "Email", target: "email", confidence: 0.95, rationale: "exact" }],
    })) as any;
    const r = await mapColumnsViaAI({
      sheetName: "Client list",
      headers: ["Email", "Notes col"],
      sampleRows: [{ Email: "a@b.co", "Notes col": "x" }],
      targetSchema: "clients",
      targetFields: [{ key: "email", description: "Email" }],
    });
    expect(r.mapping).toEqual([
      { source_header: "Email", target: "email", confidence: 0.95, rationale: "exact" },
      { source_header: "Notes col", target: "skip", confidence: 0, rationale: "Not returned by model" },
    ]);
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(bodyOf(calls[0]).model).toBe("openai/gpt-oss-120b");
    // One retry that asks only about the column the model left out.
    expect(calls).toHaveLength(2);
    expect(JSON.parse(bodyOf(calls[1]).messages[1].content).source_headers).toEqual(["Notes col"]);
  });

  it("moves to the next provider when a mapping comes back empty", async () => {
    setKeys({ OPENROUTER_API_KEY: "r", OPENAI_API_KEY: "o" });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = jest.fn()
      .mockResolvedValueOnce(chatOk({ mappings: [] }))
      .mockResolvedValueOnce(chatOk({ mappings: [{ source_header: "Phone", target: "phone", confidence: 0.9, rationale: "r" }] })) as any;
    const r = await mapColumnsViaAI({ sheetName: "s", headers: ["Phone"], sampleRows: [], targetSchema: "clients" });
    expect(r.mapping[0].target).toBe("phone");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("repairs a row via gpt-oss-20b", async () => {
    setKeys({ GROQ_API_KEY: "g" });
    global.fetch = jest.fn().mockResolvedValue(chatOk({ fixes: { email: "a@b.co" }, rationale: "lower-cased", unresolved: [] })) as any;
    const r = await repairRowViaAI({ rawRow: { Email: "A@B.CO" }, mappedRow: {}, warnings: [], errorMessage: null, targetTable: "clients" });
    expect(r.result).toEqual({ fixes: { email: "a@b.co" }, rationale: "lower-cased", unresolved: [] });
    expect(bodyOf((global.fetch as jest.Mock).mock.calls[0]).model).toBe("openai/gpt-oss-20b");
  });
});

describe("vision", () => {
  const receipt = {
    supplier_name: "Makro", supplier_vat_number: null, receipt_date: "2026-10-01", receipt_number: null,
    currency: "ZAR", subtotal: 100, vat: 15, total: 115, payment_method: "card",
    line_items: [{ description: "Lamb", quantity: 1, unit: "kg", unit_price: 100, line_total: 100, tax_category_code: null, is_deductible: null, match_confidence: null }],
    warnings: [],
  };

  it("reads receipts on Llama 4 Scout via OpenRouter without touching Claude", async () => {
    setKeys({ OPENROUTER_API_KEY: "r", GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a" });
    jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue(chatOk(receipt)) as any;
    const r = await extractReceiptViaAI({ imageBase64: "aGVsbG8=", imageMime: "image/jpeg" });
    expect(r.model_used).toBe("meta-llama/llama-4-scout");
    expect(r.extraction.line_items).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("openrouter.ai");
  });

  it("retries on Maverick when Scout reads no lines", async () => {
    setKeys({ OPENROUTER_API_KEY: "r" });
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    global.fetch = jest.fn()
      .mockResolvedValueOnce(chatOk({ ...receipt, line_items: [] }))
      .mockResolvedValueOnce(chatOk(receipt)) as any;
    const r = await extractReceiptViaAI({ imageBase64: "aGVsbG8=", imageMime: "image/jpeg" });
    expect(r.model_used).toBe("meta-llama/llama-4-maverick");
    expect(r.extraction.warnings[0]).toMatch(/Switched to/);
  });

  it("scans receipts with only an OpenAI key (gpt-4.1-mini)", async () => {
    setKeys({ OPENAI_API_KEY: "o" });
    jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue(chatOk(receipt)) as any;
    const r = await extractReceiptViaAI({ imageBase64: "aGVsbG8=", imageMime: "image/jpeg" });
    expect(r.model_used).toBe("gpt-4.1-mini");
  });

  it("uses Groq Qwen 3.8 (not the shut-down Llama 4 ids) when Groq is the only vision key", async () => {
    setKeys({ GROQ_API_KEY: "g" });
    jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue(chatOk("<think>reading the slip {maybe}</think>" + JSON.stringify(receipt))) as any;
    const r = await extractReceiptViaAI({ imageBase64: "aGVsbG8=", imageMime: "image/jpeg" });
    expect(r.model_used).toBe("qwen/qwen3.8-27b");
    expect(r.extraction.line_items).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("screens EFT proof images on Llama vision", async () => {
    setKeys({ OPENROUTER_API_KEY: "r" });
    global.fetch = jest.fn().mockResolvedValue(chatOk({
      document_type: "bank_transfer_confirmation", transfer_status: "successful", amount: 500, currency: "ZAR",
      reference: "INV-001", transaction_date: "2026-10-04", recipient: "Caterer", warnings: [], confidence: 0.95,
    })) as any;
    const r = await analyzeEftProof({ imageBase64: "aGVsbG8=", imageMime: "image/png", invoiceNumber: "INV-001", amount: 500, currency: "ZAR", recipient: "Caterer" });
    expect(r.status).toBe("consistent");
    expect(r.model).toBe("meta-llama/llama-4-scout");
  });

  it("leaves PDF proofs for manual review when Claude is not configured", async () => {
    setKeys({ GROQ_API_KEY: "g" });
    global.fetch = jest.fn() as any;
    const r = await analyzeEftProof({ imageBase64: "aGVsbG8=", imageMime: "application/pdf", invoiceNumber: "INV-001", amount: 500, currency: "ZAR" });
    expect(r.status).toBe("not_analyzed");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
