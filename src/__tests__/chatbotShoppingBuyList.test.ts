import { generateChatReply } from "@/server/chatbot/brain";
import { getLiveToolDefinition, runLiveTool, selectLiveTools } from "@/server/chatbot/liveTools";

const identity = {
  userId: "shopper-1",
  companyId: "company-1",
  role: "shopping_staff",
  fullName: "Shopper Test",
  regionId: null,
  regionsCovered: [] as string[],
};

const lists = [
  { id: "team-list", title: "Team list", list_date: "2026-10-19", status: "in_progress", shopper_id: null },
  { id: "done-list", title: "Last week", list_date: "2026-10-12", status: "completed", shopper_id: "shopper-1" },
];
const items = [
  { shopping_list_id: "team-list", name: "Boerewors", quantity: 10, unit: "kg", category: "Meat", estimated_cost: 900, notes: null, assigned_shopper_id: null },
];

function fakeDb(calls: Record<string, any[]>) {
  return {
    from(table: string) {
      const log: any[] = [];
      (calls[table] ||= []).push(log);
      const chain: any = {};
      for (const m of ["select", "eq", "or", "in", "is", "not", "order", "limit", "gte", "lte", "lt", "gt"]) {
        chain[m] = (...args: any[]) => { log.push([m, ...args]); return chain; };
      }
      chain.then = (resolve: any) => resolve({ data: table === "shopping_lists" ? lists : table === "shopping_list_items" ? items : [], error: null });
      return chain;
    },
  };
}

describe("shopping chatbot buy list", () => {
  it("a shopper's own work includes the shared team list and what is left to buy on it", async () => {
    const calls: Record<string, any[]> = {};
    const result = await runLiveTool(fakeDb(calls), identity, getLiveToolDefinition("staff_orders")!, "what do I still need to buy");

    const listQuery = calls.shopping_lists[0];
    expect(listQuery).toContainEqual(["or", "shopper_id.eq.shopper-1,shopper_id.is.null"]);
    expect(listQuery.some(([m, col]: any[]) => m === "eq" && col === "shopper_id")).toBe(false);

    const itemQuery = calls.shopping_list_items[0];
    expect(itemQuery).toContainEqual(["in", "shopping_list_id", ["team-list"]]);
    expect(itemQuery).toContainEqual(["not", "purchased", "is", true]);
    expect(itemQuery).toContainEqual(["is", "removed_at", null]);

    const team = result.tasks.find((t: any) => t.id === "team-list");
    expect(team.items_left_to_buy).toEqual([expect.objectContaining({ name: "Boerewors", quantity: 10 })]);
    expect(result.tasks.find((t: any) => t.id === "done-list").items_left_to_buy).toBeUndefined();
  });

  it("the shopping lists tool also carries the open lines", async () => {
    const result = await runLiveTool(fakeDb({}), identity, getLiveToolDefinition("shopping_lists")!, "show my shopping list");
    expect(result.find((l: any) => l.id === "team-list").items_left_to_buy).toHaveLength(1);
  });

  it("answers what is still to buy from the live lines", async () => {
    const answer = await generateChatReply({
      identity,
      message: "What do I still need to buy?",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS (queried at 2026-10-19T00:00:00.000Z):\n${JSON.stringify({
        shopping_lists: [
          { ...lists[0], items_left_to_buy: [{ name: "Boerewors", quantity: 10, unit: "kg", assigned_shopper_id: "shopper-1" }] },
          lists[1],
        ],
      })}`,
      knowledge: [],
      navigation: [],
    });
    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.message).toContain("1 item still to buy across 1 open shopping list");
    const text = JSON.stringify(answer.rendered);
    expect(text).toContain("Boerewors - 10 kg (you claimed this)");
    expect(text).toContain("team list");
  });

  it("leaves how-to questions to the guided answer", async () => {
    const answer = await generateChatReply({
      identity,
      message: "How do I mark an item as bought?",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS (queried at 2026-10-19T00:00:00.000Z):\n${JSON.stringify({ shopping_lists: [{ ...lists[0], items_left_to_buy: [] }] })}`,
      knowledge: [],
      navigation: [],
    });
    expect(answer.rendered.title).not.toBe("Still to buy");
  });

  it("asking what to buy picks a tool that can answer it", () => {
    const ids = selectLiveTools("shopping_staff", "What do I still need to buy on my shopping list?").map((t) => t.id);
    expect(ids.some((id) => id === "shopping_lists" || id === "staff_orders")).toBe(true);
  });
});
