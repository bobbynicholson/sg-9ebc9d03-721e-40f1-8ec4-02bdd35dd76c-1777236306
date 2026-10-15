/** @jest-environment node */
import { describeOrderChanges, emailCompanyAboutOrderChangeRequest } from "@/lib/email/orderChangeRequestEmail";
import { emailService } from "@/services/emailService";

jest.mock("@/services/emailService", () => ({ emailService: { sendEmail: jest.fn() } }));

let companyEmail: string | null = "hello@spitbraaidelivery.co.za";
const adminLogins = [{ email: "owner@example.com" }, { email: "owner@example.com" }, { email: "admin@example.com" }];

jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    from: (table: string) => {
      const q: any = {};
      q.select = () => q;
      q.eq = () => q;
      q.in = () => Promise.resolve({ data: adminLogins, error: null });
      q.maybeSingle = async () => ({
        data: table === "companies"
          ? { email: companyEmail, company_name: "Spit Braai Delivery", slug: "spit-braai-delivery" }
          : { order_number: "ORD-918893", client_name: "M Dabels", event_date: "2026-11-20" },
        error: null,
      });
      return q;
    },
  }),
}));

const request = {
  companyId: "c1",
  orderId: "o1",
  amendmentId: "a1",
  changes: { guest_count: 120, venue_address: "12 Main Rd", menu_items: [{ name: "Lamb", quantity: 2 }] },
  notes: "Please add vegetarian option",
  via: "client portal" as const,
};

describe("order change request email to the company", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    companyEmail = "hello@spitbraaidelivery.co.za";
    (emailService.sendEmail as jest.Mock).mockResolvedValue(true);
  });

  it("emails the company inbox with a clearly identifiable subject, the changes and a review link", async () => {
    const result = await emailCompanyAboutOrderChangeRequest(request);
    expect(result).toEqual({ sent: 1, targets: ["hello@spitbraaidelivery.co.za"] });
    const mail = (emailService.sendEmail as jest.Mock).mock.calls[0][0];
    expect(mail.to).toBe("hello@spitbraaidelivery.co.za");
    expect(mail.subject).toBe("Client change request - ORD-918893 (M Dabels)");
    expect(mail.body).toContain("Guest count: 120");
    expect(mail.body).toContain("Venue address: 12 Main Rd");
    expect(mail.body).toContain("Menu: Lamb x 2");
    expect(mail.body).toContain("Please add vegetarian option");
    expect(mail.body).toContain("/spit-braai-delivery/admin/orders?orderId=o1&amendment=a1");
    expect(mail.orderId).toBe("o1");
  });

  it("falls back to the owner and admin logins when the company has no email", async () => {
    companyEmail = null;
    const result = await emailCompanyAboutOrderChangeRequest(request);
    expect(result.targets).toEqual(["owner@example.com", "admin@example.com"]);
    expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("never throws, so the client's request is still saved if email fails", async () => {
    (emailService.sendEmail as jest.Mock).mockRejectedValue(new Error("provider down"));
    await expect(emailCompanyAboutOrderChangeRequest(request)).resolves.toEqual({ sent: 0, targets: [] });
  });

  it("describes changes in plain words", () => {
    expect(describeOrderChanges({ special_instructions: "", equipment_items: [1, 2, 3] })).toEqual([
      "Special instructions: (cleared)",
      "Equipment: 1, 2, 3",
    ]);
  });
});
