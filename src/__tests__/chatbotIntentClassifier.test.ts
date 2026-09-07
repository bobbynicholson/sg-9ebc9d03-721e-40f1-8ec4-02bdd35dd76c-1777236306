import { classifyChatIntent } from "@/lib/chatbot/intents/classifier";
import { getIntentNavigationRefs, getIntentToolIds } from "@/lib/chatbot/intents/policy";
import { routeChatQuestion } from "@/server/chatbot/router";

describe("chatbot structured intent layer", () => {
  it("normalizes natural kitchen inventory wording into one intent", () => {
    const intent = classifyChatIntent("What are the items we have and which are too less?", "kitchen_staff");

    expect(intent?.id).toBe("kitchen.inventory.status");
    expect(intent?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(getIntentToolIds(intent, "kitchen_staff", new Set(["kitchen_inventory"])))
      .toEqual(["kitchen_inventory"]);
    expect(getIntentNavigationRefs(intent, "kitchen_staff")).toEqual(["kitchen.stock"]);
  });

  it("handles common spelling mistakes for upcoming kitchen work", () => {
    const intent = classifyChatIntent("Is there any upcomming events for me?", "kitchen_manager");

    expect(intent?.id).toBe("kitchen.schedule.upcoming");
    expect(intent?.toolIds).toEqual(["kitchen_orders", "kitchen_prep_tasks"]);
    expect(routeChatQuestion("Is there any upcomming events for me?", "kitchen_manager")).toMatchObject({
      route: "live_data",
      intent: { id: "kitchen.schedule.upcoming" },
    });
  });

  it("keeps intent tools role-scoped", () => {
    expect(classifyChatIntent("Which ingredients are too low?", "driver")).toBeNull();
    expect(classifyChatIntent("What are my month earnings?", "driver")?.id).toBe("driver.earnings");
    expect(classifyChatIntent("I want to change my password", "cleaning_staff")?.id).toBe("account.security");
  });

  it("stops before live queries when the validated classifier requests clarification", () => {
    const route = routeChatQuestion("show my order work", "driver", {
      id: "data.order_work_hours",
      domain: "driver",
      action: "read",
      entity: "order_work_hours",
      toolIds: ["order_work_hours"],
      navigationRefs: ["driver.deliveries"],
      confidence: 0.94,
      normalizedMessage: "show my order work",
      matchedBy: "openai",
      timeRange: "unspecified",
      scope: "order",
      needsClarification: true,
    });

    expect(route).toMatchObject({ route: "knowledge", useKnowledge: false, useLiveData: false });
  });
});
