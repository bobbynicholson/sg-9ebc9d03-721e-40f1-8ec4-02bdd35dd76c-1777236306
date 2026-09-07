import { generateChatReply } from "@/server/chatbot/brain";
import { selectLiveTools } from "@/server/chatbot/liveTools";

const identity = {
  userId: "driver-user",
  companyId: "company-1",
  role: "driver",
  fullName: "Driver Test",
  regionId: null,
  regionsCovered: [] as string[],
};

function liveContext(value: unknown): string {
  return `LIVE AUTHORIZED TOOL RESULTS (queried at 2026-09-07T00:00:00.000Z):\n${JSON.stringify(value)}`;
}

describe("driver earnings chatbot grounding", () => {
  it("selects the dedicated earnings tool instead of generic deliveries", () => {
    const selected = selectLiveTools("driver", "What are my month earnings?");
    expect(selected[0]?.id).toBe("driver_earnings");
    expect(selected.some((tool) => tool.id === "assigned_deliveries")).toBe(false);
  });

  it("reports the supplied period totals without inventing a separate figure", async () => {
    const answer = await generateChatReply({
      identity,
      message: "What about my month earnings?",
      history: [],
      liveContext: liveContext({
        driver_earnings: {
          period: { from: "2026-09-01", to: "2026-09-07", label: "this month" },
          rates: { hourly_rate: 45, distance_rate_per_km: 2.6, base_callout_fee: 0 },
          totals: {
            hours_total: 18.76,
            hourly_pay: 844.2,
            distance_total_km: 0,
            distance_pay: 0,
            callout_pay: 0,
            grand_total: 844.2,
          },
          shifts: Array.from({ length: 8 }, () => ({ hours: 0, pay: 0 })),
          deliveries: [],
        },
        company_profile: { currency: "ZAR" },
      }),
      knowledge: [],
      navigation: [],
    });

    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.message).toContain("R 844,20");
    expect(answer.rendered.message).toContain("18.8 hours");
    expect(answer.rendered.message).not.toContain("2,450");
  });

  it("does not guess when earnings data is unavailable", async () => {
    const answer = await generateChatReply({
      identity,
      message: "Tell me my month earnings",
      history: [],
      liveContext: liveContext({ company_profile: { currency: "ZAR" } }),
      knowledge: [],
      navigation: [],
    });

    expect(answer.provider).toBe("live-data-unavailable");
    expect(answer.rendered.message).not.toContain("2,450");
    expect(answer.rendered.message.toLowerCase()).toContain("could not verify");
  });
});
