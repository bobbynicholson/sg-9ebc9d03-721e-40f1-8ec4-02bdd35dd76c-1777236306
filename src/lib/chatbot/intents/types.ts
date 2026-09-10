export type ChatIntentDomain =
  | "platform" | "admin" | "sales" | "operations" | "kitchen" | "driver"
  | "shopping" | "cleaning" | "service" | "client" | "account" | "unknown";

export type ChatIntentAction = "read" | "navigate" | "explain" | "action" | "unknown";
export type ChatIntentSource = "openai" | "registry" | "fallback";
export type ChatIntentTimeRange =
  | "today" | "yesterday" | "tomorrow" | "this_week" | "next_week"
  | "this_month" | "next_month" | "last_90_days" | "upcoming" | "all" | "unspecified";
export type ChatIntentScope = "self" | "company" | "platform" | "order" | "unknown";

export interface ChatIntentDefinition {
  id: string;
  domain: ChatIntentDomain;
  action: ChatIntentAction;
  entity: string;
  roles: readonly string[];
  toolIds: readonly string[];
  navigationRefs: readonly string[];
  phrases: readonly string[];
  keywords: readonly string[];
  patterns?: readonly RegExp[];
  priority: number;
  description?: string;
}

export interface ChatIntentMatch {
  id: string;
  domain: ChatIntentDomain;
  action: ChatIntentAction;
  entity: string;
  toolIds: string[];
  navigationRefs: string[];
  confidence: number;
  normalizedMessage: string;
  matchedBy: ChatIntentSource;
  timeRange?: ChatIntentTimeRange;
  scope?: ChatIntentScope;
  entities?: Record<string, string>;
  needsClarification?: boolean;
}

export interface IntentCatalogTool {
  id: string;
  label: string;
  description: string;
  dataScope?: string;
  roles: readonly string[];
  keywords: readonly string[];
  category?: string;
}

export interface IntentCatalogNavigation {
  ref: string;
  label: string;
  description: string;
  keywords: readonly string[];
  roles?: readonly string[];
}

export interface IntentCatalogWorkflow {
  id: string;
  label: string;
  description: string;
  keywords: readonly string[];
  roles: readonly string[];
  steps: readonly { ref: string }[];
}
