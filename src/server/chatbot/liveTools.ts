/*
 * Read-only live-data tool registry for the assistant.
 *
 * These are application-owned query tools, not SQL tools. Every tool fixes
 * its table, columns, tenant filter, and role scope in server code. The model
 * receives the result, never credentials, a database schema, or raw SQL.
 */
import type { ChatIdentity } from "./brain";
import { runDynamicTools } from "./dynamicTools";
import { currencyMonitoringService } from "@/services/currencyMonitoringService";
import { getPlatformTechnologyCostSummary } from "@/services/platformTechnologyCostService";
import { getServiceSupabase } from "@/lib/supabase/service";

export type LiveToolId =
  | "current_user_profile"
  | "company_profile"
  | "company_subscription"
  | "registered_companies"
  | "platform_user_count"
  | "platform_pending_invitations"
  | "platform_company_owners"
  | "supported_currencies"
  | "platform_latest_exchange_rates"
  | "platform_currency_thresholds"
  | "platform_technology_costs"
  | "platform_trial_expiry"
  | "platform_tenant_health"
  | "platform_audit_events"
  | "platform_ai_brain_sources"
  | "platform_ai_access"
  | "company_ai_access"
  | "active_subscription_plans"
  | "platform_dashboard_metrics"
  | "dashboard_stats"
  | "customer_summary"
  | "customer_profile"
  | "customer_bookings"
  | "customer_invoices"
  | "assigned_deliveries"
  | "delivery_orders"
  | "kitchen_orders"
  | "kitchen_prep_tasks"
  | "kitchen_inventory"
  | "shopping_inventory"
  | "shopping_lists"
  | "cleaning_equipment"
  | "cleaning_damage_reports"
  | "sales_orders"
  | "sales_quotes"
  | "sales_leads"
  | "operations_orders"
  | "operations_inventory"
  | "admin_invoices"
  | "team_members"
  | "staff_orders"
  | "user_notifications";

export type LiveToolCategory = "identity" | "analytics" | "sales" | "operations" | "finance" | "people";

export interface LiveToolDefinition {
  id: LiveToolId;
  label: string;
  description: string;
  /** Human-readable business scope; physical tables and SQL stay server-side. */
  dataScope: string;
  category: LiveToolCategory;
  roles: string[];
  keywords: string[];
}

export type LiveToolPolicyMap = Partial<Record<LiveToolId, boolean>>;

const ADMIN = ["super_admin", "owner", "company_admin"];
const SALES = ["super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin"];
const OPERATIONS = ["super_admin", "owner", "company_admin", "admin"];
const KITCHEN = ["super_admin", "owner", "company_admin", "admin", "kitchen_manager", "kitchen_staff"];
const SHOPPING = ["super_admin", "owner", "company_admin", "admin", "shopping_staff", "shopping"];
const CLEANING = ["super_admin", "owner", "company_admin", "admin", "cleaning_manager", "cleaning_staff"];
const DRIVER = ["super_admin", "owner", "company_admin", "admin", "driver"];
const CLIENT = ["client"];
const SHARED_STAFF = ["staff", "waiter"];
const CUSTOMER_ACCESS = ["owner", "company_admin", "region_admin", "sales_admin", "admin"];

const BASE_LIVE_TOOL_DEFINITIONS = [
  { id: "current_user_profile", label: "Current user profile", description: "The signed-in user's name, email, role, and account status", category: "identity", roles: ["super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin", "kitchen_manager", "kitchen_staff", "shopping_staff", "shopping", "driver", "waiter", "cleaning_manager", "cleaning_staff", "client", "staff"], keywords: ["my details", "my profile", "my account", "who am i", "my role", "my email", "user details"] },
  { id: "company_profile", label: "Company profile", description: "Company identity, plan, currency, and operating context", category: "identity", roles: [...ADMIN, ...SALES, ...KITCHEN, ...SHOPPING, ...CLEANING, ...DRIVER, ...CLIENT, ...SHARED_STAFF], keywords: ["company", "business", "currency", "plan"] },
  { id: "company_subscription", label: "Current subscription", description: "The signed-in company's current subscription status and plan", category: "finance", roles: ADMIN, keywords: ["subscription", "subscriptions", "plan", "plans", "active plan", "current plan", "billing plan"] },
  { id: "registered_companies", label: "Registered companies", description: "Platform-wide count and subscription breakdown of non-deleted tenant companies", category: "analytics", roles: ["super_admin"], keywords: ["companies", "company count", "registered", "tenants", "tenant count", "how many companies", "cancelled companies", "canceled companies", "recently cancelled", "churned companies"] },
  { id: "platform_user_count", label: "Platform user count", description: "Platform-wide count of user accounts listed in user management", category: "analytics", roles: ["super_admin"], keywords: ["users", "user count", "platform users", "user accounts", "how many users", "number of users"] },
  { id: "platform_pending_invitations", label: "Pending invitations", description: "Platform-wide user invitations that have not yet been accepted", category: "people", roles: ["super_admin"], keywords: ["invitation", "invitations", "pending invitations", "pending invitation", "invite pending", "pending invites", "unaccepted invitations", "unaccepted invites", "invitations still pending", "which invitations"] },
  { id: "platform_company_owners", label: "Company owners", description: "The current owner linked to each non-deleted company, visible only to super_admin", category: "people", roles: ["super_admin"], keywords: ["company owners", "owners", "owner list", "owners list", "who owns", "owner of"] },
  { id: "supported_currencies", label: "Supported currencies", description: "Currencies currently configured for platform regions or exchange-rate monitoring", category: "analytics", roles: ["super_admin"], keywords: ["currencies", "supported currency", "supported currencies", "available currency", "available currencies", "which currencies", "currency support"] },
  { id: "platform_latest_exchange_rates", label: "Latest exchange rates", description: "The latest stored exchange rates from platform currency monitoring", category: "analytics", roles: ["super_admin"], keywords: ["exchange rate", "exchange rates", "currency rate", "currency rates", "latest rates", "current rates", "latest exchange rates", "current exchange rates"] },
  { id: "platform_currency_thresholds", label: "Currency threshold status", description: "The current 90-day currency review threshold and whether it has been exceeded", category: "analytics", roles: ["super_admin"], keywords: ["currency threshold", "currency thresholds", "threshold exceeded", "thresholds exceeded", "currency fluctuation", "significant currency change", "15% threshold", "currency review"] },
  { id: "platform_technology_costs", label: "Technology costs", description: "Estimated platform technology costs, cost per company, revenue margin, service breakdown, and data limitations", category: "analytics", roles: ["super_admin"], keywords: ["technology costs", "technology cost", "tech costs", "tech-stack costs", "service costs", "operating costs", "infrastructure cost", "cost per tenant", "average cost per tenant", "highest infrastructure cost", "most expensive tenant", "most expensive tenants", "cost trend", "costs changed", "current margin"] },
  { id: "platform_trial_expiry", label: "Trial expiry", description: "Current trial companies and the trial end dates recorded for them", category: "analytics", roles: ["super_admin"], keywords: ["trial expiry", "trial expires", "trials expire", "expiring trials", "trials expiring soon", "expire this week", "expiring soon"] },
  { id: "platform_tenant_health", label: "Company health", description: "Current onboarding, inactivity, and payment setup issues across companies", category: "analytics", roles: ["super_admin"], keywords: ["company health", "tenant health", "health issues", "stuck onboarding", "incomplete onboarding", "missing configuration", "payment issue", "payment issues", "payment gateway"] },
  { id: "platform_audit_events", label: "Platform activity", description: "Recent platform activity records with safe filters for company, user, action, date, and failure state", category: "analytics", roles: ["super_admin"], keywords: ["audit log", "audit logs", "audit events", "audit trail", "recent changes", "latest platform events", "company changes", "subscription changes", "pricing changes", "permission changes", "failed actions", "suspicious actions", "who changed", "when was"] },
  { id: "platform_ai_brain_sources", label: "AI Brain sources", description: "Approved platform knowledge sources and their ready, pending, or failed indexing status", category: "analytics", roles: ["super_admin"], keywords: ["ai brain", "approved knowledge", "knowledge sources", "approved sources", "ready sources", "failed sources", "sources failed", "source sync", "source indexing", "unsafe content", "company-only information"] },
  { id: "platform_ai_access", label: "AI access", description: "Role-level live-data access and approved tool permissions for the platform assistant", category: "analytics", roles: ["super_admin"], keywords: ["ai access", "live-data access", "live data access", "enabled live tools", "access settings", "role access", "role controls", "assistant access", "whole database", "unrestricted sql"] },
  { id: "company_ai_access", label: "Company AI access", description: "Role-level live-data access and approved tool permissions for this company", category: "analytics", roles: ["owner", "company_admin"], keywords: ["ai access", "live-data access", "live data access", "enabled live tools", "access settings", "role access", "role controls", "assistant access", "whole database", "unrestricted sql"] },
  { id: "active_subscription_plans", label: "Active subscription plans", description: "Active platform subscription plan names and companies currently using them", category: "analytics", roles: ["super_admin"], keywords: ["subscription plans", "active plans", "plans", "plan usage", "companies per plan", "companies by plan", "plan breakdown", "each plan", "use each plan", "pricing tiers", "companies use each tier", "subscription", "active"] },
  { id: "platform_dashboard_metrics", label: "Platform dashboard metrics", description: "Current platform totals, subscription mix, recurring revenue, churn, and conversion metrics", category: "analytics", roles: ["super_admin"], keywords: ["platform overview", "platform summary", "platform metrics", "platform dashboard", "complete platform overview", "whole platform"] },
  { id: "dashboard_stats", label: "Dashboard stats", description: "Current counts for orders, leads, quotes, and inventory", category: "analytics", roles: ADMIN, keywords: ["dashboard", "summary", "overview", "how many", "count", "stats", "today", "this week", "this month", "cancell"] },
  { id: "customer_summary", label: "Customer summary", description: "Current company customer totals, active status, and customer names", category: "analytics", roles: CUSTOMER_ACCESS, keywords: ["customer", "customers", "client", "clients", "active customer", "active customers", "current customer", "current customers", "registered client", "customer count"] },
  { id: "customer_profile", label: "Customer profile", description: "A client’s own profile or approved customer details", category: "identity", roles: [...CLIENT, ...SALES], keywords: ["customer", "client", "contact", "profile", "john", "details"] },
  { id: "customer_bookings", label: "Customer bookings", description: "Bookings and events visible to the signed-in user or sales team", category: "operations", roles: [...CLIENT, ...SALES], keywords: ["booking", "bookings", "event", "order", "appointment", "reservation"] },
  { id: "customer_invoices", label: "Customer invoices", description: "Invoices, balances, and payment status visible to the signed-in user", category: "finance", roles: [...CLIENT, ...SALES], keywords: ["invoice", "invoices", "billing", "payment", "balance", "paid", "due"] },
  { id: "assigned_deliveries", label: "Assigned deliveries", description: "The signed-in driver’s delivery assignments and earnings", category: "operations", roles: DRIVER, keywords: ["delivery", "deliveries", "route", "assignment", "assigned", "earnings", "driving"] },
  { id: "delivery_orders", label: "Delivery order details", description: "Order and venue details for approved delivery work", category: "operations", roles: DRIVER, keywords: ["delivery", "venue", "address", "order details", "guest"] },
  { id: "kitchen_orders", label: "Kitchen orders", description: "Confirmed and active orders used for kitchen production", category: "operations", roles: KITCHEN, keywords: ["kitchen", "production", "order", "prep", "ready", "cooking"] },
  { id: "kitchen_prep_tasks", label: "Kitchen prep tasks", description: "Prep tasks, assignments, schedules, and completion status", category: "operations", roles: KITCHEN, keywords: ["prep", "task", "tasks", "chef", "production"] },
  { id: "kitchen_inventory", label: "Kitchen inventory", description: "Stock levels and reorder thresholds used for prep", category: "operations", roles: KITCHEN, keywords: ["stock", "inventory", "ingredient", "shortage", "reorder"] },
  { id: "shopping_inventory", label: "Shopping inventory", description: "Purchasing stock, par levels, and reorder context", category: "operations", roles: SHOPPING, keywords: ["stock", "inventory", "restock", "buy", "shortage", "supplier"] },
  { id: "shopping_lists", label: "Shopping lists", description: "Purchase lists, totals, status, and notes", category: "operations", roles: SHOPPING, keywords: ["shopping", "purchase", "buy list", "supplier", "receipt"] },
  { id: "cleaning_equipment", label: "Cleaning equipment", description: "Equipment condition, availability, and cleaning status", category: "operations", roles: CLEANING, keywords: ["equipment", "cleaning", "available", "condition", "return"] },
  { id: "cleaning_damage_reports", label: "Damage reports", description: "Recent equipment damage and resolution status", category: "operations", roles: CLEANING, keywords: ["damage", "damaged", "broken", "missing", "repair"] },
  { id: "sales_orders", label: "Sales orders", description: "Orders visible to sales and regional administration", category: "sales", roles: SALES, keywords: ["order", "orders", "booking", "revenue", "event"] },
  { id: "sales_quotes", label: "Sales quotes", description: "Quotes, values, statuses, and validity dates", category: "sales", roles: SALES, keywords: ["quote", "quotes", "proposal", "valid", "value"] },
  { id: "sales_leads", label: "Sales leads", description: "Leads, sources, assignments, and follow-up state", category: "sales", roles: SALES, keywords: ["lead", "leads", "enquiry", "enquiries", "follow up", "whatsapp"] },
  { id: "operations_orders", label: "Operations orders", description: "Company-wide order readiness and operational status", category: "operations", roles: OPERATIONS, keywords: ["order", "orders", "operation", "status", "readiness", "dispatch", "appointment", "tomorrow", "today", "this month", "cancell"] },
  { id: "operations_inventory", label: "Operations inventory", description: "Company-wide stock levels and reorder context", category: "operations", roles: OPERATIONS, keywords: ["inventory", "stock", "shortage", "reorder"] },
  { id: "admin_invoices", label: "Admin invoices", description: "Company invoice ledger, balances, and payment status", category: "finance", roles: ADMIN, keywords: ["invoice", "invoices", "finance", "financial", "balance", "payment", "revenue"] },
  { id: "team_members", label: "Team members", description: "Company staff directory and role context", category: "people", roles: ADMIN, keywords: ["team", "staff", "employee", "member", "driver", "chef"] },
  { id: "staff_orders", label: "My work orders", description: "Orders and events assigned to the signed-in staff member", category: "operations", roles: SHARED_STAFF, keywords: ["order", "orders", "event", "job", "assignment", "work"] },
  { id: "user_notifications", label: "My notifications", description: "Notifications addressed to the signed-in user", category: "identity", roles: [...ADMIN, ...SALES, ...KITCHEN, ...SHOPPING, ...CLEANING, ...DRIVER, ...CLIENT, ...SHARED_STAFF], keywords: ["notification", "notifications", "alert", "alerts", "message", "updates"] },
];

const LIVE_TOOL_DATA_SCOPES: Record<LiveToolId, string> = {
  current_user_profile: "Only the signed-in user's own profile and account status",
  company_profile: "This company's identity, plan, currency, and operating status",
  company_subscription: "The signed-in company's current subscription record and status",
  registered_companies: "Platform-wide count and subscription breakdown of non-deleted tenant companies, visible only to super_admin",
  platform_user_count: "Platform-wide count of user accounts listed in user management, visible only to super_admin",
  platform_pending_invitations: "Platform-wide user invitations that have not yet been accepted, visible only to super_admin",
  platform_company_owners: "The owner linked to each non-deleted company, visible only to super_admin",
  supported_currencies: "Currencies currently configured for platform regions or exchange-rate monitoring, visible only to super_admin",
  platform_latest_exchange_rates: "Latest stored exchange rates from platform currency monitoring, visible only to super_admin",
  platform_currency_thresholds: "Current currency review threshold and 90-day movement, visible only to super_admin",
  platform_technology_costs: "Estimated platform technology costs and margin, visible only to super_admin",
  platform_trial_expiry: "Trial companies and trial end dates, visible only to super_admin",
  platform_tenant_health: "Company onboarding, inactivity, and payment setup health, visible only to super_admin",
  platform_audit_events: "Safe platform activity records and failure signals, visible only to super_admin",
  platform_ai_brain_sources: "Platform knowledge source names, scope, and indexing status, visible only to super_admin",
  platform_ai_access: "Platform assistant role access and approved named tools, visible only to super_admin",
  company_ai_access: "This company's assistant role access and approved named tools, visible only to owners and company administrators",
  active_subscription_plans: "Active platform subscription plan names and the non-deleted companies currently using them, visible only to super_admin",
  platform_dashboard_metrics: "Platform-wide totals, subscription mix, recurring revenue, churn, and conversion metrics, visible only to super_admin",
  dashboard_stats: "Company-level aggregate counts for orders, leads, quotes, and inventory",
  customer_summary: "Company customer totals and names, excluding removed customer records",
  customer_profile: "The client's own profile, or approved customer contact details for sales roles",
  customer_bookings: "The client's own bookings, or company bookings permitted for sales roles",
  customer_invoices: "The client's own invoices and payment status, or approved sales visibility",
  assigned_deliveries: "Only deliveries assigned to the signed-in driver",
  delivery_orders: "Only order and venue details linked to the driver's assignments",
  kitchen_orders: "Confirmed and active company orders needed for kitchen production",
  kitchen_prep_tasks: "Kitchen prep tasks, assignments, schedules, and completion status",
  kitchen_inventory: "Kitchen stock levels, ingredients, and reorder thresholds",
  shopping_inventory: "Purchasing stock, par levels, shortages, and reorder context",
  shopping_lists: "Company purchase lists, totals, status, and procurement notes",
  cleaning_equipment: "Equipment condition, availability, and cleaning status",
  cleaning_damage_reports: "Company equipment damage reports and resolution status",
  sales_orders: "Company sales orders, filtered by assigned region where applicable",
  sales_quotes: "Company quotes, values, statuses, and validity dates",
  sales_leads: "Company leads, sources, assignments, and follow-up state",
  operations_orders: "Company order readiness and operational status, including scheduling",
  operations_inventory: "Company-wide stock levels, shortages, and reorder context",
  admin_invoices: "Company invoice ledger, balances, payment status, and revenue context",
  team_members: "Company staff directory and role context; no unrelated tenants",
  staff_orders: "Only work orders and events assigned to the signed-in staff member",
  user_notifications: "Only notifications addressed to the signed-in user",
};

export const LIVE_TOOL_DEFINITIONS: LiveToolDefinition[] = BASE_LIVE_TOOL_DEFINITIONS.map((tool) => ({
  ...tool,
  id: tool.id as LiveToolId,
  category: tool.category as LiveToolCategory,
  dataScope: LIVE_TOOL_DATA_SCOPES[tool.id as LiveToolId],
}));

const definitionById = new Map(LIVE_TOOL_DEFINITIONS.map((tool) => [tool.id, tool]));

export function getLiveToolDefinition(id: string): LiveToolDefinition | null {
  return definitionById.get(id as LiveToolId) || null;
}

export function getLiveToolsForRole(role: string): LiveToolDefinition[] {
  return LIVE_TOOL_DEFINITIONS.filter((tool) => tool.roles.includes(role));
}

export function defaultLiveToolPolicy(role: string): LiveToolPolicyMap {
  return Object.fromEntries(getLiveToolsForRole(role).map((tool) => [tool.id, true]));
}

export function selectLiveTools(role: string, message: string, policy: LiveToolPolicyMap = {}): LiveToolDefinition[] {
  const eligible = getLiveToolsForRole(role).filter((tool) => policy[tool.id] !== false);
  const normalized = message.toLowerCase();
  const matching = eligible.filter((tool) => tool.keywords.some((keyword) => normalized.includes(keyword)));
  // Always include identity and notifications as a small baseline. If there
  // is no clear intent, run the role's approved tools so the answer is still
  // grounded in current state rather than guessing from an empty context.
  const platformOverviewTools = ["registered_companies", "platform_user_count", "active_subscription_plans"];
  const isPlatformOverview = role === "super_admin"
    && !/\bplatform financial dashboard\b/.test(normalized)
    && (/\b(?:platform|whole platform|all companies)\b[\s\S]*\b(?:overview|summary|metrics|dashboard)\b|\b(?:overview|summary|metrics|dashboard)\b[\s\S]*\b(?:of the )?platform\b/.test(normalized));
  const isPlatformCompanyQuestion = role === "super_admin" && matching.some((tool) => platformOverviewTools.includes(tool.id));
  const isPlatformCompanySwitchQuestion = role === "super_admin"
    && /\b(?:switch|browse|open|enter|go to|view)\b[\s\S]*\b(?:company|companies)\b[\s\S]*\b(?:admin|workspace|view)\b/.test(normalized);
  const isPlatformOwnerQuestion = role === "super_admin"
    && /\b(?:company\s+)?owners?\b/.test(normalized)
    && /\b(?:show|list|which|who|all|how many|find)\b/.test(normalized);
  const isRoleAccessQuestion = ["super_admin", "owner", "company_admin"].includes(role)
    && /\b(?:allow|disable|enable|access|permission|permissions|which roles?|what data|role controls?|live[- ]data|platform[- ]level tools?|platform knowledge|whole database|unrestricted sql)\b/.test(normalized)
    && /\b(?:kitchen staff|cleaning staff|company admins?|drivers?|clients?|inventory|stock|invoice data|customer data|equipment data|tools?|sql)\b/.test(normalized);
  if (isPlatformCompanySwitchQuestion) {
    const companies = eligible.find((tool) => tool.id === "registered_companies");
    const identity = eligible.find((tool) => tool.id === "current_user_profile");
    return [companies, identity].filter((tool): tool is LiveToolDefinition => Boolean(tool));
  }
  const isPlatformTenantWorkflow = role === "super_admin"
    && /\bfind a company\b/.test(normalized)
    && /\b(?:subscription|tenant view|company admin)\b/.test(normalized);
  if (isPlatformTenantWorkflow) {
    const companies = eligible.find((tool) => tool.id === "registered_companies");
    const identity = eligible.find((tool) => tool.id === "current_user_profile");
    return [companies, identity].filter((tool): tool is LiveToolDefinition => Boolean(tool));
  }
  if (isPlatformOwnerQuestion) {
    const owners = eligible.find((tool) => tool.id === "platform_company_owners");
    const identity = eligible.find((tool) => tool.id === "current_user_profile");
    return [owners, identity].filter((tool): tool is LiveToolDefinition => Boolean(tool));
  }
  if (isRoleAccessQuestion) {
    const access = eligible.find((tool) => tool.id === (role === "super_admin" ? "platform_ai_access" : "company_ai_access"));
    const identity = eligible.find((tool) => tool.id === "current_user_profile");
    return [access, identity].filter((tool): tool is LiveToolDefinition => Boolean(tool));
  }
  const pendingInvitations = role === "super_admin" && matching.find((tool) => tool.id === "platform_pending_invitations");
  if (pendingInvitations) {
    const identity = eligible.find((tool) => tool.id === "current_user_profile");
    return [pendingInvitations, identity].filter((tool): tool is LiveToolDefinition => Boolean(tool));
  }
  if (isPlatformOverview) {
    const overview = eligible.find((tool) => tool.id === "platform_dashboard_metrics");
    const identity = eligible.find((tool) => tool.id === "current_user_profile");
    return [overview, identity].filter((tool): tool is LiveToolDefinition => Boolean(tool));
  }
  // Currency questions have a generic company-profile keyword ("currency")
  // as well as dedicated platform tools. Always put the dedicated live
  // source first so the model cannot answer a rate/threshold question from
  // the company profile or stale guidance.
  if (role === "super_admin") {
    const platformPriority = [
      "platform_audit_events",
      "platform_ai_brain_sources",
      "platform_ai_access",
      "platform_tenant_health",
      "platform_trial_expiry",
    ];
    const priorityTool = platformPriority
      .map((id) => matching.find((tool) => tool.id === id))
      .find((tool): tool is LiveToolDefinition => Boolean(tool));
    if (priorityTool) {
      const identity = eligible.find((tool) => tool.id === "current_user_profile");
      return [priorityTool, identity].filter((tool): tool is LiveToolDefinition => Boolean(tool));
    }
    const technologyCosts = matching.find((tool) => tool.id === "platform_technology_costs");
    if (technologyCosts) {
      const identity = eligible.find((tool) => tool.id === "current_user_profile");
      return [technologyCosts, identity].filter((tool): tool is LiveToolDefinition => Boolean(tool));
    }
    const currencyTool = ["platform_currency_thresholds", "platform_latest_exchange_rates", "supported_currencies"]
      .map((id) => matching.find((tool) => tool.id === id))
      .find((tool): tool is LiveToolDefinition => Boolean(tool));
    if (currencyTool) {
      const identity = eligible.find((tool) => tool.id === "current_user_profile");
      return [currencyTool, identity].filter((tool): tool is LiveToolDefinition => Boolean(tool));
    }
  }
  const baseline = eligible.filter((tool) => (isPlatformCompanyQuestion
    ? ["current_user_profile"].includes(tool.id)
    : ["current_user_profile", "company_profile", "user_notifications"].includes(tool.id)));
  const relevant = matching.filter((tool) => !isPlatformCompanyQuestion || platformOverviewTools.includes(tool.id));
  // Put the tool that matches the question first. Large notification lists
  // and other baseline context must not push the authoritative result past
  // the compacted live-context limit.
  const chosen = matching.length ? [...relevant, ...baseline.filter((tool) => !relevant.some((item) => item.id === tool.id))] : eligible;
  return Array.from(new Map(chosen.map((tool) => [tool.id, tool])).values()).slice(0, 8);
}

async function rows(db: any, table: string, query: (builder: any) => any): Promise<any[]> {
  try {
    const result = await query(db.from(table));
    if (result.error || result.data == null) return [];
    return Array.isArray(result.data) ? result.data : [result.data];
  } catch {
    return [];
  }
}

function scopeRegionQuery(query: any, identity: ChatIdentity): any {
  if (identity.role !== "region_admin") return query;
  const regionIds = [...new Set([identity.regionId, ...identity.regionsCovered].filter(Boolean))];
  if (!regionIds.length) return query.is("region_id", null);
  return query.or(`region_id.in.(${regionIds.join(",")}),region_id.is.null`);
}

function dateRange(message: string): { start: string; end: string } | null {
  const text = message.toLowerCase();
  const now = new Date();
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  if (text.includes("tomorrow")) {
    const tomorrow = new Date(day);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { start: tomorrow.toISOString().slice(0, 10), end: tomorrow.toISOString().slice(0, 10) };
  }
  if (text.includes("today")) return { start: day.toISOString().slice(0, 10), end: day.toISOString().slice(0, 10) };
  if (text.includes("this week") || text.includes("current week")) {
    const start = new Date(day);
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (text.includes("this month")) {
    const start = new Date(day.getFullYear(), day.getMonth(), 1);
    const end = new Date(day.getFullYear(), day.getMonth() + 1, 0);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (text.includes("last 90 days") || text.includes("past 90 days")) {
    const start = new Date(day);
    start.setDate(start.getDate() - 90);
    return { start: start.toISOString().slice(0, 10), end: day.toISOString().slice(0, 10) };
  }
  return null;
}

function applyDateRange(query: any, column: string, message: string): any {
  const range = dateRange(message);
  return range ? query.gte(column, range.start).lte(column, range.end) : query;
}

function auditDateRange(message: string): { start: string; end: string } | null {
  const text = message.toLowerCase();
  const now = new Date();
  const end = new Date(now);
  if (/\blast hour\b/.test(text)) {
    return { start: new Date(now.getTime() - 60 * 60 * 1000).toISOString(), end: end.toISOString() };
  }
  const hours = text.match(/\blast\s+(\d+)\s+hours?\b/);
  if (hours) {
    return { start: new Date(now.getTime() - Number(hours[1]) * 60 * 60 * 1000).toISOString(), end: end.toISOString() };
  }
  const days = text.match(/\blast\s+(\d+)\s+days?\b/) || text.match(/\b(?:past|previous)\s+(\d+)\s+days?\b/);
  if (days) {
    return { start: new Date(now.getTime() - Number(days[1]) * 86_400_000).toISOString(), end: end.toISOString() };
  }
  if (/\byesterday\b/.test(text)) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 1);
    return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
  }
  if (/\btoday\b/.test(text)) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
  }
  const isoDate = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoDate) {
    const start = new Date(`${isoDate[1]}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
  }
  return null;
}

export async function runLiveTool(db: any, identity: ChatIdentity, tool: LiveToolDefinition, message = ""): Promise<any> {
  if (!tool.roles.includes(identity.role)) return null;
  // Platform tools must read through the server-side service client after the
  // signed-in profile has already been verified as super_admin. The request
  // client carries the browser's RLS session, and older deployments do not
  // consistently expose platform-wide rows through that policy. Tenant tools
  // continue using the request client so their company scope remains enforced.
  if (identity.role === "super_admin") {
    try {
      db = getServiceSupabase();
    } catch {
      // Local environments may intentionally omit the service key; retain the
      // authenticated request client as a safe, read-only fallback.
    }
  }
  if (tool.id === "current_user_profile") {
    return (await rows(db, "profiles", (q) => q.select("full_name, email, role, active_role, company_id, is_active").eq("id", identity.userId).maybeSingle()))[0] || null;
  }
  if (tool.id === "registered_companies") {
    if (identity.role !== "super_admin") return null;
    try {
      const result = await db
        .from("companies")
        .select("id, company_name, slug, subscription_status, is_active", { count: "exact" })
        .is("deleted_at", null)
        .limit(5000);
      if (result.error) return null;
      const companies = Array.isArray(result.data) ? result.data : [];
      const trialCompanies = companies
        .filter((company: any) => String(company.subscription_status || "").toLowerCase() === "trial")
        .map((company: any) => String(company.company_name || "").trim())
        .filter(Boolean);
      return {
        total: Number(result.count ?? companies.length),
        active: companies.filter((company: any) => String(company.subscription_status || "").toLowerCase() === "active" && company.is_active !== false).length,
        trial: trialCompanies.length,
        trialCompanies,
        companies: companies
          .filter((company: any) => company.company_name && company.slug)
          .map((company: any) => ({
            id: String(company.id || ""),
            name: String(company.company_name).trim(),
            slug: String(company.slug).trim(),
            status: String(company.subscription_status || "").trim() || "not provided",
          }))
          .slice(0, 200),
        as_of: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
  if (tool.id === "platform_user_count") {
    if (identity.role !== "super_admin") return null;
    try {
      const result = await db
        .from("profiles")
        .select("id, is_active", { count: "exact" })
        .limit(5000);
      if (result.error) return null;
      const users = Array.isArray(result.data) ? result.data : [];
      const total = Number(result.count ?? users.length);
      return {
        total,
        active: users.length ? users.filter((user: any) => user.is_active !== false).length : null,
        as_of: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
  if (tool.id === "platform_pending_invitations") {
    if (identity.role !== "super_admin") return null;
    try {
      const [profilesResult, companiesResult] = await Promise.all([
        db.from("profiles").select("id, email, full_name, company_id, role").limit(5000),
        db.from("companies").select("id, company_name, slug").is("deleted_at", null).limit(5000),
      ]);
      if (profilesResult.error || companiesResult.error) return null;

      // Match the User Management page: Pending means the auth invite exists
      // but the user has not signed in yet. Do not use a stale profile flag.
      const admin = getServiceSupabase();
      const activity = new Map<string, string | null>();
      const perPage = 1000;
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await (admin as any).auth.admin.listUsers({ page, perPage });
        if (error) return null;
        const users = Array.isArray(data?.users) ? data.users : [];
        users.forEach((user: any) => activity.set(String(user.id), user.last_sign_in_at ?? null));
        if (users.length < perPage) break;
      }

      const companies = new Map<string, { name: string; slug: string | null }>(
        (Array.isArray(companiesResult.data) ? companiesResult.data : []).map((company: any) => [
          String(company.id),
          { name: String(company.company_name || "Company").trim(), slug: company.slug ? String(company.slug).trim() : null },
        ]),
      );
      const pending = (Array.isArray(profilesResult.data) ? profilesResult.data : [])
        .filter((profile: any) => activity.has(String(profile.id)) && !activity.get(String(profile.id)))
        .map((profile: any) => {
          const company = profile.company_id ? companies.get(String(profile.company_id)) : null;
          return {
            id: String(profile.id),
            name: String(profile.full_name || profile.email || "Invited user").trim(),
            email: profile.email ? String(profile.email).trim() : null,
            role: String(profile.role || "").trim() || null,
            companyName: company?.name || null,
            companySlug: company?.slug || null,
          };
        });
      return { total: pending.length, pending, as_of: new Date().toISOString() };
    } catch {
      return null;
    }
  }
  if (tool.id === "platform_company_owners") {
    if (identity.role !== "super_admin") return null;
    try {
      const result = await db
        .from("companies")
        .select("id, company_name, slug, owner_id, profiles!companies_owner_id_fkey(full_name, email, role, active_role, is_active)", { count: "exact" })
        .is("deleted_at", null)
        .order("company_name", { ascending: true })
        .limit(5000);
      if (result.error) return null;
      const companies = Array.isArray(result.data) ? result.data : [];
      const owners = companies.map((company: any) => {
        const profile = Array.isArray(company.profiles) ? company.profiles[0] : company.profiles;
        return {
          companyId: String(company.id || ""),
          companyName: String(company.company_name || "Company").trim(),
          companySlug: String(company.slug || "").trim(),
          ownerName: String(profile?.full_name || "Owner not linked").trim(),
          ownerEmail: profile?.email ? String(profile.email).trim() : null,
          ownerActive: profile ? profile.is_active !== false : false,
        };
      });
      return {
        total: owners.filter((owner: any) => owner.ownerName !== "Owner not linked").length,
        owners,
        as_of: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
  if (tool.id === "supported_currencies") {
    if (identity.role !== "super_admin") return null;
    const currencies = await currencyMonitoringService.getSupportedCurrencies(db);
    return {
      currencies,
      source: "active region settings and exchange-rate monitoring",
      as_of: new Date().toISOString(),
    };
  }
  if (tool.id === "platform_latest_exchange_rates") {
    if (identity.role !== "super_admin") return null;
    return await currencyMonitoringService.getLatestRates(db);
  }
  if (tool.id === "platform_currency_thresholds") {
    if (identity.role !== "super_admin") return null;
    return await currencyMonitoringService.getThresholdStatus(db);
  }
  if (tool.id === "platform_technology_costs") {
    if (identity.role !== "super_admin") return null;
    return await getPlatformTechnologyCostSummary(db);
  }
  if (tool.id === "platform_trial_expiry") {
    if (identity.role !== "super_admin") return null;
    try {
      const result = await db
        .from("companies")
        .select("id, company_name, slug, trial_ends_at, subscription_status")
        .is("deleted_at", null)
        .eq("subscription_status", "trial")
        .order("trial_ends_at", { ascending: true })
        .limit(5000);
      if (result.error) return null;
      const companies = (Array.isArray(result.data) ? result.data : []).map((company: any) => ({
        id: String(company.id || ""),
        name: String(company.company_name || "Company").trim(),
        slug: String(company.slug || "").trim(),
        trialEndsAt: company.trial_ends_at || null,
      }));
      const now = Date.now();
      return {
        companies,
        expiringSoon: companies.filter((company: any) => company.trialEndsAt && new Date(company.trialEndsAt).getTime() >= now && new Date(company.trialEndsAt).getTime() <= now + 7 * 86_400_000),
        as_of: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
  if (tool.id === "platform_tenant_health") {
    if (identity.role !== "super_admin") return null;
    try {
      const companiesResult = await db
        .from("companies")
        .select("id, company_name, slug, created_at, onboarding_completed_at, subscription_status, is_active")
        .is("deleted_at", null)
        .limit(5000);
      if (companiesResult.error) return null;
      const companies = Array.isArray(companiesResult.data) ? companiesResult.data : [];
      const daysSince = (value: unknown) => {
        if (!value) return null;
        const time = new Date(String(value)).getTime();
        return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 86_400_000)) : null;
      };
      const incomplete = companies.filter((company: any) => !company.onboarding_completed_at && (daysSince(company.created_at) ?? 0) >= 7);
      const gatewayResult = await db.from("payment_gateways").select("company_id").eq("is_active", true).limit(5000);
      if (gatewayResult.error) return null;
      const connected = new Set((Array.isArray(gatewayResult.data) ? gatewayResult.data : []).map((row: any) => String(row.company_id || "")).filter(Boolean));
      const noPaymentGateway = companies.filter((company: any) => company.onboarding_completed_at && !connected.has(String(company.id))).map((company: any) => ({ id: company.id, name: company.company_name, slug: company.slug }));
      return {
        tracked: companies.length,
        stuckOnboarding: incomplete.map((company: any) => ({ id: company.id, name: company.company_name, slug: company.slug })),
        noPaymentGateway,
        note: "Onboarding issues are based on a company created at least 7 days ago without a completed onboarding timestamp. Payment gateway and dormancy checks remain on the Company health screen.",
        as_of: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
  if (tool.id === "platform_audit_events") {
    if (identity.role !== "super_admin") return null;
    try {
      const normalized = message.toLowerCase();
      let query = db
        .from("audit_logs")
        .select("id, created_at, user_id, company_id, action, entity_type, entity_id, details")
        .order("created_at", { ascending: false })
        // The assistant only needs a concise recent window. Keeping this
        // bounded also preserves valid JSON in the live context; a large
        // audit payload would otherwise be truncated before the answer layer
        // could parse it.
        .limit(20);
      const deactivationQuestion = /\buser\b/.test(normalized) && /\b(?:deactivat|disabled|soft[- ]?deleted|removed)\w*\b/.test(normalized);
      const failureQuestion = /\b(?:failed|failure|error|suspicious)\b/.test(normalized);
      if (failureQuestion) query = query.or("action.ilike.%fail%,action.ilike.%error%,action.ilike.%suspicious%,action.ilike.%denied%");
      if (deactivationQuestion) {
        query = query.eq("entity_type", "user").or("action.ilike.%deactivat%,action.ilike.%disabled%,action.ilike.%soft_deleted%,action.ilike.%soft-deleted%,action.ilike.%removed%");
      } else if (/\bsubscription\b/.test(normalized)) {
        query = query.or("action.ilike.%subscription%,entity_type.eq.subscription");
      } else if (/\bpricing|price\b/.test(normalized)) {
        query = query.or("action.ilike.%pricing%,action.ilike.%price%,entity_type.eq.pricing");
      } else if (/\bpermission|role\b/.test(normalized)) {
        query = query.or("action.ilike.%permission%,action.ilike.%role%,action.ilike.%user_soft_deleted%");
      } else if (/\bcompany changes?\b/.test(normalized)) {
        query = query.or("action.ilike.%company%,entity_type.eq.company");
      }
      const userId = normalized.match(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i)?.[0];
      if (userId && /\buser\b/.test(normalized)) query = query.eq("user_id", userId);
      const range = auditDateRange(normalized);
      if (range) query = query.gte("created_at", range.start).lt("created_at", range.end);
      const result = await query;
      if (result.error) {
        console.error("[chatbot] platform audit query failed:", result.error.code || result.error.status || "unknown", result.error.message || "unknown error");
        return null;
      }
      const events = (Array.isArray(result.data) ? result.data : []).map((row: any) => ({
        id: String(row.id || ""),
        occurredAt: row.created_at,
        action: String(row.action || "activity").trim(),
        entityType: String(row.entity_type || "record").trim(),
        entityId: row.entity_id || null,
        userId: row.user_id || null,
        companyId: row.company_id || null,
        details: row.details && typeof row.details === "object" ? row.details : null,
      }));
      return {
        events,
        totalReturned: events.length,
        failureFilter: failureQuestion,
        filter: deactivationQuestion ? "user_deactivation" : failureQuestion ? "failure" : /\bsubscription\b/.test(normalized) ? "subscription" : /\bpricing|price\b/.test(normalized) ? "pricing" : /\bpermission|role\b/.test(normalized) ? "permission" : /\bcompany changes?\b/.test(normalized) ? "company" : range ? "date" : "recent",
        as_of: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error("[chatbot] platform audit tool failed:", error?.message || "unknown error");
      return null;
    }
  }
  if (tool.id === "platform_ai_brain_sources") {
    if (identity.role !== "super_admin") return null;
    try {
      const result = await db
        .from("ai_brain_sources")
        .select("id, name, source_type, source_url, status, metadata, created_at, updated_at")
        .is("company_id", null)
        .order("updated_at", { ascending: false })
        .limit(5000);
      if (result.error) return null;
      const sources = (Array.isArray(result.data) ? result.data : []).map((source: any) => ({
        id: String(source.id || ""),
        name: String(source.name || "Unnamed source").trim(),
        type: String(source.source_type || "source").trim(),
        status: String(source.status || "pending").trim(),
        roles: Array.isArray(source.metadata?.roles) ? source.metadata.roles.map(String) : [],
        updatedAt: source.updated_at || source.created_at || null,
      }));
      return {
        sources,
        counts: {
          total: sources.length,
          ready: sources.filter((source: any) => source.status === "ready").length,
          pending: sources.filter((source: any) => source.status === "pending").length,
          failed: sources.filter((source: any) => source.status === "error" || source.status === "failed").length,
        },
        as_of: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
  if (tool.id === "platform_ai_access") {
    if (identity.role !== "super_admin") return null;
    try {
      const [accessResult, toolResult] = await Promise.all([
        db.from("ai_brain_access_policies").select("role, live_data_enabled, updated_at").is("company_id", null),
        db.from("ai_brain_tool_policies").select("role, tool_id, enabled").is("company_id", null),
      ]);
      if (accessResult.error && toolResult.error) return null;
      const roles = new Map<string, any>();
      for (const row of (Array.isArray(accessResult.data) ? accessResult.data : [])) roles.set(String(row.role), { role: String(row.role), liveDataEnabled: row.live_data_enabled !== false, updatedAt: row.updated_at || null, tools: [] });
      for (const row of (Array.isArray(toolResult.data) ? toolResult.data : [])) {
        const current = roles.get(String(row.role)) || { role: String(row.role), liveDataEnabled: true, tools: [] };
        if (row.enabled !== false) current.tools.push(String(row.tool_id));
        roles.set(String(row.role), current);
      }
      return { roles: [...roles.values()], note: "The assistant uses named, read-only tools with role and company checks. It never receives unrestricted database access or unrestricted SQL.", as_of: new Date().toISOString() };
    } catch {
      return null;
    }
  }
  if (tool.id === "company_ai_access") {
    if (!["owner", "company_admin"].includes(identity.role) || !identity.companyId) return null;
    try {
      const [accessResult, toolResult] = await Promise.all([
        db.from("ai_brain_access_policies").select("role, live_data_enabled, updated_at").eq("company_id", identity.companyId),
        db.from("ai_brain_tool_policies").select("role, tool_id, enabled").eq("company_id", identity.companyId),
      ]);
      if (accessResult.error && toolResult.error) return null;
      const roles = new Map<string, any>();
      for (const row of (Array.isArray(accessResult.data) ? accessResult.data : [])) roles.set(String(row.role), { role: String(row.role), liveDataEnabled: row.live_data_enabled !== false, updatedAt: row.updated_at || null, tools: [] });
      for (const row of (Array.isArray(toolResult.data) ? toolResult.data : [])) {
        const current = roles.get(String(row.role)) || { role: String(row.role), liveDataEnabled: true, tools: [] };
        if (row.enabled !== false) current.tools.push(String(row.tool_id));
        roles.set(String(row.role), current);
      }
      return { roles: [...roles.values()], note: "This company uses named, read-only tools with role and company checks. It never receives unrestricted database access or unrestricted SQL.", as_of: new Date().toISOString() };
    } catch {
      return null;
    }
  }
  if (tool.id === "active_subscription_plans") {
    if (identity.role !== "super_admin") return null;
    try {
      const [plansResult, companiesResult] = await Promise.all([
        db.from("platform_pricing_plans").select("name, slug, sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
        db.from("companies").select("company_name, subscription_plan, subscription_tier").is("deleted_at", null).eq("subscription_status", "active").order("company_name", { ascending: true }).limit(5000),
      ]);
      if (plansResult.error && companiesResult.error) return null;
      const plans = (Array.isArray(plansResult.data) ? plansResult.data : [])
        .map((plan: any) => String(plan.name || plan.slug || "").trim())
        .filter(Boolean);
      const activeCompanies = (Array.isArray(companiesResult.data) ? companiesResult.data : [])
        .map((company: any) => ({
          company: String(company.company_name || "").trim(),
          plan: String(company.subscription_plan || company.subscription_tier || "").trim(),
        }))
        .filter((item: any) => item.company && item.plan);
      return { plans, activeCompanies, as_of: new Date().toISOString() };
    } catch {
      return null;
    }
  }
  if (tool.id === "platform_dashboard_metrics") {
    if (identity.role !== "super_admin") return null;
    try {
      const [{ data: companies, error: companiesError }, { data: plans, error: plansError }] = await Promise.all([
        db.from("companies").select("id, subscription_status, subscription_plan, subscription_tier, created_at, updated_at, is_active"),
        db.from("platform_pricing_plans").select("slug, zar_price, is_active"),
      ]);
      if (companiesError || plansError || !Array.isArray(companies) || !Array.isArray(plans)) return null;
      const normalise = (value: unknown) => String(value || "").toLowerCase();
      const planPrices = new Map(plans
        .filter((plan: any) => plan.is_active !== false)
        .map((plan: any) => [normalise(plan.slug), Number(plan.zar_price) || 0]));
      const totalCompanies = companies.length;
      const activeCompanies = companies.filter((company: any) => normalise(company.subscription_status) === "active").length;
      const trialCompanies = companies.filter((company: any) => normalise(company.subscription_status) === "trial").length;
      const cancelledCompanies = companies.filter((company: any) => ["cancelled", "canceled", "churned"].includes(normalise(company.subscription_status))).length;
      const monthlyRecurringRevenue = companies
        .filter((company: any) => normalise(company.subscription_status) === "active")
        .reduce((sum: number, company: any) => sum + (planPrices.get(normalise(company.subscription_plan || company.subscription_tier)) || 0), 0);
      const recentlyCancelled = companies.filter((company: any) =>
        ["cancelled", "canceled", "churned"].includes(normalise(company.subscription_status))
        && company.updated_at
        && new Date(company.updated_at).getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).length;
      return {
        totalCompanies,
        activeCompanies,
        trialCompanies,
        cancelledCompanies,
        monthlyRecurringRevenue,
        annualRecurringRevenue: 0,
        totalRevenue: monthlyRecurringRevenue,
        averageRevenuePerUser: totalCompanies > 0 ? monthlyRecurringRevenue / totalCompanies : 0,
        lifetimeValue: totalCompanies > 0 ? (monthlyRecurringRevenue / totalCompanies) * 24 : 0,
        churnRate: activeCompanies > 0 ? (recentlyCancelled / activeCompanies) * 100 : 0,
        conversionRate: totalCompanies > 0 ? (activeCompanies / totalCompanies) * 100 : 0,
        as_of: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
  if (!identity.companyId) return null;
  const companyId = identity.companyId;
  switch (tool.id) {
    case "company_subscription": {
      try {
        const result = await db
          .from("subscriptions")
          .select("plan_name, plan_id, status, current_period_start, current_period_end")
          .eq("user_id", identity.userId)
          .in("status", ["trial", "active", "past_due"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (result.error) return null;
        const subscription = result.data;
        return {
          status: subscription?.status || "none",
          plan: subscription?.plan_name || subscription?.plan_id || null,
          periodStart: subscription?.current_period_start || null,
          periodEnd: subscription?.current_period_end || null,
          recordAvailable: Boolean(subscription),
        };
      } catch {
        return null;
      }
    }
    case "company_profile": {
      const company = (await rows(db, "companies", (q) => q.select("company_name, slug, currency, subscription_status, subscription_plan").eq("id", companyId).maybeSingle()))[0] || null;
      if (!company) return null;
      // The company summary fields are a cache used by feature gates. The
      // subscription screen reads the subscription ledger for the current
      // user, so the assistant must use that same source for plan questions
      // or it can report an old/default plan that the page does not show.
      let resolvedCompany = company;
      try {
        const subscriptionResult = await db
          .from("subscriptions")
          .select("plan_name, plan_id, status, current_period_start, current_period_end")
          .eq("user_id", identity.userId)
          .in("status", ["trial", "active", "past_due"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!subscriptionResult.error) {
          const subscription = subscriptionResult.data;
          resolvedCompany = {
            ...company,
            subscription_status: subscription?.status || "none",
            subscription_plan: subscription?.plan_name || subscription?.plan_id || null,
            subscription_period_start: subscription?.current_period_start || null,
            subscription_period_end: subscription?.current_period_end || null,
            subscription_record_available: Boolean(subscription),
          };
        } else {
          resolvedCompany = { ...company, subscription_status: null, subscription_plan: null, subscription_lookup_available: false };
        }
      } catch {
        // Keep the company identity available, but do not let the assistant
        // treat the cached status as a verified current plan.
        resolvedCompany = { ...company, subscription_status: null, subscription_plan: null, subscription_lookup_available: false };
      }
      // Billing and plan fields are company-authority data. Operational and
      // sales roles can still use the company identity/currency context.
      if (!ADMIN.includes(identity.role)) {
        const safeCompany = { ...resolvedCompany };
        delete safeCompany.subscription_status;
        delete safeCompany.subscription_plan;
        delete safeCompany.subscription_period_start;
        delete safeCompany.subscription_period_end;
        delete safeCompany.subscription_record_available;
        delete safeCompany.subscription_lookup_available;
        return safeCompany;
      }
      return resolvedCompany;
    }
    case "customer_summary": {
      const scopedCustomers = await rows(db, "clients", (q) => scopeRegionQuery(q
        .select("client_name, is_active, region_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("client_name", { ascending: true })
        .limit(5000), identity));
      const activeCustomers = scopedCustomers
        .filter((customer: any) => customer.is_active !== false)
        .map((customer: any) => String(customer.client_name || "").trim())
        .filter(Boolean);
      return {
        total: scopedCustomers.length,
        active: activeCustomers.length,
        inactive: Math.max(scopedCustomers.length - activeCustomers.length, 0),
        activeCustomers,
        as_of: new Date().toISOString(),
      };
    }
    case "customer_profile": {
      const own = identity.role === "client";
      const result = await rows(db, "clients", (q) => {
        const scoped = scopeRegionQuery(q.select("id, client_name, email, phone, notes, outstanding_balance, payment_terms, region_id").eq("company_id", companyId), identity);
        return own ? scoped.eq("user_id", identity.userId).maybeSingle() : scoped.order("client_name", { ascending: true }).limit(40);
      });
      return result;
    }
    case "customer_bookings": {
      if (identity.role === "client") {
        const client = (await rows(db, "clients", (q) => q.select("id").eq("company_id", companyId).eq("user_id", identity.userId).maybeSingle()))[0];
        if (!client?.id) return [];
        return rows(db, "orders", (q) => applyDateRange(q.select("id, order_number, event_name, event_date, event_time, venue_name, venue_address, guest_count, status, total_amount, payment_status").eq("company_id", companyId).eq("client_id", client.id), "event_date", message).order("event_date", { ascending: true }).limit(30));
      }
      return rows(db, "orders", (q) => applyDateRange(scopeRegionQuery(q.select("id, order_number, event_name, event_date, event_time, venue_name, guest_count, status, payment_status, region_id"), identity).eq("company_id", companyId), "event_date", message).order("event_date", { ascending: true }).limit(50));
    }
    case "customer_invoices": {
      if (identity.role === "client") {
        const client = (await rows(db, "clients", (q) => q.select("id").eq("company_id", companyId).eq("user_id", identity.userId).maybeSingle()))[0];
        if (!client?.id) return [];
        return rows(db, "invoices", (q) => q.select("invoice_number, invoice_date, due_date, total_amount, amount_paid, balance_due, status, order_id").eq("company_id", companyId).eq("client_id", client.id).is("deleted_at", null).order("due_date", { ascending: false }).limit(30));
      }
      if (identity.role === "region_admin") {
        const regionalOrders = await rows(db, "orders", (q) => scopeRegionQuery(q.select("id").eq("company_id", companyId), identity));
        const orderIds = regionalOrders.map((order: any) => order.id).filter(Boolean);
        return orderIds.length
          ? rows(db, "invoices", (q) => q.select("invoice_number, due_date, total_amount, amount_paid, balance_due, status, order_id").eq("company_id", companyId).in("order_id", orderIds).is("deleted_at", null).order("due_date", { ascending: true }).limit(50))
          : [];
      }
      return rows(db, "invoices", (q) => q.select("invoice_number, due_date, total_amount, amount_paid, balance_due, status, order_id").eq("company_id", companyId).is("deleted_at", null).order("due_date", { ascending: true }).limit(50));
    }
    case "assigned_deliveries":
      return rows(db, "driver_assignments", (q) => applyDateRange(q.select("id, order_id, assignment_type, scheduled_for, status, en_route_at, arrived_at_venue_at, delivered_at, total_earnings, notes").eq("company_id", companyId).eq("driver_id", identity.userId), "scheduled_for", message).order("scheduled_for", { ascending: true }).limit(30));
    case "delivery_orders": {
      const assignments = await runLiveTool(db, identity, getLiveToolDefinition("assigned_deliveries")!, message);
      const ids = (assignments || []).map((item: any) => item.order_id).filter(Boolean);
      return ids.length ? rows(db, "orders", (q) => q.select("id, order_number, event_name, event_date, event_time, venue_name, venue_address, guest_count, status, delivery_time, collection_time").eq("company_id", companyId).in("id", ids)) : [];
    }
    case "kitchen_orders":
      return rows(db, "orders", (q) => applyDateRange(q.select("id, order_number, event_name, event_date, event_time, guest_count, venue_name, status, kitchen_instructions").eq("company_id", companyId).in("status", ["confirmed", "preparing", "prep", "ready"]), "event_date", message).order("event_date", { ascending: true }).limit(50));
    case "kitchen_prep_tasks":
      return rows(db, "kitchen_prep_tasks", (q) => applyDateRange(q.select("id, order_id, task_name, status, scheduled_start, scheduled_end, assigned_chef_id, notes").eq("company_id", companyId), "scheduled_start", message).order("scheduled_start", { ascending: true }).limit(60));
    case "kitchen_inventory":
    case "shopping_inventory":
    case "operations_inventory":
      return rows(db, "inventory_items", (q) => q.select("item_name, category, unit_of_measure, current_stock, minimum_stock, reorder_quantity, preferred_supplier_id").eq("company_id", companyId).is("deleted_at", null).limit(150));
    case "shopping_lists":
      return rows(db, "shopping_lists", (q) => applyDateRange(q.select("id, title, list_date, status, estimated_total, actual_total, shopper_id, notes").eq("company_id", companyId), "list_date", message).order("list_date", { ascending: false }).limit(30));
    case "cleaning_equipment":
      return rows(db, "equipment", (q) => q.select("id, name, category, condition, quantity, available, requires_cleaning, next_available_at, last_cleaned").eq("company_id", companyId).limit(100));
    case "cleaning_damage_reports":
      return rows(db, "equipment_damages", (q) => q.select("id, equipment_id, damage_type, severity, status, description, reported_at").eq("company_id", companyId).order("reported_at", { ascending: false }).limit(60));
    case "sales_orders":
    case "operations_orders":
      return rows(db, "orders", (q) => applyDateRange(scopeRegionQuery(q.select("id, order_number, event_name, event_date, event_time, venue_name, guest_count, status, total_amount, payment_status, region_id"), identity).eq("company_id", companyId), "event_date", message).order("event_date", { ascending: true }).limit(60));
    case "sales_quotes":
      return rows(db, "quotes", (q) => applyDateRange(scopeRegionQuery(q.select("quote_number, quote_name, event_date, guest_count, status, total_amount, valid_until, client_name, region_id"), identity).eq("company_id", companyId).is("deleted_at", null), "event_date", message).order("created_at", { ascending: false }).limit(60));
    case "sales_leads":
      return rows(db, "leads", (q) => applyDateRange(scopeRegionQuery(q.select("contact_name, client_name, event_date, event_type, guest_count, status, assigned_to, created_at, region_id"), identity).eq("company_id", companyId).is("deleted_at", null), "created_at", message).order("created_at", { ascending: false }).limit(60));
    case "admin_invoices":
      return rows(db, "invoices", (q) => q.select("invoice_number, due_date, total_amount, amount_paid, balance_due, status, order_id").eq("company_id", companyId).is("deleted_at", null).order("due_date", { ascending: true }).limit(60));
    case "team_members": {
      const members = await rows(db, "profiles", (q) => q.select("id, full_name, email, role, active_role, region_id, is_active").eq("company_id", companyId).order("full_name", { ascending: true }).limit(100));
      // Company administrators can manage operational users, but owner
      // identity/private details are not part of their assistant context.
      return identity.role === "company_admin"
        ? members.filter((member: any) => member.role !== "owner" && member.active_role !== "owner")
        : members;
    }
    case "staff_orders":
      return rows(db, "orders", (q) => applyDateRange(q.select("id, order_number, event_name, event_date, event_time, venue_name, status").eq("company_id", companyId).eq("user_id", identity.userId), "event_date", message).order("event_date", { ascending: true }).limit(30));
    case "user_notifications":
      return rows(db, "notifications", (q) => q.select("title, message, priority, created_at, is_read, action_url").eq("company_id", companyId).eq("user_id", identity.userId).order("created_at", { ascending: false }).limit(30));
    case "dashboard_stats": {
      const [orders, leads, quotes, inventory] = await Promise.all([
        rows(db, "orders", (q) => q.select("id, status, total_amount").eq("company_id", companyId).limit(500)),
        rows(db, "leads", (q) => q.select("id, status").eq("company_id", companyId).is("deleted_at", null).limit(500)),
        rows(db, "quotes", (q) => q.select("id, status, total_amount").eq("company_id", companyId).is("deleted_at", null).limit(500)),
        rows(db, "inventory_items", (q) => q.select("id, current_stock, minimum_stock").eq("company_id", companyId).is("deleted_at", null).limit(500)),
      ]);
      return { orders: orders.length, leads: leads.length, quotes: quotes.length, low_stock_items: inventory.filter((item) => Number(item.current_stock || 0) <= Number(item.minimum_stock || 0)).length };
    }
    default:
      return null;
  }
}

export async function runLiveTools(db: any, identity: ChatIdentity, message: string, policy: LiveToolPolicyMap = {}): Promise<Record<string, any>> {
  const selected = selectLiveTools(identity.role, message, policy);
  const [entries, dynamic] = await Promise.all([
    Promise.all(selected.map(async (tool) => [tool.id, await runLiveTool(db, identity, tool, message)] as const)),
    runDynamicTools(db, identity, message),
  ]);
  // Custom tools matched the manager-defined question phrases, so keep them
  // first. Large built-in result sets must not push the requested result out
  // of the bounded assistant context.
  return { ...dynamic, ...Object.fromEntries(entries) };
}
