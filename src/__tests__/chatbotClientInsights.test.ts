import { generateChatReply, type ChatIdentity } from "@/server/chatbot/brain";
import { getLiveToolDefinition, selectLiveTools } from "@/server/chatbot/liveTools";
import { routeChatQuestion } from "@/server/chatbot/router";

const clientIdentity: ChatIdentity = {
  userId: "client-1",
  companyId: "company-1",
  role: "client",
  fullName: "Alex Client",
  email: "alex@example.com",
  regionId: null,
  regionsCovered: [],
};

describe("client chatbot guidance and insights", () => {
  it("routes personal statistics to the client insights tool", () => {
    expect(routeChatQuestion("Give me my booking and payment insights", "client").route).toBe("live_data");
    expect(selectLiveTools("client", "Give me my booking and payment insights").some((tool) => tool.id === "client_insights")).toBe(true);
    expect(selectLiveTools("client", "What is included in my order?").some((tool) => tool.id === "order_items")).toBe(true);
  });

  it("explains the client journey without exposing internal operations", async () => {
    const answer = await generateChatReply({
      identity: clientIdentity,
      message: "How does CateringMS work for my event?",
      history: [],
      liveContext: "",
      knowledge: [],
      navigation: [],
    });

    expect(answer.provider).toBe("client-guidance");
    expect(answer.rendered.title).toContain("CateringMS journey");
    expect(answer.rendered.details.join(" ")).toContain("review the quote");
    expect(answer.rendered.details.join(" ")).toContain("Billing and aftercare");
  });

  it("renders personal booking, guest, payment, and feedback statistics", async () => {
    const answer = await generateChatReply({
      identity: clientIdentity,
      message: "Give me my booking and payment insights",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({
        company_profile: { currency: "ZAR" },
        client_insights: {
          client_name: "Alex Client",
          totals: {
            bookings: 4,
            upcoming_bookings: 1,
            completed_bookings: 3,
            total_guests: 420,
            average_guests_per_booking: 105,
            booking_value: 125000,
            quotes: 5,
            invoices: 4,
            amount_paid: 90000,
            balance_due: 35000,
            payment_completion_percent: 72,
            feedback_submissions: 2,
            average_rating: 4.5,
          },
          next_event: { event_name: "Annual Dinner", event_date: "2026-10-12", venue_name: "Main Hall", guest_count: 120 },
        },
      })}`,
      knowledge: [],
      navigation: [],
    });

    expect(getLiveToolDefinition("client_insights")?.roles).toEqual(["client"]);
    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.message).toContain("Alex Client");
    expect(answer.rendered.details.join(" ")).toContain("4 total");
    expect(answer.rendered.details.join(" ")).toContain("420 total guests");
    expect(answer.rendered.details.join(" ")).toContain("72.0% of invoice value paid");
    expect(answer.rendered.details.join(" ")).toContain("4.5/5 average rating");
  });
});
