/** Canonical chatbot roles plus the legacy department labels still emitted by older profiles. */
export const CHAT_CANONICAL_ROLES = [
  "super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin",
  "kitchen_manager", "kitchen_staff", "shopping_staff", "shopping", "driver", "waiter",
  "cleaning_manager", "cleaning_staff", "client", "staff",
] as const;

export type ChatCanonicalRole = (typeof CHAT_CANONICAL_ROLES)[number];

export function normalizeChatRole(value: string | null | undefined, fallback?: string | null): ChatCanonicalRole {
  const raw = String(value || "").trim().toLowerCase();
  if ((CHAT_CANONICAL_ROLES as readonly string[]).includes(raw)) return raw as ChatCanonicalRole;
  const fallbackRole = String(fallback || "").trim().toLowerCase();
  switch (raw) {
    case "kitchen": return fallbackRole === "kitchen_manager" ? "kitchen_manager" : "kitchen_staff";
    case "cleaning": return fallbackRole === "cleaning_manager" ? "cleaning_manager" : "cleaning_staff";
    case "shopping":
    case "buyer": return "shopping_staff";
    case "waitering":
    case "server": return "waiter";
    case "general_staff":
    case "employee":
    case "team_member":
    case "outsource":
    case "staff": return "staff";
    default: return "staff";
  }
}

export const CHAT_ROLE_ALIASES: Record<string, ChatCanonicalRole> = {
  kitchen: "kitchen_staff",
  cleaning: "cleaning_staff",
  buyer: "shopping_staff",
  waitering: "waiter",
  server: "waiter",
  general_staff: "staff",
  employee: "staff",
  team_member: "staff",
  outsource: "staff",
};
