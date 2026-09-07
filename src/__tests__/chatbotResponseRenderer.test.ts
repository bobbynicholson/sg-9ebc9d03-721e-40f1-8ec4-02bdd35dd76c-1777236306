import { beautifyChatResponse, renderChatResponse } from "@/lib/chatbot/responseRenderer";

describe("chatbot response renderer", () => {
  it("does not rewrite technical words inside internal links", () => {
    const response = renderChatResponse(JSON.stringify({
      title: "Company owners",
      message: "Open the company record.",
      details: ["[Bobby Whitcher](/admin/platform/company-database?company=company-1)"],
    }));

    expect(response.details[0]).toContain("/admin/platform/company-database?company=company-1");
    expect(response.details[0]).not.toContain("company-company records");
  });

  it("renders structured detail objects instead of JavaScript object text", () => {
    const response = renderChatResponse(JSON.stringify({
      title: "Today's Kitchen Work",
      message: "Here is what you have lined up today.",
      details: [
        { label: "Kitchen today", description: "Today's kitchen work" },
        { label: "Kitchen notifications", description: "Notifications relevant to kitchen work" },
        { label: "Production board", description: "See production work by day and order" },
      ],
    }));

    expect(response.text).not.toContain("[object Object]");
    expect(response.details).toEqual([
      "Kitchen today: Today's kitchen work",
      "Kitchen notifications: Notifications relevant to kitchen work",
      "Production board: See production work by day and order",
    ]);
  });

  it("unwraps nested live-data payloads and keeps long recipe lists readable", () => {
    const response = renderChatResponse(JSON.stringify({
      title: "Current information",
      message: JSON.stringify({
        title: "All Recipes",
        message: "Here are the recipes available in the kitchen catalogue.",
        details: Array.from({ length: 16 }, (_, index) => `${index + 1}. Recipe ${index + 1}`),
      }),
    }));

    expect(response.title).toBe("All Recipes");
    expect(response.message).toBe("Here are the recipes available in the kitchen catalogue.");
    expect(response.details).toHaveLength(16);
    expect(response.text).not.toContain('{"title"');
  });

  it("beautifies object-shaped and doubly wrapped provider output", () => {
    const response = beautifyChatResponse({
      title: "Current information",
      message: {
        title: "Recipe details",
        message: JSON.stringify({
          title: "Dessert recipes",
          message: "Three dessert recipes are available.",
          details: ["Chocolate Brownie & Cream", "Malva Pudding & Custard", "Peppermint Crisp Tart"],
        }),
      },
    });

    expect(response.title).toBe("Dessert recipes");
    expect(response.message).toBe("Three dessert recipes are available.");
    expect(response.details).toEqual([
      "Chocolate Brownie & Cream",
      "Malva Pudding & Custard",
      "Peppermint Crisp Tart",
    ]);
    expect(response.text).not.toContain("[object Object]");
    expect(response.text).not.toContain('{"title"');
  });
});
