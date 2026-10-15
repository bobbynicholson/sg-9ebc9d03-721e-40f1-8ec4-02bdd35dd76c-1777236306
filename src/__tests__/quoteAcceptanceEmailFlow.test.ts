/** @jest-environment node */
/**
 * Quote-acceptance email flow (client brief, Oct 2026):
 *   accepted      -> deposit invoice email only, no order link
 *   deposit paid  -> thanks + order link, no invoice link
 *   balance paid  -> thanks + order link, no invoice link
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  clientFlowLinkRule,
  ensureRequiredOrderLink,
  stripLinkLines,
  withoutLinkVariables,
} from "@/lib/email/requiredCustomerLinks";
import { drainEmailQueue, isQuoteAcceptanceBookingEmail } from "@/lib/email/drainQueue";
import { emailService } from "@/services/emailService";
import { TEMPLATE_REGISTRY } from "@/lib/messageTemplates/registry";

jest.mock("@/services/emailService", () => ({ emailService: { sendEmailDetailed: jest.fn() } }));

const ORDER_URL = "https://cateringms.com/c/order/order-1?t=ord_secure";
const INVOICE_URL = "https://cateringms.com/pay/i/inv_token";

/** Same order as emailService: drop variables, fill in, strip lines, require order link. */
function render(templateKey: string, body: string, variables: Record<string, string>) {
  const rule = clientFlowLinkRule(templateKey)!;
  const vars = withoutLinkVariables(variables, rule);
  let out = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
  out = stripLinkLines(out, rule);
  return rule.requireOrderLink ? ensureRequiredOrderLink(out, vars.order_url) : out;
}

const registryBody = (key: string) => TEMPLATE_REGISTRY.find((t) => t.key === key)!.defaultBody;
const allLinks = { order_url: ORDER_URL, invoice_link: INVOICE_URL, payment_link: INVOICE_URL, first_name: "Sam", tenant_name: "Spit Braai" };

describe("deposit invoice email (quote accepted)", () => {
  it("has the invoice link and no order link, even when a caller passes one", () => {
    const out = render("deposit_invoice_issued", registryBody("deposit_invoice_issued"), allLinks);
    expect(out).toContain(INVOICE_URL);
    expect(out).not.toContain("/c/order/");
    expect(out).not.toContain("{{order_url}}");
  });

  it("removes the order link line from older or customised wording", () => {
    const legacy = "Hi {{first_name}},\n\nPay here: {{invoice_link}}\n\nView your order: {{order_url}}\n\nThanks,\n{{tenant_name}}";
    const out = render("deposit_invoice_issued", legacy, allLinks);
    expect(out).toBe(`Hi Sam,\n\nPay here: ${INVOICE_URL}\n\nThanks,\nSpit Braai`);
  });

  it("removes a hard-coded order link a caller already filled in", () => {
    const out = render("deposit_invoice_issued", `Pay: ${INVOICE_URL}\nView your order: ${ORDER_URL}`, {});
    expect(out).toBe(`Pay: ${INVOICE_URL}`);
  });
});

describe.each(["deposit_payment_received", "balance_payment_received"])("%s (payment receipt)", (key) => {
  it("has the order link and the client-portal note, and no invoice link", () => {
    const out = render(key, registryBody(key), allLinks);
    expect(out).toContain(`View your order: ${ORDER_URL}`);
    expect(out).toMatch(/client portal/i);
    expect(out).not.toContain("/pay/i/");
  });

  it("swaps an old invoice-link line for the order link", () => {
    const legacy = "Thanks for your payment.\n\nYou can view the updated invoice here: {{invoice_link}}\n\nThanks";
    const out = render(key, legacy, allLinks);
    expect(out).not.toContain("invoice_link");
    expect(out).not.toContain(INVOICE_URL);
    expect(out).toContain(`View your order: ${ORDER_URL}`);
  });
});

it("leaves every other email alone", () => {
  expect(clientFlowLinkRule("order_confirmed")).toBeUndefined();
  expect(clientFlowLinkRule("balance_invoice_issued")).toBeUndefined();
  expect(clientFlowLinkRule(undefined)).toBeUndefined();
});

it("never empties a one-line HTML body, only removes the unfilled placeholder", () => {
  const html = `<p>Pay here: <a href="${INVOICE_URL}">invoice</a></p><p>View your order: {{order_url}}</p>${"<p>.</p>".repeat(60)}`;
  const out = stripLinkLines(html, clientFlowLinkRule("deposit_invoice_issued")!);
  expect(out).toContain(INVOICE_URL);
  expect(out).not.toContain("{{order_url}}");
});

it("the migration writes the same wording as the template defaults", () => {
  const sql = readFileSync(
    path.join(__dirname, "..", "..", "supabase", "migrations", "20261015230000_quote_acceptance_email_flow.sql"),
    "utf8",
  );
  const sqlBody = (key: string) => {
    const block = sql.split("UPDATE public.email_templates").find((b) => b.includes(`'${key}'`))!;
    return [...block.matchAll(/E'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'").replace(/\\n/g, "\n")).join("");
  };
  for (const key of ["deposit_invoice_issued", "deposit_payment_received", "balance_payment_received"]) {
    expect(sqlBody(key)).toBe(registryBody(key));
  }
});

// ── Queue worker: "booking confirmed" email ────────────────────────────

function client(tables: Record<string, any[]>) {
  const sb: any = { rpc: jest.fn() };
  sb.from = jest.fn((table: string) => {
    const rows = tables[table] || [];
    const filters: Array<(r: any) => boolean> = [];
    let patch: any = null;
    const q: any = {};
    q.eq = (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; };
    q.in = (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return q; };
    q.lt = (k: string, v: number) => { filters.push((r) => r[k] < v); return q; };
    q.or = () => q;
    q.order = q.select = q.limit = () => q;
    q.update = (value: any) => { patch = value; return q; };
    const run = (single = false) => {
      const hits = rows.filter((r) => filters.every((f) => f(r)));
      if (patch) hits.forEach((r) => Object.assign(r, patch));
      const data = hits.map((r) => ({ ...r }));
      return { data: single ? data[0] || null : data, error: null };
    };
    q.then = (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject);
    q.maybeSingle = async () => run(true);
    return q;
  });
  return sb;
}

const bookingRow = (id: string, orderId: string) => ({
  id, company_id: "co-1", to_email: "client@example.com", subject: "booking confirmed", body: "Your booking",
  trigger_event: "order.created", trigger_ref_id: orderId, template_type: "order.created", attempts: 0, status: "queued",
});

describe("booking confirmed email after quote acceptance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (emailService.sendEmailDetailed as jest.Mock).mockResolvedValue({ success: true });
  });

  it("is recognised only for an order created from a quote", async () => {
    const sb = client({ orders: [{ id: "o-quote", company_id: "co-1", quote_id: "q-1" }, { id: "o-direct", company_id: "co-1", quote_id: null }] });
    expect(await isQuoteAcceptanceBookingEmail(sb, bookingRow("m1", "o-quote"))).toBe(true);
    expect(await isQuoteAcceptanceBookingEmail(sb, bookingRow("m2", "o-direct"))).toBe(false);
    expect(await isQuoteAcceptanceBookingEmail(sb, { ...bookingRow("m3", "o-quote"), trigger_event: "quote.sent" })).toBe(false);
  });

  it("is not sent for a quote order, and is still sent for an order created directly", async () => {
    const queue = [bookingRow("m-quote", "o-quote"), bookingRow("m-direct", "o-direct")];
    const sb = client({
      outgoing_email_queue: queue,
      orders: [{ id: "o-quote", company_id: "co-1", quote_id: "q-1" }, { id: "o-direct", company_id: "co-1", quote_id: null }],
    });
    const result = await drainEmailQueue(sb, ["co-1"], { transactionalOnly: true });
    expect(emailService.sendEmailDetailed).toHaveBeenCalledTimes(1);
    expect((emailService.sendEmailDetailed as jest.Mock).mock.calls[0][0].idempotencyKey).toBe("email-queue/m-direct");
    expect(queue[0].status).toBe("cancelled");
    expect((queue[0] as any).error_message).toMatch(/deposit invoice email is the only email/);
    expect(result.sent).toBe(1);
  });

  it("still sends when an admin releases that exact email by hand", async () => {
    const queue = [bookingRow("m-quote", "o-quote")];
    const sb = client({ outgoing_email_queue: queue, orders: [{ id: "o-quote", company_id: "co-1", quote_id: "q-1" }] });
    await drainEmailQueue(sb, ["co-1"], { queueIds: ["m-quote"] });
    expect(emailService.sendEmailDetailed).toHaveBeenCalledTimes(1);
  });
});
