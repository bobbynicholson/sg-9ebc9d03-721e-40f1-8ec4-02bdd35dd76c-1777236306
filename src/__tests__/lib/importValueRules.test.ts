import { normaliseAmount } from "@/lib/importNormalise";
import { settleFieldClashes, composeImportedClient } from "@/lib/importTemplates";

describe("normaliseAmount", () => {
  it.each([
    ["R 48 500", 48500],
    ["R12,000.00", 12000],
    ["12,000", 12000],
    ["5000,00", 5000],
    ["12 500,50", 12500.5],
    ["R 1.200,50", 1200.5],
    ["1.500,00", 1500],
    ["1.200.000", 1200000],
    ["101750", 101750],
    ["ZAR 350.75", 350.75],
    [1200, 1200],
  ])("%p -> %p", (raw, expected) => {
    expect(normaliseAmount(raw).value).toBe(expected);
  });

  it.each(["lots", "15 Jan 2025", "unlimited", "1.2.3"])("%p is rejected with a warning", (raw) => {
    const r = normaliseAmount(raw);
    expect(r.value).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

type SheetMap = Record<string, { target: string; confidence: number; rationale: string }>;
const d = (target: string, confidence = 0.9) => ({ target, confidence, rationale: "" });

describe("settleFieldClashes", () => {
  it("keeps the company as client name and moves the person to first name", () => {
    const sm: SheetMap = { Organisation: d("client_name", 1), "Contact name": d("client_name", 0.9), Email: d("email") };
    settleFieldClashes(sm, Object.keys(sm), "clients");
    expect(sm.Organisation.target).toBe("client_name");
    expect(sm["Contact name"].target).toBe("first_name");
  });

  it("treats a Name column next to Surname as the first name", () => {
    const sm: SheetMap = { Name: d("client_name", 1), Surname: d("last_name", 1), Email: d("email") };
    settleFieldClashes(sm, Object.keys(sm), "clients");
    expect(sm.Name.target).toBe("first_name");
    const row = composeImportedClient({ first_name: "Ayanda", last_name: "Mthembu", email: "a@example.com" });
    expect(row.client_name).toBe("Ayanda Mthembu");
  });

  it("leaves a company column on client name even with a surname column", () => {
    const sm: SheetMap = { Company: d("client_name", 1), Surname: d("last_name", 1) };
    settleFieldClashes(sm, Object.keys(sm), "clients");
    expect(sm.Company.target).toBe("client_name");
  });

  it("skips the less confident of two columns claiming one field", () => {
    const sm: SheetMap = { Email: d("email", 0.95), "Accounts email": d("email", 0.6) };
    settleFieldClashes(sm, Object.keys(sm), "clients");
    expect(sm.Email.target).toBe("email");
    expect(sm["Accounts email"].target).toBe("skip");
  });
});
