import { billingDisclosure } from "@/lib/billingDisclosure";

const details = { billingMode: "recurring", billingCycle: "Monthly", company_name: "Buyer Company",
  planName: "Starter", paidAmount: "R299", recurringAmount: "R299", nextBillingDate: "01/11/2026",
  subscriptionUrl: "https://example.com/company/admin/subscription" };
it("explains the charged amount, automatic renewal, date and cancellation", () => {
  const html = billingDisclosure(details);
  expect(html).toContain("Charged for this payment");
  expect(html).toContain("R299 every month");
  expect(html).toContain("01/11/2026");
  expect(html).toContain("Manage or cancel");
  expect(html).toContain("Buyer Company");
});
it("distinguishes annual renewal and trial setup from a deducted payment", () => {
  const html = billingDisclosure({ ...details, billingCycle: "Yearly", isTrial: true, paidAmount: "R0", recurringAmount: "R2990" });
  expect(html).toContain("R2990 every year");
  expect(html).toContain("No subscription payment was deducted today");
});
it("escapes email content and does not label unrelated mail as recurring", () => {
  expect(billingDisclosure({ ...details, company_name: "<script>" })).not.toContain("<script>");
  expect(billingDisclosure({})).toBe("");
});
