import type { ChatIdentity } from "./brain";

export type DynamicToolOperation = "count" | "list" | "sum" | "average";
export type DynamicToolScope = "platform" | "company" | "current_user";

export interface DynamicToolDefinition {
  id: string;
  company_id: string | null;
  name: string;
  slug: string;
  description: string;
  table_name: string;
  operation: DynamicToolOperation;
  selected_columns: string[];
  metric_column: string | null;
  audience_scope: DynamicToolScope;
  user_scope_column: string | null;
  filters: Array<{ column: string; operator: string; value?: string }>;
  row_limit: number;
  roles: string[];
  keywords: string[];
  enabled: boolean;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function scoreDynamicTool(tool: DynamicToolDefinition, message: string): number {
  const query = normalize(message);
  if (!query) return 0;
  const phrases = [tool.name, tool.slug, ...tool.keywords].map(normalize).filter(Boolean);
  return phrases.reduce((score, phrase) => {
    if (query.includes(phrase)) return score + (phrase.includes(" ") ? 4 : 2);
    const words = phrase.split(" ").filter((word) => word.length >= 3);
    return score + words.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(query)).length * 0.5;
  }, 0);
}

export function selectDynamicTools(definitions: DynamicToolDefinition[], message: string, limit = 4): DynamicToolDefinition[] {
  return definitions
    .map((tool) => ({ tool, score: scoreDynamicTool(tool, message) }))
    .filter((item) => item.score >= 2)
    .sort((left, right) => right.score - left.score || left.tool.name.localeCompare(right.tool.name))
    .slice(0, limit)
    .map((item) => item.tool);
}

export async function loadDynamicTools(db: any, identity: ChatIdentity): Promise<DynamicToolDefinition[]> {
  try {
    let query = db
      .from("ai_dynamic_tools")
      .select("id, company_id, name, slug, description, table_name, operation, selected_columns, metric_column, audience_scope, user_scope_column, filters, row_limit, roles, keywords, enabled")
      .eq("enabled", true)
      .contains("roles", [identity.role]);
    query = identity.role === "super_admin"
      ? query.is("company_id", null)
      : query.eq("company_id", identity.companyId);
    const { data, error } = await query.order("name", { ascending: true }).limit(200);
    if (error) return [];
    return (data || []).filter((tool: any) => Array.isArray(tool.roles) && tool.roles.includes(identity.role)) as DynamicToolDefinition[];
  } catch {
    // Dynamic tools are additive. Deployments remain usable before the
    // migration is applied, while built-in tools continue to work.
    return [];
  }
}

export async function runDynamicTools(db: any, identity: ChatIdentity, message: string): Promise<Record<string, any>> {
  const definitions = selectDynamicTools(await loadDynamicTools(db, identity), message);
  const results = await Promise.all(definitions.map(async (tool) => {
    try {
      const { data, error } = await db.rpc("ai_brain_run_dynamic_tool", { p_tool_id: tool.id });
      if (error || !data) return [`dynamic:${tool.id}`, null] as const;
      return [`dynamic:${tool.id}`, data] as const;
    } catch {
      return [`dynamic:${tool.id}`, null] as const;
    }
  }));
  return Object.fromEntries(results.filter(([, value]) => value != null));
}
