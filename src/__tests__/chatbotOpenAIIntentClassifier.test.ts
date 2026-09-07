import { classifyChatIntentWithOpenAI } from "@/server/chatbot/intentClassifier";

describe("OpenAI-first intent classification", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it("uses a strict allowlisted OpenAI intent before selecting tools", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: JSON.stringify({ intent_id: "data.driver_earnings", confidence: 0.97, time_range: "this_month", scope: "self", needs_clarification: false }) }),
    }) as any;
    const result = await classifyChatIntentWithOpenAI("What are my earnings this month?", "driver");
    expect(global.fetch).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({ method: "POST" }));
    expect(result).toMatchObject({ id: "data.driver_earnings", matchedBy: "openai", toolIds: ["driver_earnings"], timeRange: "this_month" });
  });

  it("falls back to the complete local catalog when OpenAI is unavailable", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await classifyChatIntentWithOpenAI("show the platform user count", "super_admin");
    expect(result?.matchedBy).toBe("fallback");
    expect(result?.toolIds).toContain("platform_user_count");
  });
});
