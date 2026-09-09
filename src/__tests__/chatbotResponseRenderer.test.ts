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

  it("unwraps a structured payload accidentally placed in a detail row", () => {
    const response = renderChatResponse({
      title: "Product guidance",
      message: "I can provide the recipe details.",
      details: [JSON.stringify({
        title: "Recipe & Pricing Info",
        message: "I can provide the recipe details, but pricing is not available.",
        details: ["Chocolate Brownie & Cream", "Malva Pudding & Custard"],
      })],
    });

    expect(response.title).toBe("Recipe & Pricing Info");
    expect(response.message).toBe("I can provide the recipe details, but pricing is not available.");
    expect(response.details).toEqual(["Chocolate Brownie & Cream", "Malva Pudding & Custard"]);
    expect(response.text).not.toContain('{"title"');
  });

  it("repairs the legacy persisted payload shape from kitchen chat history", () => {
    const inner = JSON.stringify({
      title: "Recipe & Pricing Info",
      message: "I can share the recipes, but pricing is not available.",
      details: ["1. Lamb Ribs Half Portion", "2. Malva Pudding & Custard"],
    });
    const response = beautifyChatResponse({
      text: inner,
      style: "structured",
      title: "",
      message: inner,
      details: [""],
      actions: [],
    });

    expect(response.title).toBe("Recipe & Pricing Info");
    expect(response.message).toBe("I can share the recipes, but pricing is not available.");
    expect(response.details).toEqual(["1. Lamb Ribs Half Portion", "2. Malva Pudding & Custard"]);
    expect(response.text).not.toContain('{"title"');
  });

  it("recovers completed fields when an inner JSON answer is truncated", () => {
    const truncated = '{"title":"Recipes & Pricing","message":"Here are all the recipes we have on hand. Pricing details are not available in the current data set.","details":["1. Lamb Ribs Half Portion – 10 servings, 15 min prep, 30 min cook","2. Lamb Spit Full Portion – 10 servings, 20 min prep, 150 min cook","3. Sticky Chicken Wings – 10 servings, 10 min prep,';
    const response = beautifyChatResponse({
      title: "",
      message: truncated,
      details: [""],
      actions: [],
    });

    expect(response.title).toBe("Recipes & Pricing");
    expect(response.message).toContain("Here are all the recipes we have on hand.");
    expect(response.details).toHaveLength(2);
    expect(response.text).not.toContain('{"title"');
  });
});
