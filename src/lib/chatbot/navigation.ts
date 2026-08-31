/**
 * Phase 2 navigation contract.
 *
 * The assistant never invents a URL. It can only return one of these refs,
 * and the client resolves tenant-scoped hrefs with useTenantHref(). Keep
 * these refs stable: they are the bridge between natural language and the
 * product's page/section vocabulary.
 */

import { PAGE_NAVIGATION_REFS, SECTION_NAVIGATION_REFS } from "./pageCatalog";

export interface ChatNavigationRef {
  ref: string;
  label: string;
  href: string;
  description: string;
  keywords: string[];
  roles?: string[];
  targetType?: "page" | "section" | "tab" | "record";
}

export interface CurrentPageNavigationContext {
  pathname: string;
  sections: Array<{ id: string; label: string; ref?: string; kind?: string }>;
}

const ALL_ROLES = [
  "super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin",
  "kitchen_manager", "kitchen_staff", "shopping_staff", "shopping", "driver",
  "waiter", "cleaning_manager", "cleaning_staff", "client", "staff",
];

const CORE_NAVIGATION_REFS: ChatNavigationRef[] = [
  { ref: "admin.dashboard", label: "Admin dashboard", href: "/admin/dashboard", description: "Live business overview", keywords: ["dashboard", "overview", "today", "summary", "metrics"], roles: ["super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin"] },
  { ref: "admin.dashboard.priority-actions", label: "Priority actions", href: "/admin/dashboard#priority-actions", description: "Urgent stock, quote, and upcoming-event actions", keywords: ["priority actions", "needs attention", "urgent", "immediate attention", "shortfall"], roles: ["super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin"] },
  { ref: "admin.dashboard.quick-actions", label: "Dashboard quick actions", href: "/admin/dashboard#quick-actions", description: "Common order, shopping, and admin shortcuts", keywords: ["quick actions", "shortcut", "shortcuts"], roles: ["super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin"] },
  { ref: "admin.leads", label: "Leads", href: "/admin/leads", description: "Enquiries and follow-ups", keywords: ["lead", "leads", "enquiry", "enquiries", "prospect", "follow up"], roles: ["super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin"] },
  { ref: "admin.contacts", label: "Contacts", href: "/admin/contacts", description: "Clients and contact records", keywords: ["client", "clients", "contact", "customer", "customers"], roles: ["super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin"] },
  { ref: "admin.quotes", label: "Quotes", href: "/admin/quotes", description: "Create and manage quotes", keywords: ["quote", "quotes", "proposal", "estimate"], roles: ["super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin"] },
  { ref: "admin.orders", label: "Orders", href: "/admin/orders", description: "Confirmed bookings and order status", keywords: ["order", "orders", "booking", "bookings", "event", "events", "confirmed"], roles: ["super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin"] },
  { ref: "admin.calendar", label: "Calendar", href: "/admin/calendar", description: "Events, service dates, and schedule", keywords: ["calendar", "schedule", "scheduled", "event date", "upcoming"], roles: ["super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin"] },
  { ref: "admin.invoices", label: "Invoices", href: "/admin/invoices", description: "Invoices and payment status", keywords: ["invoice", "invoices", "payment", "payments", "balance", "amount due", "revenue"], roles: ["super_admin", "owner", "company_admin"] },
  { ref: "admin.inventory", label: "Inventory", href: "/admin/inventory", description: "Stock levels and item records", keywords: ["inventory", "stock", "ingredient", "ingredients", "low stock", "reorder"], roles: ["super_admin", "owner", "company_admin", "region_admin", "admin", "kitchen_manager", "kitchen_staff", "shopping_staff", "shopping"] },
  { ref: "admin.shopping", label: "Shopping", href: "/admin/shopping", description: "Purchasing lists and buying workflow", keywords: ["shopping", "buy", "buying", "purchase", "purchasing", "supplier", "suppliers"], roles: ["super_admin", "owner", "company_admin", "region_admin", "admin", "shopping_staff", "shopping"] },
  { ref: "admin.shopping.buy-now", label: "Buy now list", href: "/admin/shopping?tab=buy_now#shopping-buy-now", description: "Items below stock threshold and required for near-term orders", keywords: ["buy now", "buy list", "urgent shopping", "stock shortfall"], roles: ["super_admin", "owner", "company_admin", "region_admin", "admin", "shopping_staff", "shopping"], targetType: "tab" },
  { ref: "admin.shopping.plan", label: "Shopping plan", href: "/admin/shopping?tab=plan#shopping-plan", description: "Plan purchases against upcoming events", keywords: ["shopping plan", "plan purchases", "event shopping"], roles: ["super_admin", "owner", "company_admin", "region_admin", "admin", "shopping_staff", "shopping"], targetType: "tab" },
  { ref: "admin.shopping.suppliers", label: "Shopping suppliers", href: "/admin/shopping?tab=supplier#shopping-suppliers", description: "Compare suppliers and supplier-linked items", keywords: ["supplier comparison", "supplier tab", "supplier prices"], roles: ["super_admin", "owner", "company_admin", "region_admin", "admin", "shopping_staff", "shopping"], targetType: "tab" },
  { ref: "admin.shopping.receipts", label: "Shopping receipts", href: "/admin/shopping?tab=receipts#shopping-receipts", description: "Review purchase receipts and spend evidence", keywords: ["shopping receipts", "purchase receipts", "receipt history"], roles: ["super_admin", "owner", "company_admin", "region_admin", "admin"], targetType: "tab" },
  { ref: "admin.route-planning", label: "Route planning", href: "/admin/route-planning", description: "Plan delivery routes", keywords: ["route", "routes", "dispatch", "delivery plan", "driver plan"], roles: ["super_admin", "owner", "company_admin", "region_admin", "admin", "driver"] },
  { ref: "admin.equipment", label: "Equipment", href: "/admin/equipment", description: "Equipment availability and hire-in", keywords: ["equipment", "hire", "availability", "asset"], roles: ["super_admin", "owner", "company_admin", "admin", "cleaning_manager", "cleaning_staff"] },
  { ref: "admin.teams", label: "Teams hub", href: "/admin/teams", description: "Staff and team coordination", keywords: ["team", "teams", "staff", "people", "employee", "employees"], roles: ["super_admin", "owner", "company_admin", "admin"] },
  { ref: "admin.company-profile", label: "Company profile", href: "/admin/company-profile", description: "Company profile and operating configuration", keywords: ["settings", "company settings", "company profile", "branding", "configuration"], roles: ["super_admin", "owner", "company_admin", "admin"] },
  { ref: "admin.ai-brain", label: "AI brain", href: "/admin/ai-brain", description: "Approved assistant knowledge and sync controls", keywords: ["ai brain", "knowledge", "rag", "assistant knowledge", "resync", "re-sync", "source"], roles: ["super_admin", "owner", "company_admin"] },

  { ref: "kitchen.today", label: "Kitchen today", href: "/team-portal/kitchen/today", description: "Today's kitchen work", keywords: ["kitchen today", "today kitchen", "today's prep", "today prep"], roles: ["kitchen_manager", "kitchen_staff"] },
  { ref: "kitchen.production", label: "Kitchen production", href: "/team-portal/kitchen/production", description: "Production plan and handoffs", keywords: ["production", "prep", "preparation", "production plan", "handoff"], roles: ["kitchen_manager", "kitchen_staff"] },
  { ref: "kitchen.prep", label: "Kitchen prep list", href: "/team-portal/kitchen/prep-list", description: "Prep tasks and assignments", keywords: ["prep list", "prep task", "prep tasks", "assigned prep"], roles: ["kitchen_manager", "kitchen_staff"] },
  { ref: "kitchen.stock", label: "Kitchen stock", href: "/team-portal/kitchen/stock", description: "Ingredient stock for production", keywords: ["kitchen stock", "ingredients", "ingredient stock"], roles: ["kitchen_manager", "kitchen_staff"] },

  { ref: "shopping.buy-list", label: "Buy list", href: "/team-portal/shopping/buy-list", description: "Current purchasing list", keywords: ["buy list", "shopping list", "purchase list", "what to buy"], roles: ["shopping_staff", "shopping"] },
  { ref: "shopping.inventory", label: "Shopping inventory", href: "/team-portal/shopping/inventory", description: "Procurement stock view", keywords: ["shopping inventory", "procurement stock", "stock for shopping"], roles: ["shopping_staff", "shopping"] },
  { ref: "shopping.suppliers", label: "Suppliers", href: "/team-portal/shopping/suppliers", description: "Supplier contacts and products", keywords: ["supplier", "suppliers", "vendor", "vendors"], roles: ["shopping_staff", "shopping"] },

  { ref: "driver.dashboard", label: "Driver dashboard", href: "/team-portal/driver/dashboard", description: "Assigned driving work", keywords: ["driver dashboard", "my jobs", "my assignments", "assigned jobs"], roles: ["driver"] },
  { ref: "driver.routes", label: "My routes", href: "/team-portal/driver/routes", description: "Assigned routes and stops", keywords: ["my route", "my routes", "route", "stops"], roles: ["driver"] },
  { ref: "driver.deliveries", label: "My deliveries", href: "/team-portal/driver/deliveries", description: "Collections and deliveries", keywords: ["delivery", "deliveries", "collection", "collections", "proof of delivery"], roles: ["driver"] },
  { ref: "driver.deliveries.upcoming", label: "Upcoming deliveries", href: "/team-portal/driver/deliveries?tab=upcoming#delivery-history", description: "Upcoming assigned deliveries", keywords: ["upcoming deliveries", "next deliveries", "future deliveries"], roles: ["driver"] },
  { ref: "driver.deliveries.completed", label: "Completed deliveries", href: "/team-portal/driver/deliveries?tab=completed#delivery-history", description: "Completed delivery history", keywords: ["completed deliveries", "delivery history", "past deliveries"], roles: ["driver"] },
  { ref: "driver.tracking", label: "Delivery tracking", href: "/team-portal/driver/tracking", description: "Live delivery tracking", keywords: ["tracking", "gps", "live location", "where am i"], roles: ["driver"] },

  { ref: "cleaning.dashboard", label: "Cleaning dashboard", href: "/team-portal/cleaning/dashboard", description: "Cleaning work overview", keywords: ["cleaning dashboard", "cleaning overview"], roles: ["cleaning_manager", "cleaning_staff"] },
  { ref: "cleaning.tasks", label: "Cleaning tasks", href: "/team-portal/cleaning/tasks", description: "Assigned cleaning tasks", keywords: ["cleaning task", "cleaning tasks", "cleaning work"], roles: ["cleaning_manager", "cleaning_staff"] },
  { ref: "cleaning.equipment", label: "Cleaning equipment", href: "/team-portal/cleaning/equipment", description: "Equipment condition and cleaning", keywords: ["equipment cleaning", "cleaning equipment", "inspection"], roles: ["cleaning_manager", "cleaning_staff"] },
  { ref: "cleaning.damage", label: "Damage reports", href: "/team-portal/cleaning/damage", description: "Report and review damage", keywords: ["damage", "damaged", "damage report", "broken"], roles: ["cleaning_manager", "cleaning_staff"] },
  { ref: "cleaning.dashboard.verification", label: "Equipment verification", href: "/team-portal/cleaning/dashboard?tab=verification#cleaning-verification", description: "Verify returned equipment and readiness", keywords: ["equipment verification", "verify equipment", "returned equipment"], roles: ["cleaning_manager", "cleaning_staff"], targetType: "tab" },
  { ref: "cleaning.dashboard.damages", label: "Cleaning damages", href: "/team-portal/cleaning/dashboard?tab=damages#cleaning-damages", description: "Flag damaged or lost equipment", keywords: ["cleaning damages", "flag damage", "damages and losses"], roles: ["cleaning_manager", "cleaning_staff"], targetType: "tab" },

  { ref: "client.dashboard", label: "Client dashboard", href: "/client-portal/dashboard", description: "Your event workspace", keywords: ["client dashboard", "my dashboard", "account overview"], roles: ["client"] },
  { ref: "client.dashboard.past-events", label: "Past events", href: "/client-portal/dashboard#past-events", description: "Previously completed events", keywords: ["past events", "previous events", "old events"], roles: ["client"] },
  { ref: "client.orders", label: "My orders", href: "/client-portal/my-orders", description: "Your bookings and event details", keywords: ["my order", "my orders", "my booking", "my bookings", "event details"], roles: ["client"] },
  { ref: "client.billing", label: "Billing and payments", href: "/client-portal/billing#invoice-list", description: "Your invoices and payment status", keywords: ["my invoice", "my invoices", "payment schedule", "pay", "billing", "balance due"], roles: ["client"] },
  { ref: "client.tracking", label: "Order tracking", href: "/client-portal/tracking", description: "Track delivery progress", keywords: ["track order", "delivery tracking", "where is my order"], roles: ["client"] },
  { ref: "client.feedback", label: "Feedback", href: "/client-portal/feedback", description: "Share event feedback", keywords: ["feedback", "review", "rating"], roles: ["client"] },
  { ref: "all.notifications", label: "Notifications", href: "/admin/notifications", description: "Recent alerts and updates", keywords: ["notification", "notifications", "alert", "alerts", "message"], roles: ALL_ROLES },
];

// The focused refs above document the most valuable destinations and their
// deep links. The full hand-authored page catalog fills the rest of the route
// surface without changing the priority of those specific section refs.
export const NAVIGATION_REFS: ChatNavigationRef[] = [
  ...CORE_NAVIGATION_REFS,
  ...PAGE_NAVIGATION_REFS.filter((candidate) => !CORE_NAVIGATION_REFS.some((item) => item.ref === candidate.ref)),
  ...SECTION_NAVIGATION_REFS.filter((candidate) => !CORE_NAVIGATION_REFS.some((item) => item.ref === candidate.ref)),
];

const OVERVIEW_REFS_BY_ROLE: Record<string, string[]> = {
  super_admin: ["admin.dashboard", "admin.offering", "admin.orders"],
  owner: ["admin.dashboard", "admin.offering", "admin.orders"],
  company_admin: ["admin.dashboard", "admin.offering", "admin.orders"],
  region_admin: ["admin.dashboard", "admin.offering", "admin.orders"],
  sales_admin: ["admin.dashboard", "admin.offering", "admin.orders"],
  admin: ["admin.dashboard", "admin.offering", "admin.orders"],
  kitchen_manager: ["kitchen.dashboard", "kitchen.production", "kitchen.stock"],
  kitchen_staff: ["kitchen.dashboard", "kitchen.production", "kitchen.stock"],
  shopping_staff: ["shopping.dashboard", "shopping.buy-list", "shopping.inventory"],
  shopping: ["shopping.dashboard", "shopping.buy-list", "shopping.inventory"],
  driver: ["driver.dashboard", "driver.routes", "driver.deliveries"],
  cleaning_manager: ["cleaning.dashboard", "cleaning.tasks", "cleaning.equipment"],
  cleaning_staff: ["cleaning.dashboard", "cleaning.tasks", "cleaning.equipment"],
  client: ["client.dashboard", "client.orders", "client.tracking"],
};

function isProductOverviewQuestion(query: string): boolean {
  const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
  return [
    /\bwhat does (?:cateringms|the platform) (?:provide|offer|include|do)\b/,
    /\bwhat (?:is|are) (?:cateringms|the platform)\b/,
    /\b(?:cateringms|the platform) (?:features|capabilities|modules)\b/,
    /\btell me about (?:cateringms|the platform)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function isPlatformOverviewQuestion(query: string): boolean {
  const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (/\bplatform financial dashboard\b/.test(normalized)) return false;
  return /\b(?:platform|whole platform|all companies)\b[\s\S]*\b(?:overview|summary|metrics|dashboard)\b/.test(normalized)
    || /\b(?:overview|summary|metrics|dashboard)\b[\s\S]*\b(?:of the )?platform\b/.test(normalized);
}

function isPlatformRevenueQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
  return /\b(?:mrr|arr|monthly recurring revenue|annual recurring revenue|subscription revenue|platform finance|platform financial dashboard)\b/.test(normalized);
}

function getOverviewNavigation(role: string, limit: number): ChatNavigationRef[] {
  return (OVERVIEW_REFS_BY_ROLE[role] || [])
    .map((ref) => NAVIGATION_REFS.find((item) => item.ref === ref))
    .filter((item): item is ChatNavigationRef => Boolean(item) && isAllowed(item, role))
    .slice(0, limit);
}

function isCurrentCustomerQuestion(query: string): boolean {
  const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
  const asksAboutCustomers = /\b(?:customer|customers|client|clients|contact|contacts)\b/.test(normalized);
  const asksForCurrentState = /\b(?:active|current|registered|existing|total|count|how many|which|who|list|show)\b/.test(normalized);
  const asksAboutAnotherRecord = /\b(?:invoice|invoices|order|orders|booking|bookings|quote|quotes|delivery|deliveries|subscription|subscriptions)\b/.test(normalized);
  return asksAboutCustomers && asksForCurrentState && !asksAboutAnotherRecord;
}

function getCustomerNavigation(role: string, limit: number): ChatNavigationRef[] {
  return ["admin.contacts", "admin.contacts.book"]
    .map((ref) => NAVIGATION_REFS.find((item) => item.ref === ref))
    .filter((item): item is ChatNavigationRef => Boolean(item) && isAllowed(item, role))
    .slice(0, limit);
}

function isCurrentSubscriptionQuestion(query: string): boolean {
  const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
  const asksAboutSubscription = /\b(?:subscription|subscriptions|plan|plans|billing plan)\b/.test(normalized);
  const asksForCurrentState = /\b(?:active|current|which|what|show|tell|our|my|have|is|are|status|details)\b/.test(normalized);
  const asksPlatformWide = /\b(?:platform|all companies|across companies|other companies|company-wide)\b/.test(normalized);
  return asksAboutSubscription && asksForCurrentState && !asksPlatformWide;
}

function getSubscriptionNavigation(role: string, limit: number): ChatNavigationRef[] {
  return ["admin.subscription"]
    .map((ref) => NAVIGATION_REFS.find((item) => item.ref === ref))
    .filter((item): item is ChatNavigationRef => Boolean(item) && isAllowed(item, role))
    .slice(0, limit);
}

function getPlatformNavigation(role: string, ref: string, limit: number): ChatNavigationRef[] {
  const item = NAVIGATION_REFS.find((candidate) => candidate.ref === ref);
  return item && isAllowed(item, role) ? [item].slice(0, limit) : [];
}

function directNavigationTarget(query: string): string | null {
  const normalized = query.toLowerCase().replace(/[?!.,;:]+$/g, "").replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(?:please\s+)?(?:open|go to|navigate to|take me to|show me|view|visit|launch|bring me to)\s+(.+)$/);
  return match?.[1]?.trim().replace(/[-_]+/g, " ") || null;
}

function getDirectNavigation(query: string, role: string, platformScoped = false): ChatNavigationRef[] | null {
  const target = directNavigationTarget(query);
  if (!target) return null;

  // These names exist in more than one scope. Resolve them to the page that
  // belongs to the signed-in workspace before generic word matching runs.
  const canonicalRef = role === "super_admin"
    ? (/^(?:pricing|plans|plan pricing|pricing plans|pricing management)$/.test(target)
      ? "platform.pricing-management"
      : /^(?:subscriptions|subscription management|platform subscriptions)$/.test(target)
        ? "platform.subscription-management"
        : /^(?:users|user management|platform users|platform user management)$/.test(target)
          ? "platform.user-management"
        : /^(?:companies|company records|registered companies)$/.test(target)
            ? "platform.company-database"
              : /^(?:platform audit logs)$/.test(target) || (platformScoped && /^(?:audit logs|audit trail)$/.test(target))
              ? "platform.audit-logs"
              : /^(?:audit logs|audit trail)$/.test(target)
                ? "admin.audit-logs"
              : /^(?:ai brain|platform ai brain|assistant knowledge)$/.test(target)
                ? "admin.ai-brain"
                : /^(?:ai access|platform ai access|live data access)$/.test(target)
                  ? "admin.ai-brain.access"
                  : /\bactive plans\b/.test(target)
                    ? "platform.subscription-management.active-plans"
                    : /\bfeature gates?\b/.test(target)
                      ? "platform.pricing-management.feature-gates"
                      : /\b(?:currency )?alerts?\b/.test(target) && /\bcurrency|monitor\b/.test(target)
                        ? "platform.currency-monitoring.alerts"
                        : /\btenant cost\b/.test(target)
                          ? "platform.tech-costs.tenant-cost"
                          : /\brole controls?\b/.test(target)
                            ? "platform.ai-access.role-controls"
                            : /\bfailed sources?\b/.test(target)
                              ? "platform.ai-brain.failed-sources"
                              : /\baudit filter\b/.test(target) && /\bsubscription\b/.test(target)
                                ? "platform.audit-logs.filters.subscription"
                                : /\bcompany record\b/.test(target)
                                  ? "platform.company-database.records"
              : /^(?:the )?(?:tenant cost|cost per tenant|cost per company)(?: section)?$/.test(target)
                ? "platform.tech-costs.tenant-cost"
                : /^(?:margin analysis|margin analysis section)$/.test(target)
                  ? "platform.tech-costs.margin"
                  : /^(?:cost trend|cost trend section)$/.test(target)
                    ? "platform.tech-costs.trend"
                    : null)
    : (/^(?:pricing|plans|plan pricing|pricing plans|pricing management)$/.test(target)
      ? "admin.offering"
      : /^(?:subscriptions|subscription management|billing plans)$/.test(target)
        ? "admin.subscription"
        : /^(?:users|user management)$/.test(target)
          ? "admin.users"
          : /^(?:audit logs|audit trail)$/.test(target)
            ? "admin.audit-logs"
            : null);
  if (canonicalRef) {
    const canonical = NAVIGATION_REFS.find((item) => item.ref === canonicalRef);
    if (canonical && isAllowed(canonical, role)) return [canonical];
  }

  // A platform-owner conversation is global until an explicit tenant-view
  // workflow selects a company. Never let a generic keyword such as
  // "changed" or "settings" suggest a tenant-admin route here.
  const isPlatformDestination = (item: ChatNavigationRef) => role !== "super_admin"
    || !platformScoped
    || item.ref.startsWith("platform.")
    || item.ref.startsWith("super-admin")
    || item.ref === "admin.ai-brain"
    || item.ref === "admin.ai-brain.access";

  const candidates = NAVIGATION_REFS
    .filter((item) => isAllowed(item, role) && isPlatformDestination(item))
    .map((item) => {
      const label = item.label.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
      const keywordScore = item.keywords.reduce((best, keyword) => {
        const normalizedKeyword = keyword.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
        if (normalizedKeyword === target) return Math.max(best, 100);
        if (target.includes(normalizedKeyword) || normalizedKeyword.includes(target)) return Math.max(best, 70);
        return best;
      }, 0);
      const labelScore = label === target ? 110 : (target.includes(label) || label.includes(target) ? 80 : 0);
      const targetBonus = item.targetType === "page" || !item.targetType ? 2 : 0;
      const workspaceBonus = ["kitchen_manager", "kitchen_staff", "shopping_staff", "shopping", "driver", "waiter", "cleaning_manager", "cleaning_staff"].includes(role)
        ? (item.href.startsWith("/team-portal/") ? 20 : 0)
        : role === "client"
          ? (item.href.startsWith("/client-portal/") || item.href.startsWith("/client/") ? 20 : 0)
          : 0;
      return { item, score: Math.max(labelScore, keywordScore) + targetBonus + workspaceBonus };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));
  return candidates.length ? [candidates[0].item] : [];
}

function isPlatformCompanyCountQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  const normalized = query.toLowerCase();
  return /\b(?:how many|number of|count of|registered)\b/.test(normalized)
    && /\b(?:companies|company|tenants|tenant)\b/.test(normalized);
}

function isPlatformPlanUsageQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  const normalized = query.toLowerCase();
  return /\b(?:how many|count|number of|which|show|list)\b/.test(normalized)
    && /\b(?:companies|businesses|accounts)\b/.test(normalized)
    && /\b(?:each|per|use|using|on|by|breakdown|distribution)\b/.test(normalized)
    && /\b(?:plan|plans|subscription|subscriptions)\b/.test(normalized);
}

function isPlatformCompanySwitchQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  const normalized = query.toLowerCase();
  return /\b(?:switch|browse|open|enter|go to|view)\b[\s\S]*\b(?:company|companies)\b[\s\S]*\b(?:admin|workspace|view)\b/.test(normalized);
}

function isPlatformCompanyOwnerQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  const normalized = query.toLowerCase();
  return /\b(?:company\s+)?owners?\b/.test(normalized)
    && /\b(?:show|list|which|who|all|how many|find)\b/.test(normalized);
}

function isPlatformUserCountQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  const normalized = query.toLowerCase();
  return /\b(?:how many|number of|count of|total)\b[\s\S]*\busers?\b/.test(normalized)
    && /\b(?:platform|all|across|registered|currently|on)\b/.test(normalized);
}

function isPendingInvitationQuestion(query: string): boolean {
  const normalized = query.toLowerCase();
  return /\b(?:invitation|invitations|invite|invites)\b/.test(normalized)
    && /\b(?:pending|outstanding|unaccepted|awaiting|waiting|not accepted|no)\b/.test(normalized);
}

function getPendingInvitationNavigation(role: string, limit: number): ChatNavigationRef[] {
  const refs = role === "super_admin"
    ? ["platform.user-management.pending-invitations", "platform.user-management"]
    : ["admin.users"];
  return refs
    .map((ref) => NAVIGATION_REFS.find((item) => item.ref === ref))
    .filter((item): item is ChatNavigationRef => Boolean(item) && isAllowed(item, role))
    .slice(0, limit);
}

function isPlatformTrialQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  const normalized = query.toLowerCase();
  return /\btrial\b/.test(normalized) && /\b(?:companies|company|accounts|businesses)\b/.test(normalized);
}

function isPlatformPlanQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  const normalized = query.toLowerCase();
  if (/\b(?:recent|latest|change|changes|activity|audit)\b/.test(normalized)) return false;
  return /\b(?:subscription|subscriptions|plan|plans)\b/.test(normalized)
    && /\b(?:active|available|enabled|current|which|what|show|list)\b/.test(normalized);
}

function isCurrencyConfigurationQuestion(query: string): boolean {
  return /\b(?:currency|currencies|exchange rates?)\b/i.test(query)
    && /\b(?:supported|available|enabled|which|what|list|show|use)\b/i.test(query);
}

function isPlatformTechnologyCostQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  return /\b(?:technology costs?|tech costs?|tech-stack costs?|service costs?|operating costs?|infrastructure costs?|tenant cost|cost per tenant|average cost per tenant|margin|margin analysis|cost trend|costs? changed|highest infrastructure cost)\b/i.test(query);
}

function isPlatformAuditQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  return /\b(?:audit|activity|failed|suspicious|recent company changes?|recent subscription changes?|recent pricing changes?|permission changes?|who changed|deactivated)\b/i.test(query);
}

function isPlatformAiQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  return /\b(?:ai brain|knowledge sources?|approved sources?|ready sources?|failed sources?|sources? failed|source sync|source indexing|ai access|live[- ]data access|live tool|role controls|enabled live tools|whole database|unrestricted sql|access settings|platform knowledge|unsafe content|company-only information|invoice data|customer data|equipment data|allow(?:ing)?\s+(?:kitchen staff|cleaning staff|company admins?).{0,40}\binventory\b|disable live data)\b/i.test(query);
}

function isRoleAccessQuestion(query: string): boolean {
  const roleOrResource = /\b(?:kitchen staff|cleaning staff|company admins?|drivers?|clients?|inventory|stock|equipment|invoice data|customer data|live[- ]data|tools?|sql)\b/i.test(query);
  const explicitPermission = /\b(?:allow|disable|enable|permission|permissions|role controls?|live[- ]data|which roles?|what data)\b/i.test(query);
  const directRolePermission = /\bcan\s+(?:kitchen staff|cleaning staff|company admins?|drivers?|clients?)\s+access\b/i.test(query);
  return roleOrResource && (explicitPermission || directRolePermission);
}

function isPlatformHealthQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  return /\b(?:payment issues?|stuck onboarding|incomplete onboarding|tenant health|company health|trials? expiring|expiring trials?|cancelled companies?|canceled companies?)\b/i.test(query);
}

function isPlatformPricingQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  return /\b(?:highest[- ]revenue plan|pricing tiers?|feature gates?|plan features?)\b/i.test(query);
}

function isPlatformTenantWorkflowQuestion(query: string, role: string): boolean {
  if (role !== "super_admin") return false;
  return /\bfind a company\b/i.test(query) && /\b(?:subscription|tenant view|company admin)\b/i.test(query);
}

function isRestrictedScopeQuestion(query: string, role: string): boolean {
  if (role === "super_admin") return false;
  const normalized = query.toLowerCase();
  const asksCrossCompany = /\b(?:platform|cross[- ]company|cross[- ]tenant|other companies|all companies|which companies|registered companies|company count|tenant|tenants)\b/.test(normalized)
    || /\b(?:how many|number of|count of|total)\b[\s\S]{0,80}\b(?:companies?|tenants?)\b/.test(normalized)
    || /\b(?:companies?|tenants?)\b[\s\S]{0,80}\b(?:registered|on trial|active|cancelled)\b/.test(normalized)
    || /\b(?:companies|subscriptions|subscription plans|trials|trial companies)\b[\s\S]*\b(?:across|all|platform|other)\b/.test(normalized)
    || /\b(?:across|between|from all)\b[\s\S]{0,60}\bcompanies?\b/.test(normalized);
  const asksPrivateOwnerDetails = /\b(?:owner|owner's|owners)\b[\s\S]*\b(?:email|phone|profile|personal|private|contact|details|notes|password|login|activity|address)\b/.test(normalized)
    || /\b(?:who is the owner|owner details|owner information)\b/.test(normalized);
  return asksCrossCompany || asksPrivateOwnerDetails;
}

function isSecurityRefusalQuestion(query: string): boolean {
  return /\b(?:private customer records|another company|another tenant|other tenant|database credentials?|api keys?|secret keys?|unrestricted sql|bypass (?:company|access)(?:\s+access)? controls?|without confirmation|without an audit|no audit record|immediately delete|delete a company|change (?:a |the )?(?:subscription|user'?s role)|change a subscription)\b/i.test(query);
}

function isAllowed(item: ChatNavigationRef, role: string): boolean {
  return !item.roles || item.roles.includes(role);
}

function tokens(value: string): Set<string> {
  return new Set((value.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((token) =>
    !["the", "and", "for", "with", "what", "how", "are", "can", "you", "our", "this", "that", "where", "show", "find", "open", "view", "tell", "need", "want", "see", "get", "does", "provide", "provides", "providing", "cateringms"].includes(token),
  ));
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

function fuzzyTokenOverlap(queryToken: string, searchableToken: string): boolean {
  if (queryToken.length < 5 || searchableToken.length < 5) return false;
  if (queryToken.startsWith(searchableToken) || searchableToken.startsWith(queryToken)) return true;
  // Fuzzy matching is only for likely typos. A distance of two makes normal
  // words such as "provide" match unrelated destinations such as "profile".
  return Math.max(queryToken.length, searchableToken.length) <= 14 && editDistance(queryToken, searchableToken) <= 1;
}

function navigationScore(query: string, item: ChatNavigationRef): number {
  const normalized = query.toLowerCase().trim();
  const queryTokens = tokens(query);
  const searchable = tokens([item.label, item.description, ...item.keywords].join(" "));
  const overlap = [...queryTokens].filter((token) => searchable.has(token)).length;
  const fuzzyOverlap = [...queryTokens].filter((queryToken) => [...searchable].some((searchableToken) => fuzzyTokenOverlap(queryToken, searchableToken))).length;
  const exactKeywordScore = item.keywords.reduce((total, keyword) => {
    const phrase = keyword.toLowerCase();
    return total + (normalized.includes(phrase) ? (phrase.includes(" ") ? 3 : 1) : 0);
  }, 0);
  return exactKeywordScore + Math.min(overlap, 4) * 0.5 + Math.min(fuzzyOverlap, 3) * 0.35;
}

export function getRelevantNavigation(query: string, role: string, limit = 3, currentPage?: CurrentPageNavigationContext): ChatNavigationRef[] {
  const normalized = query.toLowerCase().trim();
  if (!normalized) return [];
  if (isSecurityRefusalQuestion(query)) return [];
  if (isRestrictedScopeQuestion(query, role)) return [];
  // Resolve explicit navigation requests before broad live-question rules.
  // For example, "Open Trial companies" should open the filtered section,
  // while "Which companies are on trial?" should use the live trial page.
  // A bare platform route is global. A slug-prefixed route is an explicit
  // tenant-view context, where the platform owner may use tenant pages.
  const platformScoped = role === "super_admin"
    && Boolean(currentPage)
    && !/^\/[^/]+\/(?:admin|team-portal|client-portal|account)(?:\/|$)/.test(currentPage?.pathname || "");
  const directNavigation = getDirectNavigation(query, role, platformScoped);
  if (directNavigation) return directNavigation.slice(0, 1);
  if (isPendingInvitationQuestion(query)) return getPendingInvitationNavigation(role, limit);
  if (isRoleAccessQuestion(query)) {
    if (role === "super_admin") return getPlatformNavigation(role, "platform.ai-access.role-controls", limit);
    if (["owner", "company_admin"].includes(role)) return getPlatformNavigation(role, "admin.ai-brain.access", limit);
    return [];
  }
  if (isPlatformCompanySwitchQuestion(query, role)) return getPlatformNavigation(role, "platform.company-database", limit);
  if (isPlatformCompanyOwnerQuestion(query, role)) return getPlatformNavigation(role, "platform.company-database", limit);
  if (isPlatformTenantWorkflowQuestion(query, role)) return getPlatformNavigation(role, "platform.company-database", limit);
  if (isPlatformPricingQuestion(query, role)) return getPlatformNavigation(role, "platform.pricing-management.feature-gates", limit);
  // Platform-wide live questions have one obvious home each. Keep the link
  // list focused so a company list does not also suggest an unrelated
  // dashboard, and a plan question does not drift into sales screens.
  if (isPlatformUserCountQuestion(query, role)) return getPlatformNavigation(role, "platform.user-management", limit);
  if (isPlatformPlanUsageQuestion(query, role)) return getPlatformNavigation(role, "platform.subscription-management", limit);
  if (isPlatformCompanyCountQuestion(query, role)) return getPlatformNavigation(role, "platform.company-database", limit);
  if (isPlatformTrialQuestion(query, role)) return getPlatformNavigation(role, "platform.trial-management", limit);
  if (isPlatformPlanQuestion(query, role)) return getPlatformNavigation(role, "platform.subscription-management", limit);
  if (isPlatformAiQuestion(query, role)) {
    if (/\b(?:ai access|live[- ]data access|role controls|enabled live tools|access settings|each role|drivers?|clients?|kitchen staff|cleaning staff|company admins?)\b/i.test(normalized)) {
      return getPlatformNavigation(role, "platform.ai-access.role-controls", limit);
    }
    if (/\b(?:failed|failure|error|indexing|unsafe content)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.ai-brain.failed-sources", limit);
    if (/\b(?:sync|resync|re-sync|indexing status|delete|remove)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.ai-brain.sync-status", limit);
    if (/\b(?:approved|documentation|policy pdf|public website|source)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.ai-brain.approved-sources", limit);
    return getPlatformNavigation(role, "admin.ai-brain", limit);
  }
  if (isPlatformHealthQuestion(query, role)) {
    if (/\b(?:cancelled|canceled)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.subscription-management", limit);
    if (/\b(?:trial|expir|on trial)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.trial-management", limit);
    if (/\bpayment\b/i.test(normalized)) return getPlatformNavigation(role, "platform.payment-issues", limit);
    return getPlatformNavigation(role, "platform.tenant-health", limit);
  }
  if (/\bchurn\b/i.test(normalized) && role === "super_admin") return getPlatformNavigation(role, "platform.financial-dashboard.churn", limit);
  if (isPlatformTechnologyCostQuestion(query, role)) {
    if (/\b(?:tenant cost|cost per tenant|average cost per tenant)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.tech-costs.tenant-cost", limit);
    if (/\b(?:margin|margin analysis)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.tech-costs.margin", limit);
    if (/\b(?:trend|changed|history|historical)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.tech-costs.trend", limit);
    return getPlatformNavigation(role, "platform.tech-costs", limit);
  }
  if (isPlatformAuditQuestion(query, role)) {
    if (/\b(?:subscription)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.audit-logs.filters.subscription", limit);
    if (/\b(?:pricing|price)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.audit-logs.filters.pricing", limit);
    if (/\b(?:permission|role)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.audit-logs.filters.permissions", limit);
    if (/\b(?:failed|failure|error|suspicious|denied)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.audit-logs.filters.failure", limit);
    if (/\b(?:company changes?|by company)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.audit-logs.filters.company", limit);
    if (/\b(?:by user|user)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.audit-logs.filters.user", limit);
    if (/\b(?:by action|action)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.audit-logs.filters.action", limit);
    if (/\b(?:by date|date)\b/i.test(normalized)) return getPlatformNavigation(role, "platform.audit-logs.filters.date", limit);
    return getPlatformNavigation(role, "platform.audit-logs", limit);
  }
  if (isCurrencyConfigurationQuestion(query)) {
    return role === "super_admin" ? getPlatformNavigation(role, "platform.currency-monitoring", limit) : [];
  }
  if (isPlatformRevenueQuestion(query, role)) return getPlatformNavigation(role, "platform.financial-dashboard", limit);
  if (isPlatformOverviewQuestion(query) && role === "super_admin") return getPlatformNavigation(role, "platform.dashboard", limit);
  // Product-overview questions have a real navigation intent, but their
  // wording contains few page keywords. Use curated role entry points instead
  // of letting fuzzy matching select arbitrary setup pages.
  if (isProductOverviewQuestion(query)) return getOverviewNavigation(role, limit);
  // Customer-status questions belong to the contact book. Do not add nearby
  // lead or operations links just because they also contain "active".
  if (isCurrentCustomerQuestion(query)) return getCustomerNavigation(role, limit);
  // Current-plan questions belong to the subscription screen. Do not let
  // generic words such as "active" or "current" attach nearby sales links.
  if (isCurrentSubscriptionQuestion(query)) return getSubscriptionNavigation(role, limit);
  const currentPageMatches: ChatNavigationRef[] = [];
  if (currentPage?.pathname && currentPage.pathname.startsWith("/")) {
    const pathname = currentPage.pathname.replace(/^\/[^/]+(?=\/(?:admin|team-portal|client-portal|account)(?:\/|$))/, "").split("?")[0].split("#")[0];
    const base = getNavigationRefForPath(pathname);
    const baseDefinition = base ? NAVIGATION_REFS.find((item) => item.ref === base) : undefined;
    if (!baseDefinition || isAllowed(baseDefinition, role)) {
      const usedIds = new Set<string>();
      currentPage.sections.forEach((section) => {
        const id = String(section.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
        const label = String(section.label || "").replace(/\s+/g, " ").trim();
        if (!id || !label || usedIds.has(id)) return;
        const sectionTokens = tokens(label);
        const queryTokens = tokens(query);
        const score = [...queryTokens].filter((token) => sectionTokens.has(token)).length;
        if (score > 0) {
          const manual = NAVIGATION_REFS.find((item) =>
            item.ref === section.ref
            || item.href === `${pathname.split("?")[0].split("#")[0]}#${id}`
            || item.href === `${pathname.split("?")[0].split("#")[0]}#${section.ref}`,
          );
          const isPlatformDestination = role !== "super_admin"
            || !platformScoped
            || manual?.ref.startsWith("platform.")
            || manual?.ref.startsWith("super-admin")
            || manual?.ref === "admin.ai-brain"
            || manual?.ref === "admin.ai-brain.access";
          if (manual && isAllowed(manual, role) && isPlatformDestination) {
            usedIds.add(id);
            currentPageMatches.push(manual);
            return;
          }
          usedIds.add(id);
          currentPageMatches.push({
            ref: `${base || "page"}.${id}`,
            label,
            href: `${pathname}#${id}`,
            description: `Section on the current page: ${label}`,
            keywords: [...sectionTokens],
            targetType: section.kind === "record" ? "record" : "section",
          });
        }
      });
    }
  }
  const registryMatches = NAVIGATION_REFS
    .filter((item) => isAllowed(item, role) && (!platformScoped || item.ref.startsWith("platform.") || item.ref.startsWith("super-admin") || item.ref === "admin.ai-brain" || item.ref === "admin.ai-brain.access"))
    .map((item) => {
      const score = navigationScore(query, item);
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
    .slice(0, limit)
    .map(({ item }) => item);
  return [...currentPageMatches, ...registryMatches]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.ref === item.ref) === index)
    .slice(0, limit);
}

/**
 * Remove stale or over-broad links from persisted assistant messages. The
 * original user question is not stored separately, so this also recognises
 * the assistant's grounded wording (for example, "no pending invitations").
 */
export function filterRelevantNavigation<T extends { ref: string }>(query: string, role: string, navigation: T[]): T[] {
  if (!isPendingInvitationQuestion(query)) return navigation;
  const allowed = new Set(getPendingInvitationNavigation(role, NAVIGATION_REFS.length).map((item) => item.ref));
  return navigation.filter((item) => allowed.has(item.ref));
}

export function getNavigationRefForPath(pathname: string): string | null {
  const cleanPath = pathname.replace(/^\/[^/]+(?=\/(?:admin|team-portal|client-portal|account)(?:\/|$))/, "").split(/[?#]/)[0];
  return NAVIGATION_REFS.find((item) => item.href.split(/[?#]/)[0] === cleanPath)?.ref || null;
}

/**
 * Full role-aware screen index for the model. The UI still receives only the
 * few relevant links for a question, but the assistant can understand the
 * complete sidebar/page vocabulary for the signed-in role.
 */
export function getNavigationForRole(role: string): ChatNavigationRef[] {
  return NAVIGATION_REFS.filter((item) => isAllowed(item, role));
}

export function buildRoleNavigationIndex(role: string): string {
  const items = getNavigationForRole(role);
  if (!items.length) return "No indexed screens are available for this role.";
  return items.map((item) => `${item.label} (ref ${item.ref})`).join("; ");
}

export function buildNavigationContext(items: ChatNavigationRef[]): string {
  if (!items.length) return "No direct navigation suggestion was matched for this question.";
  return items.map((item) => `- ${item.label}: ${item.description} (target ${item.targetType || "page"}; ref ${item.ref})`).join("\n");
}
