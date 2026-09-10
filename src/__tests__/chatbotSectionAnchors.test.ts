import { indexChatPageSections, scrollToChatHash } from "@/lib/chatbot/sectionAnchors";

describe("chatbot section anchors", () => {
  beforeEach(() => {
    document.body.innerHTML = "<main><section><h2>Payment history</h2></section></main>";
    window.history.replaceState({}, "", "/admin/orders#chat-section-payment-history");
  });

  it("creates a stable anchor for an unmarked page section", () => {
    const sections = indexChatPageSections();
    const target = document.getElementById("chat-section-payment-history");

    expect(sections.some((section) => section.id === "chat-section-payment-history")).toBe(true);
    expect(target).not.toBeNull();
    expect(target?.getAttribute("data-chat-section")).toBe("chat-section-payment-history");
  });

  it("scrolls to an explicit or generated hash target", () => {
    indexChatPageSections();
    const target = document.getElementById("chat-section-payment-history") as HTMLElement;
    target.scrollIntoView = jest.fn();

    expect(scrollToChatHash()).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("returns false until a delayed section has mounted", () => {
    document.body.innerHTML = "<main />";
    expect(scrollToChatHash("#later-section")).toBe(false);

    const target = document.createElement("section");
    target.id = "later-section";
    target.scrollIntoView = jest.fn();
    document.querySelector("main")?.appendChild(target);

    expect(scrollToChatHash("#later-section")).toBe(true);
  });
});
