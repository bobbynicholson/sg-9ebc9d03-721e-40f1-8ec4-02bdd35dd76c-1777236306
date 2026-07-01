import {
  classifyOrderRevenue,
  isBookedRevenue,
  isCountableOrder,
} from "@/lib/orderRevenueClassification";

describe("orderRevenueClassification", () => {
  it("treats active orders with completed payment status as booked revenue", () => {
    const order = {
      status: "confirmed",
      payment_status: "completed",
      deposit_paid: false,
      confirmed_at: null,
      cancelled_at: null,
    };

    expect(classifyOrderRevenue(order)).toBe("booked");
    expect(isBookedRevenue(order)).toBe(true);
  });

  it("excludes rows stamped cancelled even when the status has not caught up", () => {
    const order = {
      status: "confirmed",
      payment_status: "paid",
      deposit_paid: true,
      confirmed_at: "2026-07-01T08:00:00Z",
      cancelled_at: "2026-07-01T09:00:00Z",
    };

    expect(classifyOrderRevenue(order)).toBe("churned");
    expect(isBookedRevenue(order)).toBe(false);
    expect(isCountableOrder(order)).toBe(false);
  });
});
