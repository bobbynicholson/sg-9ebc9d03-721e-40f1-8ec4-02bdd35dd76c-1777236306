import { buildCompleteChatIntentRegistry } from "@/lib/chatbot/intents/registry";
import { classifyChatIntent } from "@/lib/chatbot/intents/classifier";
import { CORE_NAVIGATION_REFS, NAVIGATION_REFS } from "@/lib/chatbot/navigation";
import { LIVE_TOOL_DEFINITIONS } from "@/server/chatbot/liveTools";
import { CHAT_ACCESS_ROLES } from "@/server/chatbot/accessPolicy";
import { CHAT_ROLE_ALIASES, normalizeChatRole } from "@/lib/chatbot/roles";
import { getLiveToolsForRole } from "@/server/chatbot/liveTools";

const registry = buildCompleteChatIntentRegistry(LIVE_TOOL_DEFINITIONS, NAVIGATION_REFS);

describe("complete chatbot intent catalog", () => {
  it("covers every live tool and every navigation destination", () => {
    for (const tool of LIVE_TOOL_DEFINITIONS) {
      expect(registry.some((intent) => intent.toolIds.includes(tool.id))).toBe(true);
    }
    for (const page of NAVIGATION_REFS) {
      expect(registry.some((intent) => intent.navigationRefs.includes(page.ref))).toBe(true);
    }
  });

  it("covers every core navigation reference with a role-scoped intent", () => {
    for (const ref of CORE_NAVIGATION_REFS) {
      const intents = registry.filter((intent) => intent.navigationRefs.includes(ref.ref));
      expect(intents.length).toBeGreaterThan(0);
      for (const role of ref.roles || []) {
        expect(intents.some((intent) => intent.roles.includes(role))).toBe(true);
      }
    }
  });

  it("has at least one capability for every authenticated role", () => {
    for (const role of CHAT_ACCESS_ROLES) {
      expect(registry.some((intent) => intent.roles.includes(role))).toBe(true);
    }
  });

  it("normalizes every legacy portal role alias into the complete canonical catalog", () => {
    for (const [alias, canonical] of Object.entries(CHAT_ROLE_ALIASES)) {
      expect(normalizeChatRole(alias)).toBe(canonical);
      expect(registry.some((intent) => intent.roles.includes(canonical))).toBe(true);
    }
  });

  it("classifies platform-owner capabilities without exposing them to company roles", () => {
    const ownerIntent = classifyChatIntent("show all registered companies", "super_admin", registry);
    expect(ownerIntent?.toolIds).toContain("registered_companies");
    expect(classifyChatIntent("show pending invitations", "super_admin", registry)?.toolIds).toContain("platform_pending_invitations");
    expect(classifyChatIntent("show all registered companies", "driver", registry)).toBeNull();
  });

  it("gives every operational role the shared work and assignment capabilities", () => {
    for (const role of ["kitchen_manager", "kitchen_staff", "shopping_staff", "shopping", "driver", "waiter", "cleaning_manager", "cleaning_staff", "staff"]) {
      const ids = new Set(getLiveToolsForRole(role).map((tool) => tool.id));
      expect(ids.has("staff_orders")).toBe(true);
      expect(ids.has("work_clock_status")).toBe(true);
      expect(ids.has("work_hours")).toBe(true);
      expect(ids.has("staff_shift_schedule")).toBe(true);
      expect(ids.has("user_notifications")).toBe(true);
    }
  });

  it("keeps every declared live tool represented by an intent", () => {
    const expected = [
      "order_items", "inventory_movements", "catalogue_menu", "supplier_records", "delivery_tracking",
      "vehicle_status", "cleaning_schedules", "reviews_feedback", "supplier_payables", "notification_preferences",
      "work_clock_status", "work_hours", "order_work_hours", "daily_operations_tasks", "staff_shift_schedule",
      "waiter_service_assignments", "cleaning_work_tasks", "cleaning_supplies",
    ];
    for (const id of expected) expect(registry.some((intent) => intent.toolIds.includes(id as any))).toBe(true);
  });
});
