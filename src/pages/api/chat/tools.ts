import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import { CHAT_ACCESS_ROLES } from "@/server/chatbot/accessPolicy";

const MANAGER_ROLES = new Set(["super_admin", "owner", "company_admin"]);
const OPERATIONS = new Set(["count", "list", "sum", "average"]);
const FILTER_OPERATORS = new Set(["equals", "not_equals", "is_empty", "is_not_empty"]);
const NUMERIC_TYPES = new Set(["smallint", "integer", "bigint", "numeric", "decimal", "real", "double precision"]);
const BROAD_DATA_ROLES = new Set(["owner", "company_admin", "region_admin", "sales_admin", "admin"]);
const SENSITIVE_FIELD = /(email|phone|address|notes?|amount|price|cost|earnings|wage|salary|bank|tax|invoice_url)/i;

type Source = { table: string; companyScoped: boolean; columns: Array<{ name: string; type: string }> };

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function uniqueStrings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, limit);
}

async function callerContext(db: any, userId: string) {
  const { data: profile } = await db.from("profiles").select("role, active_role, company_id").eq("id", userId).maybeSingle();
  const baseRole = String(profile?.role || "");
  const role = ["super_admin", "owner", "company_admin"].includes(baseRole)
    ? baseRole
    : String(profile?.active_role || baseRole);
  return { role, companyId: role === "super_admin" ? null : profile?.company_id || null };
}

async function sourceCatalog(db: any): Promise<Source[]> {
  const { data, error } = await db.rpc("ai_brain_dynamic_tool_sources");
  if (error || !Array.isArray(data)) return [];
  return data.map((source: any) => ({
    table: String(source.table || ""),
    companyScoped: source.companyScoped === true,
    columns: Array.isArray(source.columns)
      ? source.columns.map((column: any) => ({ name: String(column.name || ""), type: String(column.type || "") }))
      : [],
  })).filter((source: Source) => source.table && source.columns.length);
}

function dynamicToolsUnavailable(error: any): boolean {
  const text = String(error?.message || error?.details || error?.hint || error || "").toLowerCase();
  return text.includes("ai_dynamic_tools")
    || text.includes("ai_brain_dynamic_tool_sources")
    || text.includes("does not exist")
    || text.includes("could not find the table");
}

function validateDefinition(body: any, sources: Source[], context: { role: string; companyId: string | null }) {
  const name = String(body?.name || "").trim().slice(0, 80);
  const toolSlug = slug(String(body?.slug || name));
  const description = String(body?.description || "").trim().slice(0, 500);
  const tableName = String(body?.tableName || "");
  const operation = String(body?.operation || "count");
  const source = sources.find((item) => item.table === tableName);
  if (name.length < 2 || toolSlug.length < 2) throw new Error("Enter a clear tool name.");
  if (!source) throw new Error("Select an available data source.");
  if (!OPERATIONS.has(operation)) throw new Error("Select a supported result type.");

  const availableColumns = new Map(source.columns.map((column) => [column.name, column]));
  const selectedColumns = uniqueStrings(body?.selectedColumns, 12);
  if (selectedColumns.some((column) => !availableColumns.has(column))) throw new Error("One or more selected fields are unavailable.");
  if (operation === "list" && !selectedColumns.length) throw new Error("Select at least one field for a list tool.");

  const metricColumn = ["sum", "average"].includes(operation) ? String(body?.metricColumn || "") : null;
  if (metricColumn && (!availableColumns.has(metricColumn) || !NUMERIC_TYPES.has(availableColumns.get(metricColumn)?.type || ""))) {
    throw new Error("Select a number field for this calculation.");
  }
  if (["sum", "average"].includes(operation) && !metricColumn) throw new Error("Select a number field for this calculation.");

  const platform = context.role === "super_admin";
  const audienceScope = platform ? "platform" : String(body?.audienceScope || "company");
  if (!platform && !["company", "current_user"].includes(audienceScope)) throw new Error("Select a company or current-user scope.");
  if (!platform && !source.companyScoped) throw new Error("Company tools require a company-scoped source.");
  const userScopeColumn = audienceScope === "current_user" ? String(body?.userScopeColumn || "") : null;
  if (audienceScope === "current_user" && (!availableColumns.has(userScopeColumn || "") || availableColumns.get(userScopeColumn || "")?.type !== "uuid")) {
    throw new Error("Select a user ID field that identifies the signed-in user.");
  }

  const requestedRoles = uniqueStrings(body?.roles, CHAT_ACCESS_ROLES.length);
  const roles = platform
    ? ["super_admin"]
    : requestedRoles.filter((role) => role !== "super_admin" && (CHAT_ACCESS_ROLES as readonly string[]).includes(role));
  if (!roles.length) throw new Error("Select at least one role.");
  if (audienceScope === "company" && roles.some((role) => !BROAD_DATA_ROLES.has(role))) {
    const exposedFields = [...selectedColumns, metricColumn || ""];
    if (exposedFields.some((field) => SENSITIVE_FIELD.test(field))) {
      throw new Error("Personal and financial fields require current-user scope or an administrative role.");
    }
  }
  const keywords = uniqueStrings(body?.keywords, 30).map((value) => value.toLowerCase());
  if (!keywords.length) throw new Error("Add at least one phrase that should activate this tool.");

  const filters = (Array.isArray(body?.filters) ? body.filters : []).slice(0, 5).map((filter: any) => ({
    column: String(filter?.column || ""),
    operator: String(filter?.operator || ""),
    value: String(filter?.value || "").slice(0, 200),
  }));
  if (filters.some((filter: any) => !availableColumns.has(filter.column) || !FILTER_OPERATORS.has(filter.operator))) {
    throw new Error("One or more fixed filters are invalid.");
  }

  return {
    company_id: context.companyId,
    name,
    slug: toolSlug,
    description,
    table_name: tableName,
    operation,
    selected_columns: operation === "list" ? selectedColumns : [],
    metric_column: metricColumn,
    audience_scope: audienceScope,
    user_scope_column: userScopeColumn,
    filters,
    row_limit: Math.min(Math.max(Number(body?.rowLimit) || 25, 1), 100),
    roles,
    keywords,
    enabled: body?.enabled !== false,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(["GET", "POST", "PATCH", "DELETE"] as string[]).includes(req.method || "")) {
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "This tool request is not supported." });
  }
  const db = createPagesServerClient({ req, res }) as any;
  const { data: { user } } = await db.auth.getUser();
  if (!user) return res.status(401).json({ error: "Sign in first." });
  const context = await callerContext(db, user.id);
  if (!MANAGER_ROLES.has(context.role)) return res.status(403).json({ error: "Only platform admins, owners, and company admins can manage tools." });
  if (!context.companyId && context.role !== "super_admin") return res.status(400).json({ error: "Your account is not linked to a company." });

  if (req.method === "GET") {
    let toolsQuery = db.from("ai_dynamic_tools").select("id, name, slug, description, table_name, operation, selected_columns, metric_column, audience_scope, user_scope_column, filters, row_limit, roles, keywords, enabled, created_at, updated_at");
    toolsQuery = context.role === "super_admin" ? toolsQuery.is("company_id", null) : toolsQuery.eq("company_id", context.companyId);
    const [sources, toolsResult] = await Promise.all([
      sourceCatalog(db),
      toolsQuery.order("name", { ascending: true }),
    ]);
    if (toolsResult.error) {
      if (dynamicToolsUnavailable(toolsResult.error)) {
        return res.status(200).json({
          available: false,
          message: "Custom assistant tools are waiting for the latest workspace update.",
          sources: [],
          tools: [],
          platform: context.role === "super_admin",
        });
      }
      return res.status(400).json({ error: "Custom tools could not be loaded." });
    }
    return res.status(200).json({ available: true, sources, tools: toolsResult.data || [], platform: context.role === "super_admin" });
  }

  if (req.method === "POST") {
    try {
      const values = validateDefinition(req.body, await sourceCatalog(db), context);
      const { data, error } = await db.from("ai_dynamic_tools").insert({ ...values, created_by: user.id, updated_by: user.id }).select("*").single();
      if (error) return res.status(400).json({ error: error.message.includes("duplicate") ? "A tool with this name already exists." : error.message });
      return res.status(201).json({ tool: data });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "The tool could not be created." });
    }
  }

  const id = String(req.body?.id || req.query.id || "");
  if (!id) return res.status(400).json({ error: "Select a tool first." });
  if (req.method === "DELETE") {
    let deleteQuery = db.from("ai_dynamic_tools").delete().eq("id", id);
    deleteQuery = context.role === "super_admin" ? deleteQuery.is("company_id", null) : deleteQuery.eq("company_id", context.companyId);
    const { error } = await deleteQuery;
    if (error) return res.status(400).json({ error: "The tool could not be removed." });
    return res.status(200).json({ deleted: true, id });
  }

  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "Choose whether this tool is on or off." });
  let updateQuery = db.from("ai_dynamic_tools").update({ enabled: req.body.enabled, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", id);
  updateQuery = context.role === "super_admin" ? updateQuery.is("company_id", null) : updateQuery.eq("company_id", context.companyId);
  const { data, error } = await updateQuery.select("*").single();
  if (error || !data) return res.status(400).json({ error: "The tool could not be updated." });
  return res.status(200).json({ tool: data });
}

export default withApiLogging(handler);
