import { renderChatResponse } from "@/lib/chatbot/responseRenderer";

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
});
