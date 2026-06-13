import { normalizeEmailVariables } from "@/lib/emailVariables";

describe("normalizeEmailVariables", () => {
  it("mirrors snake_case -> camelCase", () => {
    const out = normalizeEmailVariables({ order_number: "ORD-1" });
    expect(out.order_number).toBe("ORD-1");
    expect(out.orderNumber).toBe("ORD-1");
  });

  it("mirrors camelCase -> snake_case", () => {
    const out = normalizeEmailVariables({ firstName: "Ede" });
    expect(out.firstName).toBe("Ede");
    expect(out.first_name).toBe("Ede");
  });

  it("derives first_name from a supplied full name", () => {
    const out = normalizeEmailVariables({ client_name: "Ede Marais" });
    expect(out.first_name).toBe("Ede");
    expect(out.firstName).toBe("Ede");
  });

  it("does NOT invent a first_name when none can be derived", () => {
    const out = normalizeEmailVariables({ amount: "100.00" });
    expect(out.first_name).toBeUndefined();
  });

  it("never overwrites an explicitly-supplied value", () => {
    const out = normalizeEmailVariables({ first_name: "Sam", client_name: "Ede Marais" });
    expect(out.first_name).toBe("Sam");
  });

  it("treats company / tenant name as interchangeable", () => {
    const out = normalizeEmailVariables({ company_name: "Spit Braai" });
    expect(out.tenant_name).toBe("Spit Braai");
    expect(out.companyName).toBe("Spit Braai");
    expect(out.tenantName).toBe("Spit Braai");
  });

  it("fills invoice_number from order_number when only the latter is given", () => {
    const out = normalizeEmailVariables({ order_number: "ORD-9" });
    expect(out.invoice_number).toBe("ORD-9");
    expect(out.invoiceNumber).toBe("ORD-9");
  });

  it("leaves an empty bag empty", () => {
    expect(normalizeEmailVariables({})).toEqual({});
  });
});
