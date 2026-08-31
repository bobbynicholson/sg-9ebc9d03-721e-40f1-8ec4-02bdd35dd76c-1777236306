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
});
