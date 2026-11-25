import { retrieveKnowledgeResult } from "@/server/chatbot/brain";
import { CHAT_CANONICAL_ROLES } from "@/lib/chatbot/roles";

jest.mock("@/lib/ai/usageLog", () => ({ recordAiUsage: jest.fn() }));

const originalFetch = global.fetch;
const originalEnvironment = { ...process.env };

function database(sources: any[], documents: any[] = []) {
  const sourceQuery: any = {
    select: jest.fn(() => sourceQuery), eq: jest.fn(() => sourceQuery),
    or: jest.fn(() => sourceQuery), is: jest.fn(() => sourceQuery),
    then: (resolve: (value: any) => void) => resolve({ data: sources, error: null }),
  };
  return { from: jest.fn(() => sourceQuery), rpc: jest.fn().mockResolvedValue({ data: documents, error: null }), sourceQuery };
}

function source(id: string, roles: unknown = ["staff"], companyId: string | null = "company-1") {
  return { id, company_id: companyId, name: "Approved handoff guide", status: "ready", metadata: { roles } };
}

function document(sourceId: string, content = "Place returned equipment in the inspection area.", score = 0.85, companyId: string | null = "company-1") {
  return { id: `document-${sourceId}`, source_id: sourceId, company_id: companyId, content, score };
}

beforeEach(() => {
  process.env.EMBEDDING_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.EMBEDDING_DIMENSIONS;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ index: 0, embedding: Array(1536).fill(0.01) }] }) }) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
  for (const key of ["EMBEDDING_PROVIDER", "OPENAI_API_KEY", "EMBEDDING_DIMENSIONS"]) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
});

describe("role-scoped semantic knowledge search", () => {
  it("returns a semantic passage without requiring shared keywords", async () => {
    const db = database([source("shared")], [document("shared")]);
    const result = await retrieveKnowledgeResult(db, "company-1", "staff", "Where does everything go once we finish?");
    expect(result).toMatchObject({ status: "matched", items: [{ content: "Place returned equipment in the inspection area.", sourceName: "Approved handoff guide" }] });
    expect(db.rpc).toHaveBeenCalledWith("match_ai_brain_documents_for_sources", expect.objectContaining({ match_source_ids: ["shared"], match_company_id: "company-1", match_threshold: 0.25 }));
    const embeddingInput = JSON.parse(jest.mocked(global.fetch).mock.calls[0][1]!.body as string).input[0];
    expect(embeddingInput).toContain("Where does everything go once we finish?");
    expect(embeddingInput).toContain("Staff member");
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.from).toHaveBeenCalledWith("ai_brain_sources");
  });

  it.each(CHAT_CANONICAL_ROLES)("retrieves guidance for the implemented %s role", async (role) => {
    const db = database([source("role-guide", [role])], [document("role-guide")]);
    expect((await retrieveKnowledgeResult(db, "company-1", role, "What should I do next?")).status).toBe("matched");
  });

  it("filters permissions and readiness before ranking so other roles cannot crowd out results", async () => {
    const db = database([
      source("mine"), source("manager", ["owner"]), source("other-company", ["staff"], "company-2"),
      { ...source("failed"), status: "error" }, source("invalid", ["unknown-role"]), source("malformed", "owner"),
    ], [document("mine"), document("manager", "Private pricing", 0.99), document("mine", "Mismatched scope", 0.99, "company-2")]);
    const result = await retrieveKnowledgeResult(db, "company-1", "staff", "Explain my handoff");
    expect(result.items).toHaveLength(1);
    expect(db.rpc.mock.calls[0][1].match_source_ids).toEqual(["mine"]);
    expect(db.sourceQuery.eq).toHaveBeenCalledWith("status", "ready");
    expect(db.sourceQuery.or).toHaveBeenCalledWith("company_id.is.null,company_id.eq.company-1");
  });

  it("normalizes legacy role aliases without turning unknown roles into staff access", async () => {
    const db = database([source("waiter", ["server"]), source("staff-only", ["staff"])], [document("waiter")]);
    expect((await retrieveKnowledgeResult(db, "company-1", "waitering", "How should I prepare?")).items).toHaveLength(1);
    expect(db.rpc.mock.calls[0][1].match_source_ids).toEqual(["waiter"]);
  });

  it("keeps a platform session on global knowledge", async () => {
    const db = database([source("global", [], null), source("tenant", ["super_admin"])], [document("global", "Platform procedures", 0.9, null)]);
    expect((await retrieveKnowledgeResult(db, null, "super_admin", "How does onboarding work?")).items).toHaveLength(1);
    expect(db.sourceQuery.is).toHaveBeenCalledWith("company_id", null);
    expect(db.rpc.mock.calls[0][1].match_source_ids).toEqual(["global"]);
  });

  it("deduplicates passages and rejects low or invalid similarity", async () => {
    const db = database([source("mine")], [document("mine"), document("mine"), document("mine", "Unrelated", 0.1), document("mine", "Invalid", Number.NaN)]);
    expect((await retrieveKnowledgeResult(db, "company-1", "staff", "What happens next?")).items).toHaveLength(1);
  });

  it("reports an empty semantic result without running a keyword scan", async () => {
    const db = database([source("mine")]);
    expect(await retrieveKnowledgeResult(db, "company-1", "staff", "my tasks")).toEqual({ status: "no_match", items: [] });
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("distinguishes unavailable search from no matching guidance", async () => {
    const db = database([source("mine")]);
    db.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await retrieveKnowledgeResult(db, "company-1", "staff", "my tasks")).toEqual({ status: "unavailable", items: [] });
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("does not substitute keywords when embeddings are unconfigured", async () => {
    delete process.env.OPENAI_API_KEY;
    const db = database([source("mine")]);
    expect(await retrieveKnowledgeResult(db, "company-1", "staff", "my tasks")).toEqual({ status: "unavailable", items: [] });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
