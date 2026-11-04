/**
 * @jest-environment node
 */
import { driverPayslipService, type PayslipMeta } from "@/services/driverPayslipService";
import type { DriverPaySummary } from "@/services/driverPayService";

const meta: PayslipMeta = {
  companyName: "Sample Catering",
  companyBrandColor: "#f21f07",
  driverName: "Sample Driver",
  periodFrom: "2026-10-01",
  periodTo: "2026-10-31",
  currencyCode: "ZAR",
};

const shift = { shift_id: "s1", shift_date: "2026-10-05", hours: 8, multiplier: 1, hourly_rate: 45, pay: 360 };
const delivery = { order_id: "order-1", order_number: "ORD-1", event_name: "Lunch", distance_km: 10, distance_rate: 4, distance_pay: 40, callout_fee: 100, total: 140 };

function summary(shifts: unknown[], deliveries: unknown[]): DriverPaySummary {
  return {
    rates: {},
    shifts,
    deliveries,
    totals: {
      hours_total: shifts.length * 8,
      hourly_pay: shifts.length * 360,
      distance_total_km: deliveries.length * 10,
      distance_pay: deliveries.length * 40,
      callout_pay: deliveries.length * 100,
      grand_total: shifts.length * 360 + deliveries.length * 140,
    },
  } as unknown as DriverPaySummary;
}

async function render(overrides: Partial<PayslipMeta>, data: DriverPaySummary) {
  const blob = await driverPayslipService.generatePayslipPdf({ ...meta, ...overrides }, data);
  return Buffer.from(await blob.arrayBuffer()).toString("latin1");
}

const pageCount = (pdf: string) => (pdf.match(/\/Type \/Page\b/g) || []).length;

describe("driver payslip PDF", () => {
  it("shows the total, its breakdown and both total rows", async () => {
    const pdf = await render({ payoutStatus: "paid", payoutMethod: "eft" }, summary([shift], [delivery]));
    expect(pdf).toContain("TOTAL DRIVER PAY");
    expect(pdf).toContain("R 500,00");
    expect(pdf).toContain("HOURLY PAY");
    expect(pdf).toContain("Shift detail");
    expect(pdf).toContain("Delivery detail");
    // Two total rows, plus the delivery table's "Total" column heading.
    expect(pdf.match(/\(Total\) Tj/g)).toHaveLength(3);
  });

  it.each([
    [{ payoutStatus: "paid" as const }, "PAID"],
    [{ payoutStatus: "draft" as const }, "UNPAID"],
    [{ payoutStatus: null }, "NOT RECORDED"],
  ])("labels the payment status for %j", async (overrides, label) => {
    expect(await render(overrides, summary([shift], []))).toContain(`(${label}) Tj`);
  });

  it("says so when there are no line items", async () => {
    expect(await render({}, summary([], []))).toContain("No shift or delivery line items");
  });

  it("keeps a normal payslip on one page and flows long ones onto more", async () => {
    expect(pageCount(await render({}, summary([shift, shift, shift], [delivery, delivery])))).toBe(1);
    const long = await render({}, summary(Array(40).fill(shift), Array(30).fill(delivery)));
    expect(pageCount(long)).toBeGreaterThan(1);
    expect(long).toContain("Page 2 of");
  });

  it("still renders when the logo cannot be loaded", async () => {
    const original = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    try {
      expect(await render({ companyLogoUrl: "/logo.png" }, summary([shift], []))).toContain("(SC) Tj");
    } finally {
      global.fetch = original;
    }
  });
});
