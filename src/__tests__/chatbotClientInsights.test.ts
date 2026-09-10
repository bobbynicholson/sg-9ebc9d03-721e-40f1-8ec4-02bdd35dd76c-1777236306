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

  it("routes a natural-language balance question to the exact client balance tool", () => {
    const message = "How much money are remmaing for me to pay now?";
    expect(routeChatQuestion(message, "client").route).toBe("live_data");
    expect(selectLiveTools("client", message).some((tool) => tool.id === "client_balance")).toBe(true);
    expect(getLiveToolDefinition("client_balance")?.roles).toEqual(["client"]);
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

  it("returns the exact outstanding amount and invoice breakdown", async () => {
    const answer = await generateChatReply({
      identity: clientIdentity,
      message: "How much money are remmaing for me to pay now?",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({
        company_profile: { currency: "ZAR" },
        client_balance: {
          invoice_count: 2,
          outstanding_balance: 35500,
          invoices: [
            { invoice_number: "INV-005589", balance_due: 25000, due_date: "2026-09-15", status: "sent" },
            { invoice_number: "INV-005590", balance_due: 10500, due_date: "2026-10-01", status: "partially_paid" },
          ],
        },
      })}`,
      knowledge: [],
      navigation: [],
    });

    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.title).toBe("Outstanding balance");
    expect(answer.rendered.message).toMatch(/35[\s\u00a0]500,00/);
    expect(answer.rendered.details.join(" ")).toContain("INV-005589");
    expect(answer.rendered.details.join(" ")).toContain("INV-005590");
  });

  it("makes customer balances available to authorized admin roles", async () => {
    expect(routeChatQuestion("Which clients owe money?", "company_admin").route).toBe("live_data");
    expect(selectLiveTools("company_admin", "Which clients owe money?").some((tool) => tool.id === "customer_balances")).toBe(true);
    const adminAnswer = await generateChatReply({
      identity: { ...clientIdentity, role: "company_admin", fullName: "Company Admin" },
      message: "Which clients owe money?",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({
        company_profile: { currency: "ZAR" },
        customer_balances: {
          customer_count: 1,
          total_outstanding: 4200,
          customers: [{ client_name: "Example Client", email: "client@example.com", outstanding_balance: 4200, unpaid_invoices: 1 }],
        },
      })}`,
      knowledge: [],
      navigation: [],
    });

    expect(adminAnswer.rendered.title).toBe("Customer outstanding balances");
    expect(adminAnswer.rendered.message).toMatch(/4[\s\u00a0]200,00/);
    expect(adminAnswer.rendered.details.join(" ")).toContain("Example Client");
  });
});
