import { generateChatReply } from "@/server/chatbot/brain";

const roles = [
  ["super_admin", "platform administrator"],
  ["company_admin", "company administrator"],
  ["admin", "operations administrator"],
  ["kitchen_manager", "kitchen manager"],
  ["kitchen_staff", "kitchen staff member"],
  ["shopping_staff", "shopping and procurement staff"],
  ["driver", "driver"],
  ["waiter", "waiter"],
  ["cleaning_manager", "cleaning manager"],
  ["cleaning_staff", "cleaning staff member"],
  ["client", "client"],
] as const;

describe("role-specific chatbot capability answers", () => {
  it.each(roles)("answers for %s instead of using platform-admin wording", async (role, label) => {
    const answer = await generateChatReply({
      identity: {
        userId: `${role}-user`,
        companyId: role === "super_admin" ? null : "company-1",
        role,
        fullName: "Test user",
        regionId: null,
        regionsCovered: [],
      },
      message: "How can you help me?",
      history: [],
      liveContext: "",
      knowledge: [],
      navigation: [],
    });

    expect(answer.provider).toBe("role-guidance");
    expect(answer.rendered.title?.toLowerCase()).toContain(label);
    if (role !== "super_admin") {
      expect(answer.rendered.message.toLowerCase()).not.toContain("platform administrator");
    }
    expect(answer.rendered.details?.length).toBeGreaterThan(0);
  });
});
