import type { ChatIntentDefinition, IntentCatalogNavigation, IntentCatalogTool, IntentCatalogWorkflow } from "./types";

export const CHAT_ROLES = [
  "super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin",
  "kitchen_manager", "kitchen_staff", "shopping_staff", "shopping", "driver", "waiter",
  "cleaning_manager", "cleaning_staff", "client", "staff",
] as const;
const ALL_ROLES = [...CHAT_ROLES];

/** Stable capabilities shared by every deployment, independent of live tools. */
export const CORE_CHAT_INTENTS: readonly ChatIntentDefinition[] = [
  { id: "account.help", domain: "account", action: "explain", entity: "help", roles: ALL_ROLES, toolIds: [], navigationRefs: [], phrases: ["how can you help me", "what can you do", "how do i use this assistant"], keywords: ["help", "assist", "support", "capabilities"], priority: 30, description: "Explain the signed-in role's assistant capabilities." },
  { id: "client.portal.explain", domain: "client", action: "explain", entity: "portal_journey", roles: ["client"], toolIds: [], navigationRefs: ["client.dashboard", "client.quotes.waiting", "client.bookings.list", "client.billing.invoices", "client.tracking.live", "client.feedback"], phrases: ["how does cateringms work for me", "how does the client portal work", "what happens with my event", "explain my event journey"], keywords: ["cateringms", "client portal", "event journey", "booking process", "what happens next"], priority: 95, description: "Explain the client's CateringMS journey from quote through delivery and feedback." },
  { id: "client.billing.balance", domain: "client", action: "read", entity: "balance_due", roles: ["client"], toolIds: ["client_balance"], navigationRefs: ["client.billing.invoices"], phrases: ["how much do i owe", "how much do i have to pay", "what is my outstanding balance", "how much money remains to pay", "how much is left to pay", "what do i still owe"], keywords: ["owe", "owing", "remaining", "left to pay", "outstanding balance", "balance due", "amount due", "money left", "pay now"], patterns: [/\b(?:how much|what(?:'s| is))[^\n]*\b(?:owe|pay|remaining|left|due)\b/, /\b(?:remaining|left|outstanding|due)\b[^\n]*\b(?:pay|balance|amount|money)\b/], priority: 116, description: "Return the signed-in client's exact outstanding amount and unpaid invoice breakdown." },
  { id: "customer.balances", domain: "sales", action: "read", entity: "customer_balances", roles: ["super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin"], toolIds: ["customer_balances"], navigationRefs: ["admin.invoices"], phrases: ["show customer balances", "which clients owe money", "how much do customers owe", "outstanding balances by client"], keywords: ["customer balances", "client balances", "outstanding balances", "who owes", "owing customers"], patterns: [/\b(?:customers?|clients?)\b[^\n]*\b(?:owe|owing|outstanding|balance|due)\b/, /\b(?:owe|owing|outstanding|balance|due)\b[^\n]*\b(?:customers?|clients?)\b/], priority: 105, description: "Summarize outstanding customer balances for the authorized company or region." },
  { id: "client.insights", domain: "client", action: "read", entity: "personal_insights", roles: ["client"], toolIds: ["client_insights"], navigationRefs: ["client.dashboard", "client.bookings.list", "client.billing.invoices"], phrases: ["give me my booking insights", "show my catering statistics", "my event summary", "my booking history summary"], keywords: ["insights", "statistics", "stats", "summary", "totals", "history", "spend", "activity"], priority: 95, description: "Summarize the signed-in client's own booking, guest, quote, payment, and feedback statistics." },
  { id: "account.profile", domain: "account", action: "read", entity: "profile", roles: ALL_ROLES, toolIds: ["current_user_profile"], navigationRefs: ["account.profile"], phrases: ["my profile", "my account", "who am i", "my role", "my details"], keywords: ["profile", "account", "details", "role", "email", "phone"], priority: 70, description: "The signed-in user's own account details." },
  { id: "account.security", domain: "account", action: "navigate", entity: "security", roles: ALL_ROLES, toolIds: [], navigationRefs: ["account.settings.security"], phrases: ["change password", "reset password", "password security", "account security"], keywords: ["password", "security", "reset", "change"], priority: 110, description: "Open account security and password settings." },
  { id: "account.notifications", domain: "account", action: "navigate", entity: "notifications", roles: ALL_ROLES, toolIds: ["user_notifications"], navigationRefs: ["all.notifications"], phrases: ["my notifications", "show my alerts", "notification settings"], keywords: ["notification", "notifications", "alert", "alerts", "messages"], priority: 75, description: "Read user notifications or open notification settings." },
  { id: "workspace.today", domain: "operations", action: "read", entity: "today", roles: ALL_ROLES, toolIds: ["staff_orders"], navigationRefs: [], phrases: ["what is my work today", "what do i have today", "my tasks today", "today's work"], keywords: ["today", "work", "tasks", "duties", "schedule", "events"], priority: 65, description: "Current work assigned to the signed-in person." },
  { id: "workspace.upcoming", domain: "operations", action: "read", entity: "upcoming", roles: ALL_ROLES, toolIds: ["staff_orders"], navigationRefs: [], phrases: ["upcoming work", "upcoming events", "what is coming up", "next jobs"], keywords: ["upcoming", "future", "next", "coming", "schedule", "events"], priority: 65, description: "Upcoming work and events visible to the signed-in person." },
  { id: "kitchen.inventory.status", domain: "kitchen", action: "read", entity: "inventory", roles: ["kitchen_manager", "kitchen_staff"], toolIds: ["kitchen_inventory"], navigationRefs: ["kitchen.stock"], phrases: ["stock levels", "low stock", "ingredient shortage", "what ingredients are low", "items too low", "items too less"], keywords: ["stock", "inventory", "ingredient", "ingredients", "item", "items", "shortage", "restock", "reorder", "low"], patterns: [/\b(?:item|items|ingredient|ingredients)\b[\s\S]*\b(?:low|less|shortage|enough|need|have)\b/, /\b(?:low|less|shortage|enough|need)\b[\s\S]*\b(?:item|items|ingredient|ingredients|stock)\b/], priority: 100, description: "Kitchen ingredient stock and shortages." },
  { id: "kitchen.schedule.upcoming", domain: "kitchen", action: "read", entity: "schedule", roles: ["kitchen_manager", "kitchen_staff"], toolIds: ["kitchen_orders", "kitchen_prep_tasks"], navigationRefs: ["kitchen.today", "kitchen.production", "kitchen.stock"], phrases: ["upcoming events", "upcoming orders", "future kitchen work", "next kitchen events", "this week kitchen work"], keywords: ["upcoming", "future", "events", "orders", "schedule", "work", "prep", "production", "week"], patterns: [/\b(?:upcoming|future)\b/, /\b(?:this week|next week)\b/, /\b(?:next|coming)\b[\s\S]*\b(?:event|order|work|prep|production)\b/], priority: 99, description: "Upcoming kitchen events, orders, and preparation work." },
  { id: "kitchen.schedule.today", domain: "kitchen", action: "read", entity: "schedule", roles: ["kitchen_manager", "kitchen_staff"], toolIds: ["kitchen_orders", "kitchen_prep_tasks"], navigationRefs: ["kitchen.today", "kitchen.production", "kitchen.stock"], phrases: ["today's kitchen work", "today's prep", "events today", "today's orders", "what do i have today"], keywords: ["today", "events", "orders", "work", "prep", "production", "schedule"], patterns: [/\b(?:today|current)\b[\s\S]*\b(?:event|order|work|task|prep|production|schedule|anything|something|have)\b/], priority: 98, description: "Today's kitchen orders and prep tasks." },
  { id: "kitchen.production", domain: "kitchen", action: "navigate", entity: "production", roles: ["kitchen_manager", "kitchen_staff"], toolIds: ["kitchen_orders", "kitchen_prep_tasks"], navigationRefs: ["kitchen.production", "kitchen.prep"], phrases: ["production board", "production plan", "kitchen production", "production handoff"], keywords: ["production", "handoff", "cook", "cooking"], priority: 80, description: "Kitchen production board and handoffs." },
  { id: "driver.deliveries", domain: "driver", action: "read", entity: "deliveries", roles: ["driver"], toolIds: ["assigned_deliveries", "delivery_orders"], navigationRefs: ["driver.deliveries", "driver.routes"], phrases: ["my deliveries", "upcoming deliveries", "assigned deliveries", "my route"], keywords: ["delivery", "deliveries", "route", "routes", "assigned", "collection", "pickup"], priority: 85, description: "Assigned and upcoming driver deliveries." },
  { id: "driver.earnings", domain: "driver", action: "read", entity: "earnings", roles: ["driver"], toolIds: ["driver_earnings"], navigationRefs: ["driver.earnings"], phrases: ["my earnings", "shift hours", "hours worked", "month earnings"], keywords: ["earning", "earnings", "pay", "wage", "hours", "shift"], priority: 90, description: "Driver hours and earnings." },
  { id: "shopping.inventory", domain: "shopping", action: "read", entity: "inventory", roles: ["shopping_staff", "shopping"], toolIds: ["shopping_inventory", "shopping_lists"], navigationRefs: ["shopping.inventory", "shopping.buy-list"], phrases: ["shopping inventory", "what needs restocking", "items to buy", "buy list"], keywords: ["shopping", "inventory", "restock", "buy", "supplier", "shortage"], priority: 80, description: "Shopping stock and purchase list." },
  { id: "cleaning.work", domain: "cleaning", action: "read", entity: "cleaning_work", roles: ["cleaning_manager", "cleaning_staff"], toolIds: ["cleaning_equipment", "cleaning_damage_reports"], navigationRefs: ["cleaning.tasks", "cleaning.equipment"], phrases: ["cleaning work", "cleaning tasks", "equipment to clean", "damage reports"], keywords: ["cleaning", "equipment", "damage", "tasks", "inspection"], priority: 80, description: "Cleaning tasks, equipment, and damage reports." },
  { id: "platform.overview", domain: "platform", action: "read", entity: "overview", roles: ["super_admin"], toolIds: ["platform_dashboard_metrics", "registered_companies", "platform_user_count", "active_subscription_plans"], navigationRefs: ["platform.dashboard"], phrases: ["platform overview", "whole platform summary", "all company metrics"], keywords: ["platform", "overview", "summary", "metrics", "dashboard", "companies"], priority: 120, description: "Platform-wide metrics for the platform owner." },
];

function words(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((word) => word.length > 1);
}

function inferDomain(item: { id?: string; ref?: string; label: string; category?: string }): ChatIntentDefinition["domain"] {
  const text = `${item.id || item.ref || ""} ${item.category || ""} ${item.label}`.toLowerCase();
  if (text.includes("platform")) return "platform";
  if (text.includes("kitchen")) return "kitchen";
  if (text.includes("driver") || text.includes("deliver")) return "driver";
  if (text.includes("clean")) return "cleaning";
  if (text.includes("shop") || text.includes("inventory")) return "shopping";
  if (text.includes("sales") || text.includes("quote") || text.includes("lead")) return "sales";
  if (text.includes("customer") || text.includes("client")) return "client";
  if (text.includes("profile") || text.includes("notification") || text.includes("subscription")) return "account";
  return "admin";
}

function relatedNavigation(tool: IntentCatalogTool, navigation: readonly IntentCatalogNavigation[]): string[] {
  const terms = new Set([...words(tool.label), ...tool.keywords.flatMap(words)].filter((word) => word.length > 2));
  return navigation.map((item) => {
    const itemTerms = new Set([...words(item.label), ...item.keywords.flatMap(words)]);
    return { ref: item.ref, score: [...terms].filter((term) => itemTerms.has(term)).length, roles: item.roles };
  }).filter((item) => item.score >= 2 && (item.roles || []).some((role) => tool.roles.includes(role)))
    .sort((a, b) => b.score - a.score).slice(0, 5).map((item) => item.ref);
}

/** Generates the complete tool/page intent catalog, including platform-owner capabilities. */
export function buildCompleteChatIntentRegistry(tools: readonly IntentCatalogTool[] = [], navigation: readonly IntentCatalogNavigation[] = [], workflows: readonly IntentCatalogWorkflow[] = []): ChatIntentDefinition[] {
  const toolIntents = tools.map((tool) => ({
    id: `data.${tool.id}`, domain: inferDomain(tool), action: "read" as const, entity: tool.id,
    roles: [...tool.roles], toolIds: [tool.id], navigationRefs: relatedNavigation(tool, navigation),
    phrases: [tool.label, tool.description, tool.dataScope || ""].filter(Boolean),
    keywords: [...new Set([...tool.keywords, ...words(tool.label)])],
    priority: tool.id.startsWith("platform_") || tool.id === "registered_companies" ? 95 : 50,
    description: tool.description,
  }));
  const navigationIntents = navigation.map((item) => ({
    id: `navigate.${item.ref}`, domain: inferDomain(item), action: "navigate" as const, entity: item.ref,
    roles: [...(item.roles || ALL_ROLES)], toolIds: [], navigationRefs: [item.ref], phrases: [item.label, item.description],
    keywords: [...new Set([...item.keywords, ...words(item.label)])], priority: 45, description: item.description,
  }));
  const workflowIntents = workflows.map((workflow) => ({
    id: `workflow.${workflow.id}`, domain: inferDomain({ id: workflow.id, label: workflow.label }), action: "explain" as const,
    entity: workflow.id, roles: [...workflow.roles], toolIds: [], navigationRefs: workflow.steps.map((step) => step.ref),
    phrases: [workflow.label, workflow.description], keywords: [...new Set([...workflow.keywords, ...words(workflow.label)])],
    priority: 60, description: workflow.description,
  }));
  const byId = new Map<string, ChatIntentDefinition>();
  for (const item of [...CORE_CHAT_INTENTS, ...toolIntents, ...navigationIntents, ...workflowIntents]) {
    const old = byId.get(item.id);
    if (!old || item.priority > old.priority) byId.set(item.id, item);
  }
  return [...byId.values()];
}

export const CHAT_INTENT_REGISTRY: readonly ChatIntentDefinition[] = CORE_CHAT_INTENTS;

export function getChatIntentDefinition(id: string, registry: readonly ChatIntentDefinition[] = CHAT_INTENT_REGISTRY): ChatIntentDefinition | null {
  return registry.find((definition) => definition.id === id) || null;
}
