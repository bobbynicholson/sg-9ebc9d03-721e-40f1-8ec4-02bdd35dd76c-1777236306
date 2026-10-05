/** @jest-environment node */
import { generateInvoiceData } from "@/services/invoiceGenerationService";
jest.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
jest.mock("@/services/notificationService", () => ({ notificationService: {} }));
jest.mock("@/services/emailService", () => ({ emailService: {} }));
jest.mock("@/lib/customerLinksServer", () => ({ mintOrderCustomerLink: jest.fn() }));
jest.mock("@/services/branchSettingsService", () => ({ resolveBranchSettings: async () => ({ vatRegistered: false, vatRate: 0 }) }));

function database() {
  const sb: any = { rpc: jest.fn().mockResolvedValue({ data: "INV-NEW", error: null }) };
  sb.from = jest.fn((table: string) => {
    const data = table === "orders"
      ? { id: "order-1", subtotal: 100, total_amount: 100, amount_paid: 5, event_date: "2026-10-14", clients: { client_name: "Client", email: "client@example.com" } }
      : table === "companies" ? { company_name: "Caterer", vat_registered: false } : [];
    const q: any = { then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) };
    q.select = q.eq = q.order = () => q;
    q.single = async () => ({ data, error: null });
    return q;
  });
  return sb;
}

describe("invoice regeneration identity", () => {
  it("rebuilds existing invoice amounts without allocating a different document number", async () => {
    const sb = database();
    const result = await generateInvoiceData("order-1", "company-1", sb, { invoiceNumber: "INV-005603" });
    expect(result).toMatchObject({ success: true, data: { invoiceNumber: "INV-005603", total: 100, depositPaid: 5, balanceDue: 95 } });
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("still allocates a number for a genuinely new invoice", async () => {
    const sb = database();
    const result = await generateInvoiceData("order-1", "company-1", sb);
    expect(result).toMatchObject({ success: true, data: { invoiceNumber: "INV-NEW" } });
    expect(sb.rpc).toHaveBeenCalledWith("consume_next_document_number", { p_company_id: "company-1", p_document_type: "invoice" });
  });
});
