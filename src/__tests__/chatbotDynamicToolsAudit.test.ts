import fs from "node:fs";
import path from "node:path";
import { runDynamicTools, selectDynamicTools, type DynamicToolDefinition } from "@/server/chatbot/dynamicTools";
import { generateChatReply } from "@/server/chatbot/brain";

const tool: DynamicToolDefinition = {
  id: "11111111-1111-1111-1111-111111111111",
  company_id: "company-1",
  name: "Open order count",
  slug: "open-order-count",
  description: "Counts open company orders",
  table_name: "orders",
  operation: "count",
  selected_columns: [],
  metric_column: null,
  audience_scope: "company",
  user_scope_column: null,
  filters: [{ column: "status", operator: "equals", value: "confirmed" }],
  row_limit: 25,
  roles: ["company_admin"],
  keywords: ["how many open orders", "open order count"],
  enabled: true,
};

describe("dynamic assistant tools", () => {
  it("selects a manager-defined tool from its question phrases", () => {
    expect(selectDynamicTools([tool], "How many open orders do we have?").map((item) => item.id)).toEqual([tool.id]);
    expect(selectDynamicTools([tool], "How many customers are active?")).toEqual([]);
  });

  it("loads and executes a matching tool through the fixed database function", async () => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      contains: () => builder,
      order: () => builder,
      limit: async () => ({ data: [tool], error: null }),
    };
    const rpc = jest.fn(async () => ({
      data: { id: tool.id, name: tool.name, description: tool.description, result: { operation: "count", total: 4 } },
      error: null,
    }));
    const result = await runDynamicTools(
      { from: () => builder, rpc },
      { userId: "admin-1", companyId: "company-1", role: "company_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      "How many open orders do we have?",
    );

    expect(rpc).toHaveBeenCalledWith("ai_brain_run_dynamic_tool", { p_tool_id: tool.id });
    expect(result[`dynamic:${tool.id}`]?.result).toMatchObject({ operation: "count", total: 4 });
  });

  it("renders a count result without depending on an AI provider", async () => {
    const answer = await generateChatReply({
      identity: { userId: "admin-1", companyId: "company-1", role: "company_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "How many open orders do we have?",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({ [`dynamic:${tool.id}`]: { id: tool.id, name: tool.name, description: tool.description, result: { operation: "count", total: 4 } } })}`,
      knowledge: [],
      navigation: [],
    });

    expect(answer.provider).toBe("dynamic-live-data");
    expect(answer.rendered.message).toContain("4");
  });

  it("keeps source discovery and execution server-scoped", () => {
    const migration = fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", "20260829123000_ai_dynamic_live_tools.sql"), "utf8");
    expect(migration).toContain("security definer");
    expect(migration).toContain("ai_brain_run_dynamic_tool");
    expect(migration).toContain("company_id");
    expect(migration).toContain("auth.uid()");
    for (const blocked of ["chat_messages", "payment_gateways", "integrations", "email_settings"]) {
      expect(migration).toContain(`'${blocked}'`);
    }
    expect(migration).toContain("row_limit between 1 and 100");
  });
});
