import { getRelevantNavigation } from "@/lib/chatbot/navigation";
import { getRelevantWorkflows } from "@/lib/chatbot/workflows";

describe("chatbot: invoice a duplicated rebooked order", () => {
  const question = "The client cancelled Friday, I duplicated their booking for next Friday. How do I create an invoice for the new order?";

  it("gives the actual order finance steps and warns that payment history is not copied", () => {
    const [workflow] = getRelevantWorkflows(question, "company_admin");

    expect(workflow.id).toBe("duplicate-order-invoice");
    expect(workflow.steps.map((step) => step.ref)).toEqual([
      "admin.orders.list",
      "admin.order-finance",
      "admin.order-finance",
    ]);
    expect(workflow.steps[1].description).toContain("original invoice and payment history stay with the cancelled order");
    expect(workflow.steps[1].description).toContain("do not record the same deposit again as a new payment");
    expect(workflow.steps[1].description).toContain("apply available store credit through its payment link");
    expect(workflow.steps[2].description).toContain("Create payment request");
    expect(workflow.steps[2].description).toContain("Quote acceptance is not needed");
  });

  it("links an admin to the Orders page for the Finance action", () => {
    const [finance] = getRelevantNavigation("create invoice for duplicated booking", "company_admin", 8)
      .filter((item) => item.ref === "admin.order-finance");

    expect(finance?.href).toBe("/admin/orders");
  });

  it("does not expose billing workflow guidance to operational staff or clients", () => {
    expect(getRelevantWorkflows(question, "kitchen_staff")).toEqual([]);
    expect(getRelevantWorkflows(question, "client")).toEqual([]);
  });
});
