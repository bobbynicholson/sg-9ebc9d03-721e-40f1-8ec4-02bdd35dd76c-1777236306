import { classifyChatIntentWithOpenAI } from "@/server/chatbot/intentClassifier";
import { routeChatQuestion } from "@/server/chatbot/router";
import { selectLiveTools, getLiveToolDefinition, runLiveTool } from "@/server/chatbot/liveTools";
import { generateChatReply } from "@/server/chatbot/brain";
import { chatCompletion } from "@/lib/ai/textLlm";
import { getChatRoleDefinition } from "@/lib/chatbot/roleContext";
import { getRelevantNavigation } from "@/lib/chatbot/navigation";
import { selectDynamicTools } from "@/server/chatbot/dynamicTools";

jest.mock("@/lib/ai/textLlm", () => ({ chatCompletion: jest.fn(), textProviderOrder: jest.fn(() => []), billedCostUsd: jest.fn() }));
jest.mock("@/lib/ai/usageLog", () => ({ recordAiUsage: jest.fn() }));

const originalEnvironment = { ...process.env };
const originalFetch = global.fetch;

beforeEach(() => {
  for (const key of ["OPENROUTER_API_KEY", "GROQ_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[key];
  process.env.OPENAI_API_KEY = "test-key";
  jest.mocked(chatCompletion).mockReset();
});

afterEach(() => {
  global.fetch = originalFetch;
  for (const key of ["OPENAI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "ANTHROPIC_API_KEY"]) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
});

const cases = [
  ["super_admin", "platform_dashboard_metrics", "How are things going across the service?"],
  ["owner", "customer_summary", "Who is still doing business with us?"],
  ["company_admin", "customer_summary", "Who is still doing business with us?"],
  ["admin", "customer_summary", "Who is still doing business with us?"],
  ["region_admin", "customer_bookings", "What is coming up around here?"],
  ["sales_admin", "customer_bookings", "Which celebrations have people arranged?"],
  ["kitchen_manager", "kitchen_inventory", "Will we run out before everyone is fed?"],
  ["kitchen_staff", "kitchen_inventory", "Will we run out before everyone is fed?"],
  ["shopping", "shopping_lists", "What has not made it into the trolley yet?"],
  ["shopping_staff", "shopping_lists", "What has not made it into the trolley yet?"],
  ["driver", "driver_earnings", "What did I bring home for the time I put in?"],
  ["waiter", "waiter_service_assignments", "Where am I meant to be serving and when?"],
  ["cleaning_manager", "cleaning_work_tasks", "Anything still wet or waiting for inspection?"],
  ["cleaning_staff", "cleaning_work_tasks", "Anything still wet or waiting for inspection?"],
  ["client", "customer_invoices", "Do I still owe you anything?"],
  ["staff", "staff_orders", "What am I meant to get done?"],
] as const;

describe("semantic understanding through grounded model output", () => {
  it.each(cases)("uses the semantic capability for %s and formats the provider answer", async (role, toolId, question) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({
      intent_id: `data.${toolId}`, confidence: 0.96, time_range: "today", scope: "self", needs_clarification: false,
      retrieval_query: question, needs_knowledge: false, clarification_question: "",
    }) }) }) as any;
    const intent = await classifyChatIntentWithOpenAI(question, role);
    expect(intent).not.toBeNull();
    const route = routeChatQuestion(question, role, intent);
    expect(route.useLiveData).toBe(true);
    const selected = selectLiveTools(role, question, {}, intent);
    expect(selected.map((tool) => tool.id)).toContain(toolId);
    expect(selected.filter((tool) => ![toolId, "current_user_profile", "company_profile"].includes(tool.id))).toEqual([]);
    jest.mocked(chatCompletion).mockResolvedValue({ content: JSON.stringify({
      title: "Your next step", message: "Here is the information for your work.", details: ["Verified task detail"],
      actions: [{ label: "Invented action", action: "delete_everything" }],
    }) } as any);
    const answer = await generateChatReply({
      identity: { userId: "user-1", companyId: role === "super_admin" ? null : "company-1", role, fullName: "Alex", regionId: null, regionsCovered: [] },
      message: question, history: [], knowledge: [], navigation: [], route,
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({ [toolId]: { detail: "Verified task detail" } })}`,
    });
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    const system = jest.mocked(chatCompletion).mock.calls[0][0].messages[0].content;
    expect(system).toContain(`User role: ${getChatRoleDefinition(role).label}`);
    expect(system).toContain("Verified task detail");
    expect(system).toContain("Do not assume they understand other departments");
    expect(answer).toMatchObject({ provider: "openai", rendered: { message: "Here is the information for your work.", details: ["Verified task detail"], actions: [] } });
  });

  it("does not let lexical matches override semantic tool selection or disabled tools", async () => {
    const intent = { id: "data.kitchen_inventory", domain: "kitchen", action: "read", entity: "inventory", toolIds: ["kitchen_inventory"], navigationRefs: ["kitchen.stock"], confidence: 0.96, normalizedMessage: "", matchedBy: "semantic" } as const;
    const match = { ...intent, toolIds: [...intent.toolIds], navigationRefs: [...intent.navigationRefs] };
    const question = "team schedule notifications shift hours";
    expect(routeChatQuestion(question, "kitchen_staff", match).route).toBe("live_data");
    expect(selectLiveTools("kitchen_staff", question, {}, match).map((tool) => tool.id)).not.toContain("staff_shift_schedule");
    expect(selectLiveTools("kitchen_staff", question, { kitchen_inventory: false }, match)).toEqual([]);
    expect(getRelevantNavigation(question, "kitchen_staff", 3, undefined, match).map((item) => item.ref)).toEqual(["kitchen.stock"]);
    expect(selectDynamicTools([{ id: "custom", enabled: true, name: "team schedule", keywords: ["team schedule"] } as any], question, 4, match)).toEqual([]);
  });

  it("uses hybrid retrieval when meaning calls for current records and instructions", () => {
    const match: any = { id: "data.cleaning_work_tasks", action: "read", toolIds: ["cleaning_work_tasks"], navigationRefs: [], confidence: 0.9, matchedBy: "semantic", needsKnowledge: true };
    expect(routeChatQuestion("What needs my attention and how should I handle it?", "cleaning_staff", match)).toMatchObject({ route: "hybrid", useLiveData: true, useKnowledge: true });
  });

  it("does not infer live data from keywords after semantic understanding fails", () => {
    expect(routeChatQuestion("show today's stock and payroll", "staff", null)).toMatchObject({ useLiveData: false, useKnowledge: true });
    expect(getRelevantNavigation("open all companies", "staff", 3, undefined, null)).toEqual([]);
  });

  it("asks one contextual question instead of expecting a worker to know the whole system", async () => {
    const intent: any = { id: "account.help", entity: "help", action: "explain", toolIds: [], navigationRefs: [], confidence: 0.9, matchedBy: "semantic", needsClarification: true, clarificationQuestion: "Which event are you working at?" };
    const answer = await generateChatReply({ identity: { userId: "waiter-1", companyId: "company-1", role: "waiter", fullName: "Alex", regionId: null, regionsCovered: [] }, message: "What about that one?", history: [], liveContext: "", knowledge: [], route: routeChatQuestion("What about that one?", "waiter", intent) });
    expect(answer.rendered.details).toEqual(["Which event are you working at?"]);
    expect(answer.text).not.toContain("wider company records");
    expect(chatCompletion).not.toHaveBeenCalled();
  });
});

function scopedDatabase(tables: Record<string, any[]>) {
  const from = jest.fn((table: string) => {
    let result = [...(tables[table] || [])];
    const query: any = {
      select: () => query, order: () => query, limit: () => query,
      eq: (field: string, value: any) => { result = result.filter((row) => row[field] === value); return query; },
      is: (field: string, value: any) => { result = result.filter((row) => (row[field] ?? null) === value); return query; },
      in: (field: string, values: any[]) => { result = result.filter((row) => values.includes(row[field])); return query; },
      then: (resolve: (value: any) => void) => resolve({ data: result, error: null }),
    };
    return query;
  });
  return { from };
}

describe("implemented workers' personal assignments", () => {
  it("loads general staff work from their own shifts and tasks", async () => {
    const db = scopedDatabase({
      kitchen_shifts: [
        { id: "mine", company_id: "company-1", staff_id: "staff-1", shift_date: "2026-11-24", shift_type: "general" },
        { id: "other-user", company_id: "company-1", staff_id: "staff-2", shift_type: "general" },
        { id: "other-company", company_id: "company-2", staff_id: "staff-1", shift_type: "general" },
      ],
      staff_shift_tasks: [
        { id: "my-task", company_id: "company-1", shift_id: "mine", task_type: "setup" },
        { id: "private-task", company_id: "company-1", shift_id: "other-user", task_type: "setup" },
      ],
    });
    const result = await runLiveTool(db, { userId: "staff-1", companyId: "company-1", role: "staff", fullName: "Alex", regionId: null, regionsCovered: [] }, getLiveToolDefinition("staff_orders")!);
    expect(result.tasks.map((task: any) => task.id).sort()).toEqual(["mine", "my-task"]);
    expect(result.orders).toEqual([]);
  });

  it("loads only the signed-in waiter's service record and linked event", async () => {
    const db = scopedDatabase({
      event_attendance: [
        { id: "mine", company_id: "company-1", waiter_id: "waiter-1", order_id: "event-1", notes: "Set up the service station" },
        { id: "other-user", company_id: "company-1", waiter_id: "waiter-2", order_id: "event-2" },
        { id: "other-company", company_id: "company-2", waiter_id: "waiter-1", order_id: "event-3" },
      ],
      orders: [
        { id: "event-1", company_id: "company-1", event_name: "Reception", guest_count: 60 },
        { id: "event-2", company_id: "company-1", event_name: "Private event" },
      ],
    });
    const result = await runLiveTool(db, { userId: "waiter-1", companyId: "company-1", role: "waiter", fullName: "Alex", regionId: null, regionsCovered: [] }, getLiveToolDefinition("waiter_service_assignments")!);
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]).toMatchObject({ id: "mine", notes: "Set up the service station", order: { event_name: "Reception" } });
    expect(JSON.stringify(result)).not.toContain("Private event");
  });
});
