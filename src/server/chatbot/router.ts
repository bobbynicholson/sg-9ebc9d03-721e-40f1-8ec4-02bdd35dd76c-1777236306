export type ChatRoute = "knowledge" | "live_data" | "hybrid" | "action_request";

export interface ChatIntentRoute {
  route: ChatRoute;
  useKnowledge: boolean;
  useLiveData: boolean;
  explanation: string;
}

const LIVE_SIGNALS = [
  "how many", "count", "number of", "open leads", "leads", "quotes", "orders", "bookings",
  "appointments", "invoice", "invoices", "balance", "payment", "revenue", "sales", "inventory",
  "stock", "shortage", "delivery", "deliveries", "assigned", "assignment", "status", "notifications",
  "today", "tomorrow", "this week", "current week", "this month", "last 90 days", "past 90 days",
  "recent", "latest", "my ", "who is", "which customer", "which client", "cancell", "earnings",
  "customer", "customers", "client", "clients", "contact", "contacts", "registered client",
  "currency", "currencies", "exchange rate", "exchange rates",
  "technology cost", "technology costs", "tech costs", "tech-stack costs", "service costs", "operating costs", "infrastructure cost", "cost per tenant", "cost trend", "most expensive tenants", "highest infrastructure cost",
  "invitation", "invitations", "pending invitation", "pending invitations", "pending invite", "pending invites", "unaccepted invitation", "unaccepted invitations",
  "audit log", "audit logs", "audit events", "audit trail", "recent changes", "failed actions", "suspicious actions", "who changed", "deactivated",
  "ai brain", "knowledge source", "approved sources", "ready sources", "failed sources", "source sync", "source indexing", "ai access", "live-data access", "live data access", "enabled live tools", "role controls", "whole database", "unrestricted sql",
  "trial expiry", "trial expires", "expiring trials", "company health", "tenant health", "stuck onboarding", "incomplete onboarding", "payment issue", "payment issues",
];

const KNOWLEDGE_SIGNALS = [
  "policy", "procedure", "process", "how do i", "how can i", "guide", "guidance", "what is",
  "what does", "rules", "documentation", "training", "explain", "meaning", "terms", "faq",
  "eligibility", "best practice", "setup", "configure", "configuration",
];

const ACTION_SIGNALS = [
  "create ", "make ", "add ", "update ", "change ", "delete ", "cancel ", "send ", "assign ",
  "mark ", "approve ", "pay ", "book ", "schedule ", "invite ",
];

function hasSignal(message: string, signals: string[]): boolean {
  return signals.some((signal) => message.includes(signal));
}

function isPlatformCompanyStatusQuestion(message: string): boolean {
  return /\b(?:which|what|show|list|how many|number of|count of)\b[\s\S]*\bcompanies?\b[\s\S]*\b(?:trial|active|cancelled|canceled|subscription|registered)\b/.test(message)
    || /\b(?:trial|active|cancelled|canceled|subscription|registered)\b[\s\S]*\b(?:company|companies)\b/.test(message);
}

function isPlatformSubscriptionQuestion(message: string): boolean {
  return /\b(?:which|what|show|list|are)\b[\s\S]*\b(?:subscription )?plans?\b[\s\S]*\b(?:active|available|enabled)\b/.test(message)
    || /\b(?:active|available|enabled)\b[\s\S]*\b(?:subscription )?plans?\b/.test(message);
}

function isPlatformPlanUsageQuestion(message: string): boolean {
  return /\b(?:how many|count|number of|which|show|list)\b/.test(message)
    && /\b(?:companies|businesses|accounts)\b/.test(message)
    && /\b(?:each|per|use|using|on|by|breakdown|distribution)\b/.test(message)
    && /\b(?:plan|plans|subscription|subscriptions)\b/.test(message);
}

function isPlatformCompanySwitchQuestion(message: string): boolean {
  return /\b(?:switch|browse|open|enter|go to|view)\b[\s\S]*\b(?:company|companies)\b[\s\S]*\b(?:admin|workspace|view)\b/.test(message);
}

function isPlatformCompanyOwnerQuestion(message: string): boolean {
  return /\b(?:company\s+)?owners?\b/.test(message)
    && /\b(?:show|list|which|who|all|how many|find)\b/.test(message);
}

function isCurrencyConfigurationQuestion(message: string): boolean {
  return /\b(?:currency|currencies|exchange rates?)\b/.test(message)
    && /\b(?:supported|available|enabled|which|what|list|show|use)\b/.test(message);
}

function isTechnologyCostQuestion(message: string): boolean {
  return /\b(?:technology costs?|tech costs?|tech-stack costs?|service costs?|operating costs?|infrastructure costs?|cost per tenant|cost trend|most expensive tenants?|highest infrastructure cost)\b/.test(message);
}

function isPlatformAuditQuestion(message: string): boolean {
  return /\b(?:audit|activity|failed actions?|suspicious actions?|recent changes?|who changed|deactivated)\b/.test(message);
}

function isPlatformAiQuestion(message: string): boolean {
  return /\b(?:ai brain|knowledge sources?|approved sources?|ready sources?|failed sources?|source sync|source indexing|ai access|live[- ]data access|role controls|enabled live tools|whole database|unrestricted sql)\b/.test(message);
}

function isPlatformRoleAccessQuestion(message: string): boolean {
  return /\b(?:allow|disable|enable|access|permission|permissions|can i|can we)\b/.test(message)
    && /\b(?:kitchen staff|cleaning staff|company admins?|drivers?|clients?|inventory|stock|equipment|invoice data|customer data|live[- ]data|tools?|sql)\b/.test(message);
}

function isPlatformHealthQuestion(message: string): boolean {
  return /\b(?:trial expiry|trials? expire|expiring trials?|company health|tenant health|stuck onboarding|incomplete onboarding|payment issues?)\b/.test(message);
}

function isCurrentSubscriptionQuestion(message: string): boolean {
  return /\b(?:subscription|subscriptions|plan|plans)\b/.test(message)
    && /\b(?:my|our|company|current|active|status|which|what|show|tell|have)\b/.test(message)
    && !/\b(?:pricing|price|cost|how do i|how can i|configure|change|update)\b/.test(message);
}

export function isPlatformOverviewQuestion(message: string): boolean {
  if (/\bplatform financial dashboard\b/.test(message)) return false;
  return /\b(?:platform|whole platform|all companies)\b[\s\S]*\b(?:overview|summary|metrics|dashboard)\b/.test(message)
    || /\b(?:overview|summary|metrics|dashboard)\b[\s\S]*\b(?:of the )?platform\b/.test(message);
}

function isFastStableQuestion(message: string): boolean {
  return /^(?:hi|hello|hey|hiya|good morning|good afternoon|good evening)[!.?\s]*$/.test(message)
    || /\bwhat does (?:cateringms|the platform) (?:provide|offer|include|do)\b/.test(message)
    || /\bwhat (?:is|are) (?:cateringms|the platform)\b/.test(message)
    || /\b(?:cateringms|the platform) (?:features|capabilities|modules)\b/.test(message);
}

/**
 * A safe first router: inexpensive deterministic intent classification keeps
 * the model out of the security decision. A future LLM router may enrich the
 * intent, but the server must still validate every tool and tenant scope.
 */
export function routeChatQuestion(input: string): ChatIntentRoute {
  const message = input.trim().toLowerCase();
  if (isFastStableQuestion(message)) {
    return {
      route: "knowledge",
      useKnowledge: false,
      useLiveData: false,
      explanation: "This is a greeting or basic product overview answered from the built-in CateringMS context.",
    };
  }
  const policyPhrase = message.includes("cancellation policy") || message.includes("cancellation procedure");
  const live = (hasSignal(message, LIVE_SIGNALS) || isPlatformCompanyStatusQuestion(message) || isPlatformSubscriptionQuestion(message) || isPlatformPlanUsageQuestion(message) || isPlatformCompanySwitchQuestion(message) || isPlatformCompanyOwnerQuestion(message) || isCurrencyConfigurationQuestion(message) || isTechnologyCostQuestion(message) || isPlatformAuditQuestion(message) || isPlatformAiQuestion(message) || isPlatformRoleAccessQuestion(message) || isPlatformHealthQuestion(message) || isCurrentSubscriptionQuestion(message) || isPlatformOverviewQuestion(message))
    && !(policyPhrase && !hasSignal(message, ["how many", "count", "this month", "this week", "today", "data", "records"]));
  const knowledge = hasSignal(message, KNOWLEDGE_SIGNALS);
  const action = hasSignal(message, ACTION_SIGNALS);

  if (action) {
    return {
      route: "action_request",
      useKnowledge: true,
      useLiveData: live,
      explanation: "The request appears to ask for a write action; the assistant remains read-focused and can provide guidance or navigation.",
    };
  }
  if (live && knowledge) return { route: "hybrid", useKnowledge: true, useLiveData: true, explanation: "The question combines stable product knowledge with current operational data." };
  if (live) return { route: "live_data", useKnowledge: false, useLiveData: true, explanation: "The question asks about current tenant data, so approved live tools are authoritative." };
  return { route: "knowledge", useKnowledge: true, useLiveData: false, explanation: "The question asks for stable product or process knowledge, so vector RAG is used." };
}
