import {
  getDisplayDeliveryMinutes,
  getDisplayDeliveryTime,
  parseOrderTime,
} from "@/lib/orderTimeDisplay";

describe("order time display rules", () => {
  it("uses the explicit delivery time when one is stored", () => {
    expect(getDisplayDeliveryTime("12:15:00", "13:00:00")).toBe("12:15");
  });

  it("derives delivery one hour before eating when delivery is missing", () => {
    expect(getDisplayDeliveryTime(null, "13:00:00")).toBe("12:00");
  });

  it("keeps pickup and setup independent from delivery", () => {
    expect(parseOrderTime("11:00:00")).toBe(660);
    expect(getDisplayDeliveryMinutes(null, "13:00:00")).not.toBe(660);
  });

  it("wraps a pre-midnight derived time for display", () => {
    expect(getDisplayDeliveryTime(null, "00:30:00")).toBe("23:30");
  });
});
