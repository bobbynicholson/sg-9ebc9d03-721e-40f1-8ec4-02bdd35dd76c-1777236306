import { resolveEmailTemplate } from "@/services/email/templateResolver";

// Chainable Supabase stub whose lookups always return no row, so the
// resolver falls through to the caller-supplied fallback and we can
// assert purely on the {{var}} substitution behaviour.
function noRowClient() {
  const qb: any = {};
  ["select", "eq", "is"].forEach((m) => {
    qb[m] = jest.fn(() => qb);
  });
  qb.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  return { from: jest.fn(() => qb) };
}

describe("resolveEmailTemplate substitution", () => {
  const base = {
    companyId: "company-1",
    templateType: "test_template",
    client: noRowClient(),
  };

  it("replaces supplied variables", async () => {
    const res = await resolveEmailTemplate({
      ...base,
      variables: { first_name: "Ede", order_number: "ORD-001" },
      fallback: {
        subject: "Order {{order_number}}",
        bodyHtml: "Hi {{first_name}}, thanks!",
      },
    });
    expect(res.subject).toBe("Order ORD-001");
    expect(res.bodyHtml).toBe("Hi Ede, thanks!");
  });

  it("strips placeholders the caller did not supply (no raw {{tags}} leak)", async () => {
    const res = await resolveEmailTemplate({
      ...base,
      variables: { first_name: "Ede" },
      fallback: {
        subject: "Hi {{first_name}}",
        bodyHtml: "Balance {{balance_due}} due on {{due_date}}.",
      },
    });
    expect(res.bodyHtml).toBe("Balance  due on .");
    expect(res.bodyHtml).not.toContain("{{");
  });

  it("is whitespace-tolerant inside the braces", async () => {
    const res = await resolveEmailTemplate({
      ...base,
      variables: { first_name: "Ede" },
      fallback: { subject: "s", bodyHtml: "Hi {{ first_name }}!" },
    });
    expect(res.bodyHtml).toBe("Hi Ede!");
  });

  it("renders null/undefined variables as empty, not the literal word", async () => {
    const res = await resolveEmailTemplate({
      ...base,
      variables: { first_name: null, order_number: undefined },
      fallback: { subject: "s", bodyHtml: "[{{first_name}}][{{order_number}}]" },
    });
    expect(res.bodyHtml).toBe("[][]");
  });
});
