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
import { driverPayService } from "@/services/driverPayService";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { ChatIntentMatch } from "@/lib/chatbot/intents/types";
import { normalizeChatRole } from "@/lib/chatbot/roles";
import { normalizeChatMessage } from "@/lib/chatbot/intents/normalize";

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
  | "driver_earnings"
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
  | "team_roster"
  | "staff_orders"
  | "order_items"
  | "inventory_movements"
  | "catalogue_menu"
  | "supplier_records"
  | "delivery_tracking"
  | "vehicle_status"
  | "cleaning_schedules"
  | "reviews_feedback"
  | "supplier_payables"
  | "notification_preferences"
  | "work_clock_status"
  | "work_hours"
  | "order_work_hours"
  | "daily_operations_tasks"
  | "staff_shift_schedule"
  | "waiter_service_assignments"
  | "cleaning_work_tasks"
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
const WORKER_ROLES = ["kitchen_manager", "kitchen_staff", "shopping_staff", "shopping", "driver", "waiter", "cleaning_manager", "cleaning_staff", "staff"];
const WORK_HOURS_ROLES = [...WORKER_ROLES, "owner", "company_admin", "admin", "region_admin", "sales_admin"];
const ALL_COMPANY_ROLES = [...ADMIN, ...SALES.filter((role) => !ADMIN.includes(role)), ...WORKER_ROLES];
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
  { id: "driver_earnings", label: "Driver earnings", description: "The signed-in driver’s shift hours, delivery pay, and total earnings for a selected period", category: "finance", roles: ["driver"], keywords: ["earning", "earnings", "pay", "wage", "wages", "worked hours", "shift hours", "hours worked"] },
  { id: "delivery_orders", label: "Delivery order details", description: "Order and venue details for approved delivery work", category: "operations", roles: DRIVER, keywords: ["delivery", "venue", "address", "order details", "guest"] },
  { id: "kitchen_orders", label: "Kitchen orders", description: "Confirmed and active orders used for kitchen production", category: "operations", roles: KITCHEN, keywords: ["kitchen", "production", "order", "prep", "ready", "cooking"] },
  { id: "kitchen_prep_tasks", label: "Kitchen prep tasks", description: "Prep tasks, assignments, schedules, and completion status", category: "operations", roles: KITCHEN, keywords: ["prep", "task", "tasks", "chef", "production"] },
  { id: "kitchen_inventory", label: "Kitchen inventory", description: "Stock levels and reorder thresholds used for prep", category: "operations", roles: KITCHEN, keywords: ["stock", "inventory", "ingredient", "ingredients", "item", "items", "shortage", "reorder", "too low", "too less", "not enough", "restock"] },
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
  { id: "team_roster", label: "Team roster", description: "Names and operational roles in the signed-in user's department", category: "people", roles: [...ADMIN, ...WORKER_ROLES], keywords: ["team", "staff", "employee", "member", "members", "roster", "kitchen", "cleaning", "driver", "waiter", "shopper", "chef"] },
  { id: "staff_orders", label: "My work orders", description: "Orders and events assigned to the signed-in operational staff member", category: "operations", roles: WORKER_ROLES, keywords: ["order", "orders", "event", "job", "jobs", "assignment", "assignments", "work", "today's work", "todays work", "my work"] },
  { id: "order_items", label: "Order menu items", description: "Menu items, quantities, dietary instructions, and item notes on authorized orders", category: "operations", roles: [...KITCHEN, ...SALES, ...OPERATIONS, ...CLIENT], keywords: ["menu items", "order items", "items on order", "what items", "what is on the order", "food items", "dish", "dishes", "dietary", "allergens"] },
  { id: "inventory_movements", label: "Inventory movements", description: "Stock receipts, usage, adjustments, and movement history", category: "operations", roles: [...KITCHEN, ...SHOPPING, ...OPERATIONS, ...ADMIN], keywords: ["inventory movement", "stock movement", "stock history", "inventory history", "used stock", "received stock", "adjustment"] },
  { id: "catalogue_menu", label: "Menu and recipes", description: "Available menu items, recipes, preparation times, and recipe ingredients", category: "operations", roles: [...KITCHEN, ...SALES, ...OPERATIONS, ...ADMIN], keywords: ["menu", "menu items", "catalogue", "catalog", "recipe", "recipes", "preparation time", "food cost"] },
  { id: "supplier_records", label: "Suppliers", description: "Supplier records and supplier-linked purchasing information", category: "operations", roles: [...SHOPPING, ...OPERATIONS, ...ADMIN], keywords: ["supplier", "suppliers", "vendor", "vendors", "supplier contact", "supplier product"] },
  { id: "delivery_tracking", label: "Delivery tracking", description: "Assigned delivery routes, stops, statuses, and latest driver location records", category: "operations", roles: [...DRIVER, ...OPERATIONS, ...ADMIN], keywords: ["delivery tracking", "track delivery", "live location", "driver location", "route stops", "delivery stop", "where is the driver"] },
  { id: "vehicle_status", label: "Vehicle status", description: "Delivery vehicles, availability, and maintenance context", category: "operations", roles: [...DRIVER, ...OPERATIONS, ...ADMIN], keywords: ["vehicle", "vehicles", "van", "delivery van", "vehicle availability", "vehicle maintenance"] },
  { id: "cleaning_schedules", label: "Cleaning schedules", description: "Scheduled cleaning work and equipment-return cleaning windows", category: "operations", roles: [...CLEANING, ...OPERATIONS, ...ADMIN], keywords: ["cleaning schedule", "cleaning schedules", "cleaning rota", "scheduled cleaning", "my cleaning schedule"] },
  { id: "reviews_feedback", label: "Reviews and feedback", description: "Customer reviews, delivery feedback, and complaint follow-up records", category: "sales", roles: [...SALES, ...OPERATIONS, ...ADMIN, ...CLIENT], keywords: ["review", "reviews", "feedback", "rating", "ratings", "complaint", "complaints", "customer feedback"] },
  { id: "supplier_payables", label: "Supplier payables", description: "Supplier bills and payment due records", category: "finance", roles: [...SHOPPING, ...ADMIN, "owner", "company_admin"], keywords: ["supplier payable", "supplier payables", "supplier bills", "accounts payable", "purchase payment"] },
  { id: "notification_preferences", label: "Notification preferences", description: "The signed-in user's saved email notification preferences", category: "identity", roles: [...ALL_COMPANY_ROLES, "client"], keywords: ["notification preferences", "email preferences", "email notifications", "what emails", "alerts preferences"] },
  { id: "work_clock_status", label: "Work clock status", description: "The signed-in user's single active role timer, recent role switches, and end notes", category: "operations", roles: WORKER_ROLES, keywords: ["clock", "clocked in", "clocked out", "timer", "timers", "active timer", "active clock", "on duty", "off duty", "role switch", "work session"] },
  { id: "work_hours", label: "Work hours", description: "The signed-in user's recorded work sessions and hours, or company staff hours for authorized administrators", category: "finance", roles: WORK_HOURS_ROLES, keywords: ["work hours", "hours worked", "worked hours", "timesheet", "timesheets", "shift hours", "my shifts", "my hours", "staff hours", "clock hours", "hours today", "hours this week", "hours this month"] },
  { id: "order_work_hours", label: "Order-specific work hours", description: "Order-linked role sessions, duration, role, and handoff notes", category: "operations", roles: [...WORKER_ROLES, ...ADMIN, "region_admin"], keywords: ["order hours", "order-specific hours", "order specific hours", "hours for this order", "worked on this order", "who worked", "work on order", "time on order", "role hours", "hours by order"] },
  { id: "daily_operations_tasks", label: "Daily operations tasks", description: "Configured daily kitchen and equipment cleaning tasks, schedule, assignment, status, and notifications", category: "operations", roles: [...WORKER_ROLES, ...ADMIN, "region_admin"], keywords: ["daily operations", "daily cleaning", "daily clean", "kitchen clean", "equipment clean", "clean equipment", "clean kitchen", "hygiene task", "cleaning reminder", "cleaning configuration"] },
  { id: "staff_shift_schedule", label: "Staff shift schedule", description: "Planned and actual staff shifts and shift tasks for the signed-in role", category: "operations", roles: [...WORKER_ROLES, ...ADMIN, "region_admin"], keywords: ["schedule", "scheduled shift", "shift", "shifts", "roster", "rota", "work schedule", "my schedule", "planned work", "planned shift"] },
  { id: "waiter_service_assignments", label: "Service assignments", description: "Waiter event attendance, service phases, timings, and service notes", category: "operations", roles: ["waiter", ...ADMIN, "region_admin"], keywords: ["waiter", "waitering", "service assignment", "service assignments", "event attendance", "event service", "service timing", "guests arrived", "service started"] },
  { id: "cleaning_work_tasks", label: "Cleaning work tasks", description: "Cleaning jobs for equipment availability, planned windows, actual work, and status", category: "operations", roles: ["cleaning_manager", "cleaning_staff", "kitchen_manager", "kitchen_staff", ...ADMIN, "region_admin"], keywords: ["cleaning job", "cleaning jobs", "cleaning task", "cleaning tasks", "equipment cleaning task", "cleaning status", "planned cleaning", "cleaning window"] },
  { id: "user_notifications", label: "My notifications", description: "Notifications addressed to the signed-in user", category: "identity", roles: [...ALL_COMPANY_ROLES, "client"], keywords: ["notification", "notifications", "alert", "alerts", "message", "updates"] },
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
  driver_earnings: "Only the signed-in driver’s own calculated shift and completed-delivery pay for the requested date range",
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
  team_roster: "Names and operational roles for the signed-in user's department; private contact and pay fields are excluded",
  staff_orders: "Only work orders and events assigned to the signed-in operational staff member",
  order_items: "Menu items and item-level instructions for orders the signed-in role is authorized to see",
  inventory_movements: "Company inventory movement history, limited to authorized operational roles",
  catalogue_menu: "Company menu items, recipes, and recipe ingredients, limited to authorized operational roles",
  supplier_records: "Company supplier records and purchasing links, limited to authorized procurement and administration roles",
  delivery_tracking: "Assigned or company-authorized delivery routes, stops, statuses, and location records",
  vehicle_status: "Company delivery vehicle availability and maintenance context",
  cleaning_schedules: "Company cleaning schedules and equipment-return cleaning work",
  reviews_feedback: "Authorized company reviews, feedback, and complaint follow-up; client-facing results are limited to their own records",
  supplier_payables: "Company supplier payment-due records, limited to authorized procurement and administration roles",
  notification_preferences: "Only the signed-in user's saved notification preference record",
  work_clock_status: "The signed-in user's shared one-active-role clock, recent role sessions, and handoff notes",
  work_hours: "The signed-in user's recorded staff work sessions; authorized administrators may see company staff hours",
  order_work_hours: "Order-linked role sessions and durations, restricted to the signed-in worker or authorized company administrators",
  daily_operations_tasks: "Company-configured daily kitchen and equipment cleaning tasks, filtered to the signed-in worker's target roles or company administration",
  staff_shift_schedule: "Planned and actual staff shifts and shift tasks for the signed-in worker or authorized company administration",
  waiter_service_assignments: "Waiter event attendance and service phases for the signed-in waiter or authorized company administration",
  cleaning_work_tasks: "Company cleaning jobs and planned equipment-availability windows, filtered to cleaning and kitchen operations",
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
  const normalizedRole = normalizeChatRole(role);
  return LIVE_TOOL_DEFINITIONS.filter((tool) => tool.roles.includes(normalizedRole));
}

export function defaultLiveToolPolicy(role: string): LiveToolPolicyMap {
  return Object.fromEntries(getLiveToolsForRole(role).map((tool) => [tool.id, true]));
}

export function selectLiveTools(role: string, message: string, policy: LiveToolPolicyMap = {}, resolvedIntent?: ChatIntentMatch | null): LiveToolDefinition[] {
  role = normalizeChatRole(role);
  const eligible = getLiveToolsForRole(role).filter((tool) => policy[tool.id] !== false);
  const normalized = normalizeChatMessage(message);
  const availableToolIds = new Set<string>(eligible.map((tool) => tool.id));
  const intentToolIds = (resolvedIntent?.confidence || 0) >= 0.55
    ? resolvedIntent!.toolIds.filter((toolId) => availableToolIds.has(toolId))
    : [];
  const keywordMatches = eligible.filter((tool) => tool.keywords.some((keyword) => normalized.includes(keyword)));
  const intentMatches = intentToolIds
    .map((toolId) => eligible.find((tool) => tool.id === toolId))
    .filter((tool): tool is LiveToolDefinition => Boolean(tool));
  const matching = Array.from(new Map([...intentMatches, ...keywordMatches].map((tool) => [tool.id, tool])).values());
  // Earnings must use the same pay calculation as the Driver earnings page.
  // Do not let the generic assigned-deliveries tool win merely because the
  // question contains the word "earnings"; that tool has assignments, not
  // shift rows or period totals.
  const driverEarnings = role === "driver" && matching.find((tool) => tool.id === "driver_earnings")
    && /\b(?:earning|earnings|pay|wage|wages|worked|hours?|shift)\b/.test(normalized);
  if (driverEarnings) {
    const identity = eligible.find((tool) => tool.id === "current_user_profile");
    const company = eligible.find((tool) => tool.id === "company_profile");
    return [matching.find((tool) => tool.id === "driver_earnings"), identity, company]
      .filter((tool): tool is LiveToolDefinition => Boolean(tool));
  }
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
    && /\b(?:allow|disable|enable|access|permission|permissions|which roles?|what data|what can|role controls?|live[- ]data|platform[- ]level tools?|platform knowledge|limitations?|restrictions?|boundaries?|whole database|unrestricted sql|can|see|view)\b/.test(normalized)
    && /\b(?:kitchen staff|cleaning staff|company admins?|drivers?|clients?|inventory|stock|invoice data|customer data|equipment data|team members?|roster|visibility|limitations?|restrictions?|boundaries?|tools?|sql)\b/.test(normalized);
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
  if (intentMatches.length) {
    const baseline = eligible.filter((tool) => ["current_user_profile", "company_profile", "user_notifications"].includes(tool.id));
    return Array.from(new Map([...intentMatches, ...baseline].map((tool) => [tool.id, tool])).values()).slice(0, 8);
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
    if (result.error) {
      console.error(`[chatbot] ${table} query failed:`, result.error.code || result.error.message || "unknown error");
      return [];
    }
    if (result.data == null) return [];
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

function dateRangeFromIntent(timeRange: ChatIntentMatch["timeRange"], day: Date, dateOnly: (value: Date) => string): { start: string; end: string } | null {
  if (!timeRange || timeRange === "unspecified" || timeRange === "all") return null;
  const start = new Date(day);
  const end = new Date(day);
  switch (timeRange) {
    case "yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "tomorrow":
      start.setDate(start.getDate() + 1);
      end.setDate(end.getDate() + 1);
      break;
    case "this_week": {
      const mondayOffset = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - mondayOffset);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
      break;
    }
    case "next_week": {
      const mondayOffset = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - mondayOffset + 7);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
      break;
    }
    case "this_month":
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 0);
      break;
    case "next_month":
      start.setMonth(start.getMonth() + 1, 1);
      end.setMonth(start.getMonth() + 1, 0);
      break;
    case "last_90_days":
      start.setDate(start.getDate() - 90);
      break;
    case "upcoming":
      end.setDate(end.getDate() + 30);
      break;
    case "today":
      break;
    default:
      return null;
  }
  return { start: dateOnly(start), end: dateOnly(end) };
}

function dateRange(message: string, resolvedIntent?: ChatIntentMatch | null): { start: string; end: string } | null {
  const now = new Date();
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const dateOnly = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const intentRange = resolvedIntent && resolvedIntent.confidence >= 0.55
    ? dateRangeFromIntent(resolvedIntent.timeRange, day, dateOnly)
    : null;
  if (intentRange) return intentRange;

  const text = normalizeChatMessage(message);
  if (text.includes("tomorrow")) {
    const tomorrow = new Date(day);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { start: dateOnly(tomorrow), end: dateOnly(tomorrow) };
  }
  if (text.includes("today")) return { start: dateOnly(day), end: dateOnly(day) };
  // Kitchen production and prep screens use a forward planning window. The
  // shared normalizer also handles transpositions and missing letters in
  // temporal phrases before this filter is built.
  if (/\bupcoming\b/.test(text) || /\bfuture\b/.test(text)) {
    const end = new Date(day);
    end.setDate(end.getDate() + 30);
    return { start: dateOnly(day), end: dateOnly(end) };
  }
  if (text.includes("this week") || text.includes("current week")) {
    const start = new Date(day);
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: dateOnly(start), end: dateOnly(end) };
  }
  if (text.includes("this month")) {
    const start = new Date(day.getFullYear(), day.getMonth(), 1);
    const end = new Date(day.getFullYear(), day.getMonth() + 1, 0);
    return { start: dateOnly(start), end: dateOnly(end) };
  }
  if (text.includes("last 90 days") || text.includes("past 90 days")) {
    const start = new Date(day);
    start.setDate(start.getDate() - 90);
    return { start: dateOnly(start), end: dateOnly(day) };
  }
  return null;
}

function applyDateRange(query: any, column: string, message: string, resolvedIntent?: ChatIntentMatch | null): any {
  const range = dateRange(message, resolvedIntent);
  if (!range) return query;
  // Orders store event_date as DATE, while kitchen prep tasks store start_at
  // as a timestamp. A date-only <= filter on start_at would keep only rows at
  // midnight and make real prep tasks appear missing.
  if (["start_at", "started_at", "clock_in", "created_at", "planned_start"].includes(column)) {
    const exclusiveEnd = new Date(`${range.end}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    return query
      .gte(column, `${range.start}T00:00:00.000Z`)
      .lt(column, exclusiveEnd.toISOString());
  }
  return query.gte(column, range.start).lte(column, range.end);
}

function isoDate(date: Date): string {
  // These values are date-only database filters. Using toISOString() here
  // would convert local midnight to the previous UTC date in positive-offset
  // time zones, making the chatbot disagree with the browser earnings page.
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Driver earnings uses the same inclusive date semantics as the earnings
 * page. The page defaults to the current month in the portal, so a plain
 * "my earnings" or "month earnings" question must also mean month-to-date.
 */
function driverEarningsRange(message: string, resolvedIntent?: ChatIntentMatch | null): { from: string; to: string; label: string } {
  const text = message.toLowerCase();
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const intentRange = resolvedIntent && resolvedIntent.confidence >= 0.55 && resolvedIntent.timeRange && resolvedIntent.timeRange !== "unspecified" && resolvedIntent.timeRange !== "all" && resolvedIntent.timeRange !== "upcoming"
    ? dateRangeFromIntent(resolvedIntent.timeRange, today, isoDate)
    : null;
  if (intentRange) {
    return {
      from: intentRange.start,
      to: intentRange.end,
      label: String(resolvedIntent?.timeRange || "selected period").replace(/_/g, " "),
    };
  }

  if (/\b(?:last|previous)\s+month\b/.test(text)) {
    const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastPreviousMonth = new Date(firstThisMonth);
    lastPreviousMonth.setDate(0);
    const firstPreviousMonth = new Date(lastPreviousMonth.getFullYear(), lastPreviousMonth.getMonth(), 1);
    return { from: isoDate(firstPreviousMonth), to: isoDate(lastPreviousMonth), label: "last month" };
  }

  if (/\b(?:this|current)\s+week\b/.test(text)) {
    const monday = new Date(today);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { from: isoDate(monday), to: isoDate(sunday), label: "this week" };
  }

  if (/\b(?:today|current day)\b/.test(text)) {
    return { from: isoDate(today), to: isoDate(today), label: "today" };
  }

  // This covers both "this month" and the natural shorter phrasing used in
  // the portal, such as "month earning".
  if (/\b(?:this|current|the|my)?\s*month(?:ly)?\b/.test(text) || /\b(?:earning|earnings|pay|wage|wages)\b/.test(text)) {
    const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: isoDate(firstThisMonth), to: isoDate(today), label: "this month" };
  }

  // Keep the chatbot aligned with the page's default period when no range
  // is stated: the last 30 days, inclusive.
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  return { from: isoDate(from), to: isoDate(today), label: "the last 30 days" };
}

const DRIVER_DELIVERY_ORDER_COLUMNS = "id, order_number, event_name, event_date, event_time, venue_name, venue_address, guest_count, status, delivery_status, delivery_time, collection_time, pickup_time, assigned_driver_id, driver_id, secondary_driver_id";

/**
 * Driver pages use order assignment columns as the source of truth because a
 * confirmed order can exist before dispatch creates a driver_assignments row.
 * The assistant must use the same source, then add dispatch status when a
 * matching assignment exists. This also prevents a stale assignment status
 * from hiding a still-upcoming order.
 */
async function loadDriverDeliveries(db: any, identity: ChatIdentity): Promise<any[]> {
  const assignments = await rows(db, "driver_assignments", (q) =>
    q.select("id, order_id, assignment_type, scheduled_for, status, en_route_at, arrived_at_venue_at, delivered_at, total_earnings, notes")
      .eq("company_id", identity.companyId)
      .eq("driver_id", identity.userId)
      .order("scheduled_for", { ascending: true, nullsFirst: false })
      .limit(100),
  );
  const assignmentByOrder = new Map<string, any>();
  for (const assignment of assignments) {
    if (assignment?.order_id && !assignmentByOrder.has(String(assignment.order_id))) {
      assignmentByOrder.set(String(assignment.order_id), assignment);
    }
  }

  const directOrders = await rows(db, "orders", (q) =>
    q.select(DRIVER_DELIVERY_ORDER_COLUMNS)
      .eq("company_id", identity.companyId)
      .is("deleted_at", null)
      .or(`assigned_driver_id.eq.${identity.userId},driver_id.eq.${identity.userId},secondary_driver_id.eq.${identity.userId}`)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true, nullsFirst: true })
      .limit(100),
  );
  const directIds = new Set(directOrders.map((order: any) => String(order?.id || "")).filter(Boolean));
  const missingLinkedIds = assignments
    .map((assignment: any) => String(assignment?.order_id || ""))
    .filter((id: string) => id && !directIds.has(id));
  const linkedOrders = missingLinkedIds.length
    ? await rows(db, "orders", (q) => q.select(DRIVER_DELIVERY_ORDER_COLUMNS).eq("company_id", identity.companyId).is("deleted_at", null).in("id", missingLinkedIds))
    : [];

  const merged = new Map<string, any>();
  for (const order of [...directOrders, ...linkedOrders]) {
    const orderId = String(order?.id || "");
    if (!orderId) continue;
    const assignment = assignmentByOrder.get(orderId);
    merged.set(orderId, {
      id: assignment?.id || orderId,
      order_id: orderId,
      assignment_type: assignment?.assignment_type || "delivery",
      scheduled_for: assignment?.scheduled_for || null,
      assignment_status: assignment?.status || null,
      en_route_at: assignment?.en_route_at || null,
      arrived_at_venue_at: assignment?.arrived_at_venue_at || null,
      delivered_at: assignment?.delivered_at || null,
      total_earnings: assignment?.total_earnings ?? null,
      notes: assignment?.notes || null,
      order_number: order.order_number || null,
      event_name: order.event_name || null,
      event_date: order.event_date || null,
      event_time: order.event_time || null,
      venue_name: order.venue_name || null,
      venue_address: order.venue_address || null,
      guest_count: order.guest_count ?? null,
      status: order.status || null,
      delivery_status: order.delivery_status || null,
      delivery_time: order.delivery_time || null,
      collection_time: order.collection_time || null,
      pickup_time: order.pickup_time || null,
    });
  }
  return [...merged.values()].sort((left, right) => {
    const leftKey = `${String(left.event_date || "9999-12-31")}T${String(left.event_time || "23:59:59")}`;
    const rightKey = `${String(right.event_date || "9999-12-31")}T${String(right.event_time || "23:59:59")}`;
    return leftKey.localeCompare(rightKey);
  });
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

function hasCompanyStaffScope(role: string): boolean {
  return ["super_admin", "owner", "company_admin", "region_admin", "admin"].includes(role);
}

function databaseWorkRole(role: string): string | null {
  switch (normalizeChatRole(role)) {
    case "driver": return "driver";
    case "waiter": return "waiter";
    case "kitchen_manager": return "kitchen_manager";
    case "kitchen_staff": return "kitchen";
    case "cleaning_manager": return "cleaning_manager";
    case "cleaning_staff": return "cleaning";
    case "shopping":
    case "shopping_staff": return "shopping";
    default: return null;
  }
}

type TeamDepartment = "kitchen" | "cleaning" | "shopping" | "driver" | "waiter" | "staff";

function teamDepartmentForRole(role: string): TeamDepartment | null {
  switch (normalizeChatRole(role)) {
    case "kitchen_manager":
    case "kitchen_staff": return "kitchen";
    case "cleaning_manager":
    case "cleaning_staff": return "cleaning";
    case "shopping":
    case "shopping_staff": return "shopping";
    case "driver": return "driver";
    case "waiter": return "waiter";
    case "staff": return "staff";
    default: return null;
  }
}

function requestedTeamDepartment(message: string): TeamDepartment | null {
  const text = normalizeChatMessage(message);
  if (/\b(?:kitchen|chef|cooks?)\b/.test(text)) return "kitchen";
  if (/\b(?:cleaning|cleaner|cleaners)\b/.test(text)) return "cleaning";
  if (/\b(?:shopping|shopper|shoppers|buying)\b/.test(text)) return "shopping";
  if (/\b(?:driver|drivers|delivery)\b/.test(text)) return "driver";
  if (/\b(?:waiter|waiters|waitering|service team)\b/.test(text)) return "waiter";
  return null;
}

function profileBelongsToTeam(profile: any, departmentRows: any[], department: TeamDepartment): boolean {
  const roleValues = [profile.role, profile.active_role].map((value) => String(value || "").toLowerCase());
  if (roleValues.some((value) => value === department || value === `${department}_staff` || value === `${department}_manager`)) return true;
  if (department === "staff" && roleValues.includes("staff")) return true;
  return departmentRows.some((row) => row.user_id === profile.id && String(row.department || "").toLowerCase() === department);
}

function durationHours(start: unknown, end: unknown): number | null {
  if (!start) return null;
  const startMs = new Date(String(start)).getTime();
  const endMs = end ? new Date(String(end)).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.round(((endMs - startMs) / 3_600_000) * 100) / 100;
}

async function loadAssignedWork(db: any, identity: ChatIdentity, message: string, resolvedIntent?: ChatIntentMatch | null): Promise<any> {
  const role = normalizeChatRole(identity.role);
  const companyId = identity.companyId;
  const adminScope = hasCompanyStaffScope(role);
  const result: Record<string, any> = { role, orders: [], tasks: [], attendance: [], as_of: new Date().toISOString() };

  if (role === "driver") {
    result.orders = await loadDriverDeliveries(db, identity);
  }

  if (role === "kitchen_manager" || role === "kitchen_staff" || adminScope) {
    result.tasks = await rows(db, "kitchen_prep_tasks", (q) => {
      let scoped = q.select("id, order_id, menu_item_name, task_type, status, start_at, duration_min, assigned_chef_id, notes")
        .eq("company_id", companyId).is("deleted_at", null);
      if (role === "kitchen_staff") scoped = scoped.eq("assigned_chef_id", identity.userId);
      return applyDateRange(scoped, "start_at", message, resolvedIntent).order("start_at", { ascending: true }).limit(80);
    });
    result.orders = await rows(db, "orders", (q) => {
      let scoped = q.select("id, order_number, event_name, event_date, event_time, venue_name, guest_count, status, assigned_chef_id")
        .eq("company_id", companyId).is("deleted_at", null).not("status", "in", "(cancelled,paused)");
      if (role === "kitchen_staff") scoped = scoped.eq("assigned_chef_id", identity.userId);
      return applyDateRange(scoped, "event_date", message, resolvedIntent).order("event_date", { ascending: true }).limit(60);
    });
  }

  if (role === "waiter" || (adminScope && role !== "client")) {
    let attendanceQuery = db.from("event_attendance")
      .select("id, order_id, waiter_id, arrived_at, setup_started_at, guests_arrived_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at, work_started_at, work_ended_at, work_end_reason, work_end_note, notes")
      .eq("company_id", companyId).order("arrived_at", { ascending: true, nullsFirst: false }).limit(80);
    if (role === "waiter") attendanceQuery = attendanceQuery.eq("waiter_id", identity.userId);
    result.attendance = await rows(db, "event_attendance", () => attendanceQuery);
    const orderIds = result.attendance.map((item: any) => item.order_id).filter(Boolean);
    if (orderIds.length) {
      result.orders = [...result.orders, ...await rows(db, "orders", (q) => q.select("id, order_number, event_name, event_date, event_time, venue_name, guest_count, status").eq("company_id", companyId).in("id", orderIds))];
    }
  }

  if (role === "shopping" || role === "shopping_staff") {
    result.tasks = await rows(db, "shopping_lists", (q) => {
      let scoped = q.select("id, title, list_date, status, estimated_total, actual_total, shopper_id, notes").eq("company_id", companyId);
      if (!adminScope) scoped = scoped.eq("shopper_id", identity.userId);
      return applyDateRange(scoped, "list_date", message, resolvedIntent).order("list_date", { ascending: false }).limit(50);
    });
  }

  if (role === "cleaning_manager" || role === "cleaning_staff" || role === "kitchen_manager" || role === "kitchen_staff" || adminScope) {
    const shifts = await rows(db, "kitchen_shifts", (q) => {
      let scoped = q.select("id, staff_id, shift_date, shift_type, status, planned_start, planned_end, actual_start, actual_end, notes")
        .eq("company_id", companyId).is("deleted_at", null);
      if (!adminScope) scoped = scoped.eq("staff_id", identity.userId);
      return applyDateRange(scoped, "shift_date", message, resolvedIntent).order("shift_date", { ascending: true }).limit(80);
    });
    const shiftIds = shifts.map((item: any) => item.id).filter(Boolean);
    const taskRows = shiftIds.length ? await rows(db, "staff_shift_tasks", (q) => q.select("id, shift_id, task_type, planned_start, planned_end, actual_start, actual_end, billable, related_entity_type, related_entity_id, notes").eq("company_id", companyId).in("shift_id", shiftIds).is("deleted_at", null).order("planned_start", { ascending: true }).limit(100)) : [];
    result.tasks = [...result.tasks, ...taskRows, ...shifts];
  }

  return result;
}

export async function runLiveTool(db: any, identity: ChatIdentity, tool: LiveToolDefinition, message = "", resolvedIntent?: ChatIntentMatch | null): Promise<any> {
  // Direct callers (including portal adapters and tests) can still provide a
  // legacy department label such as `kitchen` or `buyer`. Normalize here as
  // well as during selection so the final authorization check and every
  // per-role scope below use the same canonical role.
  identity = { ...identity, role: normalizeChatRole(identity.role) };
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
      const company = (await rows(db, "companies", (q) => q.select("company_name, slug, currency, timezone, subscription_status, subscription_plan").eq("id", companyId).maybeSingle()))[0] || null;
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
        return rows(db, "orders", (q) => applyDateRange(q.select("id, order_number, event_name, event_date, event_time, venue_name, venue_address, guest_count, status, total_amount, payment_status").eq("company_id", companyId).eq("client_id", client.id), "event_date", message, resolvedIntent).order("event_date", { ascending: true }).limit(30));
      }
      return rows(db, "orders", (q) => applyDateRange(scopeRegionQuery(q.select("id, order_number, event_name, event_date, event_time, venue_name, guest_count, status, payment_status, region_id"), identity).eq("company_id", companyId), "event_date", message, resolvedIntent).order("event_date", { ascending: true }).limit(50));
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
      return loadDriverDeliveries(db, identity);
    case "driver_earnings": {
      if (identity.role !== "driver" || !identity.companyId) return null;
      const period = driverEarningsRange(message, resolvedIntent);
      try {
        const summary = await driverPayService.getPaySummary({
          companyId: identity.companyId,
          driverId: identity.userId,
          range: { from: period.from, to: period.to },
        }, db);
        return {
          period: { from: period.from, to: period.to, label: period.label },
          rates: summary.rates,
          totals: summary.totals,
          shifts: summary.shifts.map((shift) => ({
            date: shift.shift_date || null,
            hours: shift.hours,
            multiplier: shift.multiplier,
            hourly_rate: shift.hourly_rate,
            pay: shift.pay,
          })),
          deliveries: summary.deliveries.map((delivery) => ({
            order_number: delivery.order_number || delivery.order_id,
            event_name: delivery.event_name || null,
            distance_km: delivery.distance_km,
            distance_pay: delivery.distance_pay,
            callout_fee: delivery.callout_fee,
            total: delivery.total,
          })),
          as_of: new Date().toISOString(),
        };
      } catch (error: any) {
        console.error("[chatbot] driver earnings tool failed:", error?.message || "unknown error");
        return null;
      }
    }
    case "delivery_orders": {
      const assignments = await runLiveTool(db, identity, getLiveToolDefinition("assigned_deliveries")!, message, resolvedIntent);
      const ids = (assignments || []).map((item: any) => item.order_id).filter(Boolean);
      return ids.length ? rows(db, "orders", (q) => q.select("id, order_number, event_name, event_date, event_time, venue_name, venue_address, guest_count, status, delivery_time, collection_time").eq("company_id", companyId).in("id", ids)) : [];
    }
    case "kitchen_orders":
      return rows(db, "orders", (q) => applyDateRange(
        q.select("id, order_number, event_name, event_date, event_time, guest_count, venue_name, status, kitchen_instructions, assigned_chef_id")
          .eq("company_id", companyId)
          .not("status", "in", "(cancelled,paused)")
          .is("deleted_at", null),
          "event_date",
          message,
          resolvedIntent,
      ).order("event_date", { ascending: true }).order("event_time", { ascending: true, nullsFirst: true }).limit(50));
    case "kitchen_prep_tasks":
      return rows(db, "kitchen_prep_tasks", async (q) => {
        const result = await applyDateRange(
          q.select("id, order_id, menu_item_name, task_type, status, start_at, duration_min, assigned_chef_id, notes")
            .eq("company_id", companyId)
            .is("deleted_at", null),
          "start_at",
          message,
          resolvedIntent,
        ).order("start_at", { ascending: true }).limit(60);
        const data = Array.isArray(result?.data) ? result.data : [];
        return result?.error || result?.data == null
          ? result
          : {
            ...result,
            data: data.map((task: any) => ({
              ...task,
              // Keep the chatbot payload vocabulary readable while matching
              // the real kitchen_prep_tasks schema used by the portal.
              task_name: task.menu_item_name,
              scheduled_start: task.start_at,
              scheduled_end: task.start_at && task.duration_min != null
                ? new Date(new Date(task.start_at).getTime() + Number(task.duration_min) * 60_000).toISOString()
                : null,
            })),
          };
      });
    case "kitchen_inventory":
    case "shopping_inventory":
    case "operations_inventory":
      return rows(db, "inventory_items", (q) => q.select("item_name, category, unit_of_measure, current_stock, minimum_stock, reorder_quantity, preferred_supplier_id").eq("company_id", companyId).is("deleted_at", null).limit(150));
    case "shopping_lists":
      return rows(db, "shopping_lists", (q) => applyDateRange(q.select("id, title, list_date, status, estimated_total, actual_total, shopper_id, notes").eq("company_id", companyId), "list_date", message, resolvedIntent).order("list_date", { ascending: false }).limit(30));
    case "cleaning_equipment":
      return rows(db, "equipment", (q) => q.select("id, name, category, condition, quantity, available, requires_cleaning, next_available_at, last_cleaned").eq("company_id", companyId).limit(100));
    case "cleaning_damage_reports":
      return rows(db, "equipment_damages", (q) => q.select("id, equipment_id, damage_type, severity, status, description, reported_at").eq("company_id", companyId).order("reported_at", { ascending: false }).limit(60));
    case "sales_orders":
    case "operations_orders":
      return rows(db, "orders", (q) => applyDateRange(scopeRegionQuery(q.select("id, order_number, event_name, event_date, event_time, venue_name, guest_count, status, total_amount, payment_status, region_id"), identity).eq("company_id", companyId), "event_date", message, resolvedIntent).order("event_date", { ascending: true }).limit(60));
    case "sales_quotes":
      return rows(db, "quotes", (q) => applyDateRange(scopeRegionQuery(q.select("quote_number, quote_name, event_date, guest_count, status, total_amount, valid_until, client_name, region_id"), identity).eq("company_id", companyId).is("deleted_at", null), "event_date", message, resolvedIntent).order("created_at", { ascending: false }).limit(60));
    case "sales_leads":
      return rows(db, "leads", (q) => applyDateRange(scopeRegionQuery(q.select("contact_name, client_name, event_date, event_type, guest_count, status, assigned_to, created_at, region_id"), identity).eq("company_id", companyId).is("deleted_at", null), "created_at", message, resolvedIntent).order("created_at", { ascending: false }).limit(60));
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
    case "team_roster": {
      const profiles = await rows(db, "profiles", (q) => q.select("id, full_name, role, active_role, is_active").eq("company_id", companyId).neq("is_active", false).is("deleted_at", null).order("full_name", { ascending: true }).limit(300));
      const profileIds = profiles.map((profile: any) => profile.id).filter(Boolean);
      const departmentRows = profileIds.length
        ? await rows(db, "user_departments", (q) => q.select("user_id, department").in("user_id", profileIds))
        : [];
      // Workers can inspect the public roster for their own department. Office
      // roles may name a department in the question; without one they get
      // the complete non-private company roster.
      const requested = requestedTeamDepartment(message);
      const department = hasCompanyStaffScope(identity.role)
        ? requested
        : teamDepartmentForRole(identity.role);
      const filtered = department
        ? profiles.filter((profile: any) => profileBelongsToTeam(profile, departmentRows, department))
        : profiles;
      return {
        department,
        members: filtered.map((profile: any) => ({
          id: profile.id,
          full_name: profile.full_name,
          role: profile.role,
          active_role: profile.active_role,
          is_active: profile.is_active !== false,
        })),
        private_fields_excluded: ["email", "phone", "hourly_rate", "earnings"],
      };
    }
    case "staff_orders":
      return loadAssignedWork(db, identity, message, resolvedIntent);
    case "order_items": {
      const clientOrderRows = identity.role === "client"
        ? await (async () => {
          const client = (await rows(db, "clients", (q) => q.select("id").eq("company_id", companyId).eq("user_id", identity.userId).maybeSingle()))[0];
          return client?.id
            ? await rows(db, "orders", (q) => applyDateRange(q.select("id, order_number, event_name, event_date, event_time, guest_count, venue_name, status, dietary_requirements, special_instructions").eq("company_id", companyId).eq("client_id", client.id).is("deleted_at", null), "event_date", message, resolvedIntent).order("event_date", { ascending: true }).limit(30))
            : [];
        })()
        : await rows(db, "orders", (q) => applyDateRange(q.select("id, order_number, event_name, event_date, event_time, guest_count, venue_name, status, dietary_requirements, special_instructions").eq("company_id", companyId).is("deleted_at", null).not("status", "in", "(cancelled,paused)"), "event_date", message, resolvedIntent).order("event_date", { ascending: true }).limit(60));
      const orderIds = clientOrderRows.map((order: any) => order.id).filter(Boolean);
      const itemRows = orderIds.length
        ? await rows(db, "order_items", (q) => q.select("id, order_id, menu_item_id, item_name, description, quantity, unit_price, line_total, special_instructions").in("order_id", orderIds).limit(300))
        : [];
      const itemsByOrder = new Map<string, any[]>();
      for (const item of itemRows) {
        const key = String(item.order_id);
        itemsByOrder.set(key, [...(itemsByOrder.get(key) || []), item]);
      }
      return clientOrderRows.map((order: any) => ({ ...order, items: itemsByOrder.get(String(order.id)) || [] }));
    }
    case "inventory_movements":
      return rows(db, "inventory_transactions", (q) => applyDateRange(q.select("id, inventory_item_id, transaction_type, quantity, unit_cost, order_id, supplier_id, reference_number, notes, performed_by, created_at").eq("company_id", companyId), "created_at", message, resolvedIntent).order("created_at", { ascending: false }).limit(120));
    case "catalogue_menu": {
      const menu = await rows(db, "menu_items", (q) => q.select("id, item_name, description, category, base_price, cost_per_unit, is_available, dietary_tags, allergen_info").eq("company_id", companyId).is("deleted_at", null).order("item_name", { ascending: true }).limit(200));
      const menuIds = menu.map((item: any) => item.id).filter(Boolean);
      const recipes = menuIds.length ? await rows(db, "recipes", (q) => q.select("id, menu_item_id, recipe_name, base_servings, prep_time_minutes, cook_time_minutes, instructions").eq("company_id", companyId).in("menu_item_id", menuIds).limit(200)) : [];
      return { menu_items: menu, recipes };
    }
    case "supplier_records":
      return rows(db, "suppliers", (q) => q.select("id, supplier_name, contact_person, email, phone, city, payment_terms, rating, is_active, notes").eq("company_id", companyId).is("deleted_at", null).order("supplier_name", { ascending: true }).limit(200));
    case "delivery_tracking": {
      const isDriver = identity.role === "driver";
      const assignments = await rows(db, "driver_assignments", (q) => {
        let scoped = q.select("id, order_id, driver_id, status, accepted_at, en_route_at, picked_up_at, arrived_at_venue_at, delivered_at, total_earnings, notes").eq("company_id", companyId).order("created_at", { ascending: false }).limit(100);
        if (isDriver) scoped = scoped.eq("driver_id", identity.userId);
        return scoped;
      });
      const assignmentIds = assignments.map((assignment: any) => assignment.id).filter(Boolean);
      const locations = assignmentIds.length
        ? await rows(db, "gps_tracking_logs", (q) => q.select("driver_id, assignment_id, latitude, longitude, accuracy_meters, speed_kmh, heading_degrees, recorded_at").in("assignment_id", assignmentIds).order("recorded_at", { ascending: false }).limit(100))
        : [];
      return { assignments, latest_locations: locations };
    }
    case "vehicle_status":
      return rows(db, "vehicles", (q) => q.select("id, plate, vehicle_type, last_serviced_at, next_service_due, service_interval_days, current_odometer_km, created_at").eq("company_id", companyId).order("plate", { ascending: true, nullsFirst: false }).limit(100));
    case "cleaning_schedules":
      return rows(db, "cleaning_schedules", (q) => {
        let scoped = q.select("id, area_name, description, frequency, scheduled_date, scheduled_time, assigned_to, status, started_at, completed_at, completed_by, notes").eq("company_id", companyId);
        if (identity.role === "cleaning_staff") scoped = scoped.eq("assigned_to", identity.userId);
        return applyDateRange(scoped, "scheduled_date", message, resolvedIntent).order("scheduled_date", { ascending: true }).order("scheduled_time", { ascending: true, nullsFirst: true }).limit(100);
      });
    case "reviews_feedback": {
      if (identity.role === "client") {
        const client = (await rows(db, "clients", (q) => q.select("id").eq("company_id", companyId).eq("user_id", identity.userId).maybeSingle()))[0];
        return client?.id ? rows(db, "delivery_feedback", (q) => q.select("order_id, overall_rating, comments, is_public, created_at").eq("company_id", companyId).eq("client_id", client.id).order("created_at", { ascending: false }).limit(30)) : [];
      }
      const [feedback, complaints] = await Promise.all([
        rows(db, "delivery_feedback", (q) => q.select("id, order_id, client_id, food_quality_rating, delivery_timeliness_rating, driver_professionalism_rating, overall_rating, comments, is_public, requires_follow_up, followed_up_at, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(100)),
        rows(db, "complaint_tickets", (q) => q.select("id, ticket_number, order_id, complainant_name, category, severity, subject, status, created_at, resolved_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(100)),
      ]);
      return { feedback, complaints };
    }
    case "supplier_payables":
      return rows(db, "supplier_payables", (q) => applyDateRange(q.select("id, supplier_id, amount_cents, due_date, invoice_ref, notes, status, paid_at, created_at").eq("company_id", companyId).is("deleted_at", null), "due_date", message, resolvedIntent).order("due_date", { ascending: true }).limit(120));
    case "notification_preferences":
      return (await rows(db, "email_notification_preferences", (q) => q.select("order_confirmed, order_status_changed, order_ready_for_pickup, order_delivered, order_cancelled, driver_assigned, task_assigned, payment_received, payment_due, invoice_sent, low_stock_alert, out_of_stock_alert, daily_summary, weekly_report, updated_at").eq("user_id", identity.userId).maybeSingle()))[0] || null;
    case "work_clock_status": {
      const sessions = await rows(db, "role_work_sessions", (q) => q.select("id, role, order_id, started_at, ended_at, end_reason, end_note, created_at, updated_at").eq("company_id", companyId).eq("user_id", identity.userId).order("started_at", { ascending: false }).limit(40));
      return {
        active: sessions.find((session: any) => !session.ended_at) || null,
        sessions: sessions.map((session: any) => ({ ...session, duration_hours: durationHours(session.started_at, session.ended_at) })),
        one_active_timer_rule: true,
        as_of: new Date().toISOString(),
      };
    }
    case "work_hours": {
      const text = message.toLowerCase();
      const companyWide = hasCompanyStaffScope(identity.role) && /\b(?:staff|team|employees?|everyone|all users?)\b/.test(text);
      const queryRows = await rows(db, "staff_work_sessions", (q) => {
        let scoped = q.select("id, staff_id, clock_in, clock_out, session_date, total_hours, total_earnings, payment_status, entered_manually, entry_reason")
          .eq("company_id", companyId);
        if (!companyWide) scoped = scoped.eq("staff_id", identity.userId);
        return applyDateRange(scoped, "session_date", message, resolvedIntent).order("clock_in", { ascending: false }).limit(companyWide ? 500 : 100);
      });
      return {
        scope: companyWide ? "company" : "me",
        sessions: queryRows.map((session: any) => ({ ...session, calculated_hours: session.total_hours ?? durationHours(session.clock_in, session.clock_out) })),
        total_hours: queryRows.reduce((sum: number, session: any) => sum + Number(session.total_hours ?? durationHours(session.clock_in, session.clock_out) ?? 0), 0),
        as_of: new Date().toISOString(),
      };
    }
    case "order_work_hours": {
      const companyWide = hasCompanyStaffScope(identity.role);
      const sessions = await rows(db, "role_work_sessions", (q) => {
        let scoped = q.select("id, user_id, role, order_id, started_at, ended_at, end_reason, end_note").eq("company_id", companyId).not("order_id", "is", null);
        if (!companyWide) scoped = scoped.eq("user_id", identity.userId);
        return applyDateRange(scoped, "started_at", message, resolvedIntent).order("started_at", { ascending: false }).limit(250);
      });
      const orderIds = [...new Set(sessions.map((session: any) => session.order_id).filter(Boolean))];
      const orders = orderIds.length ? await rows(db, "orders", (q) => q.select("id, order_number, event_name, event_date, event_time, venue_name").eq("company_id", companyId).in("id", orderIds)) : [];
      const orderById = new Map(orders.map((order: any) => [String(order.id), order]));
      return {
        scope: companyWide ? "company" : "me",
        sessions: sessions.map((session: any) => ({
          ...session,
          duration_hours: durationHours(session.started_at, session.ended_at),
          order: orderById.get(String(session.order_id)) || null,
        })),
        total_hours: sessions.reduce((sum: number, session: any) => sum + Number(durationHours(session.started_at, session.ended_at) || 0), 0),
        as_of: new Date().toISOString(),
      };
    }
    case "daily_operations_tasks": {
      const settings = (await rows(db, "company_daily_operations_settings", (q) => q.select("kitchen_cleaning_enabled, kitchen_cleaning_time, kitchen_cleaning_title, kitchen_cleaning_description, kitchen_cleaning_lead_hours, kitchen_cleaning_target, equipment_cleaning_enabled, equipment_cleaning_time, equipment_cleaning_title, equipment_cleaning_description, equipment_cleaning_lead_hours, equipment_cleaning_target, admin_notifications_enabled").eq("company_id", companyId).maybeSingle()))[0] || null;
      const allTasks = await rows(db, "daily_operations_tasks", (q) => applyDateRange(q.select("id, task_kind, task_date, scheduled_time, scheduled_at, title, description, target_roles, status, assigned_to, started_at, completed_at, completed_by, notes, staff_notified_at, admin_notified_at").eq("company_id", companyId), "task_date", message, resolvedIntent).order("task_date", { ascending: true }).order("scheduled_time", { ascending: true }).limit(100));
      const workerRole = databaseWorkRole(identity.role) || identity.role;
      const tasks = hasCompanyStaffScope(identity.role)
        ? allTasks
        : allTasks.filter((task: any) => task.assigned_to === identity.userId || (Array.isArray(task.target_roles) && task.target_roles.some((target: string) => [workerRole, identity.role, "both", "all"].includes(String(target).toLowerCase()))));
      return { settings, tasks, as_of: new Date().toISOString() };
    }
    case "staff_shift_schedule": {
      const workerRole = databaseWorkRole(identity.role);
      const shifts = await rows(db, "kitchen_shifts", (q) => {
        let scoped = q.select("id, staff_id, shift_date, shift_type, planned_start, planned_end, actual_start, actual_end, status, notes, order_id")
          .eq("company_id", companyId).is("deleted_at", null);
        if (!hasCompanyStaffScope(identity.role)) scoped = scoped.eq("staff_id", identity.userId);
        if (workerRole === "driver") scoped = scoped.in("shift_type", ["delivery", "general"]);
        else if (workerRole === "cleaning" || workerRole === "cleaning_manager") scoped = scoped.in("shift_type", ["cleaning", "kitchen_and_cleaning", "general"]);
        else if (workerRole === "kitchen" || workerRole === "kitchen_manager") scoped = scoped.in("shift_type", ["kitchen", "kitchen_and_cleaning", "general"]);
        return applyDateRange(scoped, "shift_date", message, resolvedIntent).order("shift_date", { ascending: true }).limit(120);
      });
      const shiftIds = shifts.map((shift: any) => shift.id).filter(Boolean);
      const tasks = shiftIds.length ? await rows(db, "staff_shift_tasks", (q) => q.select("id, shift_id, task_type, planned_start, planned_end, actual_start, actual_end, planned_minutes, billable, related_entity_type, related_entity_id, notes").eq("company_id", companyId).in("shift_id", shiftIds).is("deleted_at", null).order("planned_start", { ascending: true }).limit(200)) : [];
      return { shifts, tasks, as_of: new Date().toISOString() };
    }
    case "waiter_service_assignments": {
      const assignments = await rows(db, "event_attendance", (q) => {
        let scoped = q.select("id, order_id, waiter_id, arrived_at, setup_started_at, guests_arrived_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at, work_started_at, work_ended_at, work_end_reason, work_end_note, notes")
          .eq("company_id", companyId).order("arrived_at", { ascending: true, nullsFirst: false }).limit(100);
        if (identity.role === "waiter") scoped = scoped.eq("waiter_id", identity.userId);
        return scoped;
      });
      const orderIds = [...new Set(assignments.map((assignment: any) => assignment.order_id).filter(Boolean))];
      const orders = orderIds.length ? await rows(db, "orders", (q) => q.select("id, order_number, event_name, event_date, event_time, venue_name, venue_address, guest_count, status").eq("company_id", companyId).in("id", orderIds)) : [];
      const orderById = new Map(orders.map((order: any) => [String(order.id), order]));
      return { assignments: assignments.map((assignment: any) => ({ ...assignment, order: orderById.get(String(assignment.order_id)) || null, work_hours: durationHours(assignment.work_started_at, assignment.work_ended_at) })), as_of: new Date().toISOString() };
    }
    case "cleaning_work_tasks": {
      const jobs = await rows(db, "cleaning_jobs", (q) => applyDateRange(q.select("id, equipment_id, quantity, method, machine_id, shift_task_id, planned_start, planned_end, actual_start, actual_end, status, triggered_by_event_id, notes").eq("company_id", companyId).is("deleted_at", null), "planned_start", message, resolvedIntent).order("planned_start", { ascending: true }).limit(120));
      if (hasCompanyStaffScope(identity.role) || identity.role === "cleaning_manager") return { jobs, as_of: new Date().toISOString() };
      const shifts = await rows(db, "kitchen_shifts", (q) => q.select("id").eq("company_id", companyId).eq("staff_id", identity.userId).is("deleted_at", null).limit(40));
      const shiftIds = shifts.map((shift: any) => shift.id).filter(Boolean);
      const assignedTasks = shiftIds.length ? await rows(db, "staff_shift_tasks", (q) => q.select("id").eq("company_id", companyId).in("shift_id", shiftIds).eq("task_type", "cleaning").is("deleted_at", null).limit(100)) : [];
      const assignedIds = new Set(assignedTasks.map((task: any) => String(task.id)));
      return { jobs: jobs.filter((job: any) => job.shift_task_id && assignedIds.has(String(job.shift_task_id))), as_of: new Date().toISOString() };
    }
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

export async function runLiveTools(db: any, identity: ChatIdentity, message: string, policy: LiveToolPolicyMap = {}, resolvedIntent?: ChatIntentMatch | null): Promise<Record<string, any>> {
  const selected = selectLiveTools(normalizeChatRole(identity.role), message, policy, resolvedIntent);
  const [entries, dynamic] = await Promise.all([
    Promise.all(selected.map(async (tool) => [tool.id, await runLiveTool(db, identity, tool, message, resolvedIntent)] as const)),
    runDynamicTools(db, identity, message, resolvedIntent),
  ]);
  // Custom tools matched the manager-defined question phrases, so keep them
  // first. Large built-in result sets must not push the requested result out
  // of the bounded assistant context.
  return { ...dynamic, ...Object.fromEntries(entries) };
}
