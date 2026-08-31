import {
  defaultLiveToolPolicy,
  LIVE_TOOL_DEFINITIONS,
  type LiveToolId,
  type LiveToolPolicyMap,
} from "./liveTools";

export const CHAT_ACCESS_ROLES = [
  "owner",
  "company_admin",
  "region_admin",
  "sales_admin",
  "admin",
  "kitchen_manager",
  "kitchen_staff",
  "shopping_staff",
  "shopping",
  "driver",
  "waiter",
  "cleaning_manager",
  "cleaning_staff",
  "client",
  "staff",
  "super_admin",
] as const;

export type ChatAccessRole = (typeof CHAT_ACCESS_ROLES)[number];

export interface ChatAccessPolicy {
  role: ChatAccessRole;
  liveDataEnabled: boolean;
  toolPolicies: LiveToolPolicyMap;
  source: "database" | "default";
  updatedAt?: string | null;
}

export const CHAT_ACCESS_ROLE_DETAILS: Record<ChatAccessRole, { label: string; description: string; managedByCompany: boolean }> = {
  owner: { label: "Owner", description: "Business owner and company oversight", managedByCompany: true },
  company_admin: { label: "Company admin", description: "Company configuration and administration", managedByCompany: true },
  region_admin: { label: "Region admin", description: "Sales and operations for assigned regions", managedByCompany: true },
  sales_admin: { label: "Sales admin", description: "Leads, quotes, clients, and sales follow-up", managedByCompany: true },
  admin: { label: "Admin", description: "Day-to-day company operations", managedByCompany: true },
  kitchen_manager: { label: "Kitchen manager", description: "Kitchen production, prep, and stock", managedByCompany: true },
  kitchen_staff: { label: "Kitchen staff", description: "Assigned kitchen work and prep", managedByCompany: true },
  shopping_staff: { label: "Shopping staff", description: "Purchasing, suppliers, and stock", managedByCompany: true },
  shopping: { label: "Shopping", description: "Purchasing workspace access", managedByCompany: true },
  driver: { label: "Driver", description: "Assigned routes, deliveries, and own earnings", managedByCompany: true },
  waiter: { label: "Waiter", description: "Service work and notifications", managedByCompany: true },
  cleaning_manager: { label: "Cleaning manager", description: "Cleaning, equipment, and damage review", managedByCompany: true },
  cleaning_staff: { label: "Cleaning staff", description: "Assigned cleaning and equipment work", managedByCompany: true },
  client: { label: "Client", description: "Own bookings, invoices, and delivery updates", managedByCompany: true },
  staff: { label: "General staff", description: "Shared staff workspace access", managedByCompany: true },
  super_admin: { label: "Platform super admin", description: "Platform-level access is controlled centrally", managedByCompany: false },
};

function defaultPolicy(role: string): ChatAccessPolicy {
  const safeRole = (CHAT_ACCESS_ROLES as readonly string[]).includes(role) ? role as ChatAccessRole : "staff";
  return { role: safeRole, liveDataEnabled: true, toolPolicies: defaultLiveToolPolicy(safeRole), source: "default" };
}

async function readToolPolicies(db: any, companyId: string | null, role: ChatAccessRole): Promise<{ policies: LiveToolPolicyMap; hasDatabaseRows: boolean }> {
  const fallback = defaultLiveToolPolicy(role);
  try {
    let query = db.from("ai_brain_tool_policies").select("tool_id, enabled").eq("role", role);
    query = companyId ? query.eq("company_id", companyId) : query.is("company_id", null);
    const { data, error } = await query;
    if (error) return { policies: fallback, hasDatabaseRows: false };
    const policies = { ...fallback };
    for (const row of data || []) {
      if ((LIVE_TOOL_DEFINITIONS as any[]).some((tool) => tool.id === row.tool_id)) {
        policies[row.tool_id as LiveToolId] = row.enabled !== false;
      }
    }
    return { policies, hasDatabaseRows: (data || []).length > 0 };
  } catch {
    return { policies: fallback, hasDatabaseRows: false };
  }
}

export async function getChatAccessPolicy(db: any, companyId: string | null, role: string): Promise<ChatAccessPolicy> {
  const fallback = defaultPolicy(role);
  if (!companyId && fallback.role !== "super_admin") return fallback;
  const toolState = await readToolPolicies(db, companyId, fallback.role);
  try {
    let query = db.from("ai_brain_access_policies").select("role, live_data_enabled, updated_at").eq("role", fallback.role);
    query = companyId ? query.eq("company_id", companyId) : query.is("company_id", null);
    const { data, error } = await query.maybeSingle();
    if (error || !data) return { ...fallback, toolPolicies: toolState.policies, source: toolState.hasDatabaseRows ? "database" : "default" };
    return {
      role: fallback.role,
      liveDataEnabled: data.live_data_enabled !== false,
      toolPolicies: toolState.policies,
      source: "database",
      updatedAt: data.updated_at || null,
    };
  } catch {
    // The app remains usable before the migration is deployed. Once the
    // table exists, the company policy becomes authoritative automatically.
    return { ...fallback, toolPolicies: toolState.policies, source: toolState.hasDatabaseRows ? "database" : "default" };
  }
}

export async function listChatAccessPolicies(db: any, companyId: string | null): Promise<ChatAccessPolicy[]> {
  const defaults = CHAT_ACCESS_ROLES.map((role) => defaultPolicy(role));
  try {
    let accessQuery = db.from("ai_brain_access_policies").select("role, live_data_enabled, updated_at");
    accessQuery = companyId ? accessQuery.eq("company_id", companyId) : accessQuery.is("company_id", null);
    const { data, error } = await accessQuery;
    if (error) return defaults;
    const byRole = new Map<string, any>((data || []).map((row: any) => [String(row.role), row]));
    let toolQuery = db.from("ai_brain_tool_policies").select("role, tool_id, enabled");
    toolQuery = companyId ? toolQuery.eq("company_id", companyId) : toolQuery.is("company_id", null);
    const toolRows = await toolQuery;
    const toolsByRole = new Map<string, LiveToolPolicyMap>();
    for (const row of toolRows.data || []) {
      const current = toolsByRole.get(String(row.role)) || {};
      current[row.tool_id as LiveToolId] = row.enabled !== false;
      toolsByRole.set(String(row.role), current);
    }
    return defaults.map((fallback) => {
      const row = byRole.get(fallback.role);
      const toolPolicies = { ...fallback.toolPolicies, ...(toolsByRole.get(fallback.role) || {}) };
      return row
        ? { ...fallback, liveDataEnabled: row.live_data_enabled !== false, toolPolicies, source: "database", updatedAt: row.updated_at || null }
        : { ...fallback, toolPolicies, source: toolsByRole.has(fallback.role) ? "database" : "default" };
    });
  } catch {
    return defaults;
  }
}
