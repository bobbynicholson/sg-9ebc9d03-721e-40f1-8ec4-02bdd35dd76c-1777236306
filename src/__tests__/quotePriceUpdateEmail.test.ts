/** @jest-environment node */
import { buildQuotePriceUpdateEmail, shouldSendQuotePriceUpdate } from "@/services/quote/quotePriceUpdateEmail";
import { clearRecentSendMemory, emailService, type EmailSettings } from "@/services/emailService";
import { AUTOMATED_EMAIL_SECTIONS } from "@/lib/email/automatedEmailSections";
import { isApprovalControllable } from "@/lib/email/automatedEmailTemplates";
import { getTemplateDefinition } from "@/lib/messageTemplates/registry";

jest.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const input = {
  companyId: "company-1", companyName: "Catering company", quoteId: "quote-1", quoteNumber: "QUO-0042",
  updatedAt: "2026-10-23T13:00:00Z", quoteUrl: "https://cateringms.com/company/q/token",
  clientName: "Jane Contact", email: "jane@example.test", eventName: "Annual lunch", eventDate: "2026-11-05",
  guestCount: 100, currency: "ZAR", previousTotal: 5000, updatedTotal: 5750,
};
const eligibility = { previousStatus: "sent", converted: false, previousTotal: 5000, updatedTotal: 5750, email: input.email };

it("only sends automatic price increases on sent quotes before acceptance", () => {
  expect(shouldSendQuotePriceUpdate(eligibility)).toBe(true);
  for (const change of [
    { previousStatus: "draft" }, { previousStatus: "accepted" }, { previousStatus: "rejected" },
    { converted: true }, { manualSendPending: true }, { updatedTotal: 5000 }, { updatedTotal: 4000 },
    { updatedTotal: 5000.001 }, { updatedTotal: NaN }, { email: " " },
  ]) expect(shouldSendQuotePriceUpdate({ ...eligibility, ...change })).toBe(false);
});

it("exposes a separate automatic quote control and an editable tenant template", () => {
  expect(isApprovalControllable("quote_price_updated")).toBe(true);
  expect(isApprovalControllable("email_quote_revised")).toBe(false);
  expect(AUTOMATED_EMAIL_SECTIONS.find((section) => section.id === "quotes")?.templates)
    .toEqual(expect.arrayContaining([expect.objectContaining({ key: "quote_price_updated", controllable: true })]));
  expect(getTemplateDefinition("quote_price_updated")).toMatchObject({ scope: "tenant", delivery: "automated", group: "Quote" });
});

it("keeps the PDF, public link, contact greeting and a stable retry key", () => {
  const payload = buildQuotePriceUpdateEmail(input);
  expect(payload).toMatchObject({
    template: "quote_price_updated", quoteId: input.quoteId, attachQuotePdf: true,
    idempotencyKey: "quote-price-update/quote-1/2026-10-23T130000Z",
    variables: { first_name: "Jane", client_name: "Jane Contact", quote_url: input.quoteUrl },
  });
  expect(payload.variables.previous_total).toMatch(/5\s*000[.,]00/);
  expect(payload.variables.total).toMatch(/5\s*750[.,]00/);
  expect(payload.variables.increase_amount).toMatch(/750[.,]00/);
  expect(buildQuotePriceUpdateEmail({ ...input, quoteUrl: "" }).body).not.toContain("{{quote_url}}");
});

function db(preferences: Record<string, unknown>, custom?: { subject: string; body: string }) {
  return { from(table: string) {
    const q: Record<string, unknown> = {
      select: () => q, eq: () => q, neq: () => q, order: () => q, limit: () => q, in: () => q,
      maybeSingle: async () => ({ data: table === "email_provider_settings" ? { automation_preferences: preferences }
        : table === "email_templates" ? custom || null
          : table === "companies" ? { company_name: "Catering company" } : null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return q;
  } };
}

describe("real email service integration without sending mail", () => {
  const originalKey = process.env.RESEND_API_KEY;
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    clearRecentSendMemory();
    jest.spyOn(emailService, "getEmailConfig").mockResolvedValue({ enabled: true, provider: "resend", from_name: "Caterer", from_email: "office@example.test", resend_sending_domain: "example.test", resend_domain_status: "verified" } as EmailSettings);
    jest.spyOn(emailService, "logEmailSent").mockResolvedValue(null);
    jest.spyOn(emailService, "sendViaResend").mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });

  it.each([
    { template_delivery_modes: { quote_price_updated: "off" } },
    { queue_delivery_mode: "off" },
  ])("does not contact the provider when the quote update is off: %j", async (preferences) => {
    const result = await emailService.sendEmailDetailed({ ...buildQuotePriceUpdateEmail(input), _client: db(preferences) });
    expect(result).toMatchObject({ success: true, skipped_by_settings: true });
    expect(emailService.getEmailConfig).not.toHaveBeenCalled();
    expect(emailService.sendViaResend).not.toHaveBeenCalled();
  });

  it("uses saved subject and body overrides, the actual quote key, and current totals", async () => {
    const result = await emailService.sendEmailDetailed({ ...buildQuotePriceUpdateEmail(input), bypassQuarantine: true,
      _client: db({ queue_delivery_mode: "off", template_delivery_modes: { quote_price_updated: "automatic" } }, {
        subject: "Please review {{quote_number}}",
        body: "<html><body><p>Custom wording for {{first_name}}: {{previous_total}} to {{total}}. Added {{increase_amount}}.</p><a href=\"{{quote_url}}\">Review quote</a></body></html>",
      }),
    });
    expect(result.success).toBe(true);
    const sent = (emailService.sendViaResend as jest.Mock).mock.calls[0][0];
    expect(sent.subject).toBe("Please review QUO-0042");
    expect(sent.html).toContain("Custom wording for Jane");
    expect(sent.html).toContain(input.quoteUrl);
    expect(sent.html).not.toContain("{{");
    expect(sent.tags).toContainEqual({ name: "template", value: "quote_price_updated" });
  });

  it.each([undefined, { subject: "A & B {{quote_number}}", body: "Hi {{first_name}},\n\n{{event_name}}\n{{quote_url}}" }])("safely renders default or edited plain text without double-encoding names", async (custom) => {
    await emailService.sendEmailDetailed({ ...buildQuotePriceUpdateEmail({ ...input, eventName: 'A & B <img src=x onerror="bad">' }), bypassQuarantine: true, _client: db({}, custom) });
    const sent = (emailService.sendViaResend as jest.Mock).mock.calls[0][0];
    expect(sent.html).toContain("A &amp; B &lt;img");
    expect(sent.html).not.toContain("<img");
    expect(sent.html).not.toContain("&amp;amp;");
    expect(sent.html).toContain(`<a href="${input.quoteUrl}">`);
  });
});
