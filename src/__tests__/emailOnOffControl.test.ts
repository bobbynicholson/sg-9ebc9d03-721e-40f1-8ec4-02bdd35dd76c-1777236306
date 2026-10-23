/** @jest-environment node */
import {
  AUTOMATED_EMAIL_TEMPLATES,
  isApprovalControllable,
  resolveEmailDeliveryMode,
} from "@/lib/email/automatedEmailTemplates";
import { deliverAutomatedEmail, deliveryKey, skipIfTurnedOff } from "@/lib/email/automatedDelivery";
import { drainEmailQueue } from "@/lib/email/drainQueue";
import { emailService } from "@/services/emailService";

jest.mock("@/services/emailService", () => ({ emailService: { sendEmailDetailed: jest.fn() } }));

/** Minimal Supabase stand-in: settings row + queue table. */
function fakeDb(preferences: Record<string, unknown>, queue: any[] = []) {
  const db: any = {
    from: jest.fn((table: string) => {
      const filters: Array<(r: any) => boolean> = [];
      let patch: any = null;
      const q: any = {};
      q.select = () => q;
      q.neq = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.or = () => q;
      q.lt = (k: string, v: number) => { filters.push((r) => r[k] < v); return q; };
      q.eq = (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; };
      q.in = (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return q; };
      q.update = (v: any) => { patch = v; return q; };
      const run = (single: boolean) => {
        if (table === "email_provider_settings") return { data: { automation_preferences: preferences }, error: null };
        const rows = queue.filter((r) => filters.every((f) => f(r)));
        if (patch) rows.forEach((r) => Object.assign(r, patch));
        const data = rows.map((r) => ({ ...r }));
        return { data: single ? data[0] || null : data, error: null };
      };
      q.maybeSingle = async () => run(true);
      q.single = async () => run(true);
      q.then = (resolve: any, reject: any) => Promise.resolve(run(false)).then(resolve, reject);
      return q;
    }),
  };
  return db;
}

describe("which emails the on/off setting covers", () => {
  it("covers every automatic email under the exact key the code sends", () => {
    for (const key of [
      "order_confirmed", "order_delivered", "deposit_payment_received", "balance_payment_received",
      "deposit_invoice_issued", "event_one_week_reminder", "aftersales_after-sales-1", "balance_reminder_email",
      "deposit_reminder", "quote_request_received", "kitchen_pre_event_reminder", "collection_en_route",
      "collection_arrived", "collection_complete", "payment_failed", "equipment_damage_charge",
      "stale_shopping_list_digest", "invoices_overdue_admin_digest",
      "quote_price_updated",
    ]) expect(isApprovalControllable(key)).toBe(true);
    // Booking confirmation queued by the database on every new order.
    expect(isApprovalControllable("order.created")).toBe(true);
    expect(resolveEmailDeliveryMode({ queue_delivery_mode: "off" }, "order.created")).toBe("off");
    // Backup of a manual Send quote: always sent, even when everything is off.
    expect(isApprovalControllable("quote.sent")).toBe(false);
    expect(resolveEmailDeliveryMode({ queue_delivery_mode: "off" }, "quote.sent")).toBe("automatic");
    // Sign-in and invitations are always sent.
    expect(isApprovalControllable("client_magic_link")).toBe(false);
    expect(isApprovalControllable("staff_invitation")).toBe(false);
    // Never emailed (in-app notification only), so not listed.
    expect(AUTOMATED_EMAIL_TEMPLATES.some((t) => t.key === "quote_accepted_client")).toBe(false);
    expect(AUTOMATED_EMAIL_TEMPLATES.some((t) => t.key === "stale_shopping_list_alert")).toBe(false);
  });

  it("covers emails that resolve their wording first (automationKey)", () => {
    for (const key of [
      "order_change_request_received", "cancellation_request_received",
      "quote_declined_client", "event_tomorrow_admin_email", "event_tomorrow_kitchen_email",
      "event_shopping_lead_email", "embed_lead_thank_you_client", "embed_lead_admin_email",
      "cancellation_approved", "refund_paid", "postponement_approved", "order_changed", "order_change_rejected",
    ]) expect(isApprovalControllable(key)).toBe(true);
    // automationKey wins over a generic template such as "transactional".
    expect(deliveryKey({ template: "transactional", automationKey: "order_change_request_received" })).toBe("order_change_request_received");
    expect(deliveryKey({ automationKey: "quote_declined_client" })).toBe("quote_declined_client");
  });

  it("a status email sent with only automationKey is skipped when that email is off", async () => {
    const off = fakeDb({ template_delivery_modes: { order_delivered: "off" } });
    expect(await skipIfTurnedOff(off, { companyId: "c1", to: "x@y.z", subject: "s", automationKey: "order_delivered" } as any))
      .toMatchObject({ skippedBySettings: true });
  });

  it("finds the real email type when a job also passes a generic template", () => {
    expect(deliveryKey({ template: "transactional", templateType: "invoices_overdue_admin_digest" })).toBe("invoices_overdue_admin_digest");
    expect(deliveryKey({ template: "order_confirmed" })).toBe("order_confirmed");
  });

  it("uses the email's own setting first, then the company switch", () => {
    const companyOff = { queue_delivery_mode: "off", template_delivery_modes: { order_confirmed: "automatic" } };
    expect(resolveEmailDeliveryMode(companyOff, "order_confirmed")).toBe("automatic");
    expect(resolveEmailDeliveryMode(companyOff, "order_delivered")).toBe("off");
    const companyOn = { template_delivery_modes: { refund_paid: "off" } };
    expect(resolveEmailDeliveryMode(companyOn, "refund_paid")).toBe("off");
    expect(resolveEmailDeliveryMode(companyOn, "order_confirmed")).toBe("automatic");
    expect(resolveEmailDeliveryMode(companyOff, "client_magic_link")).toBe("automatic");
    expect(resolveEmailDeliveryMode({}, "order_confirmed")).toBe("automatic");
    // Value saved by the earlier approval build also means off.
    expect(resolveEmailDeliveryMode({ queue_delivery_mode: "manual_review" }, "order_ready")).toBe("off");
  });
});

describe("event emails", () => {
  const payload = { companyId: "c1", to: "client@example.com", subject: "Order confirmed", body: "Hi", template: "order_confirmed", orderId: "o1" };

  it("are not sent when turned off", async () => {
    const result = await skipIfTurnedOff(fakeDb({ template_delivery_modes: { order_confirmed: "off" } }), payload as any);
    expect(result).toMatchObject({ success: true, skippedBySettings: true });
  });

  it("are sent when automatic", async () => {
    expect(await skipIfTurnedOff(fakeDb({}), payload as any)).toBeNull();
  });

  it("sign-in links are sent even when everything is off", async () => {
    const db = fakeDb({ queue_delivery_mode: "off" });
    expect(await skipIfTurnedOff(db, { ...payload, template: "client_magic_link" } as any)).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe("scheduled jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (emailService.sendEmailDetailed as jest.Mock).mockResolvedValue({ success: true });
  });

  it("a turned-off payment reminder is not sent and not reported as an error", async () => {
    const result = await deliverAutomatedEmail(fakeDb({ template_delivery_modes: { balance_reminder_email: "off" } }), {
      companyId: "c1", to: "client@example.com", subject: "Balance", body: "Hi",
      template: "balance_reminder_email", triggerEvent: "payment.balance_reminder",
    } as any);
    expect(result).toMatchObject({ success: true, skippedBySettings: true });
    expect(emailService.sendEmailDetailed).not.toHaveBeenCalled();
  });

  it("an automatic one is sent once, without a second settings check", async () => {
    await deliverAutomatedEmail(fakeDb({}), {
      companyId: "c1", to: "client@example.com", subject: "Balance", body: "Hi",
      template: "balance_reminder_email", triggerEvent: "payment.balance_reminder",
    } as any);
    expect(emailService.sendEmailDetailed).toHaveBeenCalledWith(expect.objectContaining({ _deliveryApproved: true }));
  });
});

describe("scheduled queue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (emailService.sendEmailDetailed as jest.Mock).mockResolvedValue({ success: true });
  });
  const row = {
    id: "q1", company_id: "c1", to_email: "client@example.com", subject: "One week to go", body: "Hi",
    trigger_event: "kitchen_pre_event", trigger_ref_id: "o1", attempts: 0, status: "queued",
    template_type: "event_one_week_reminder", variables: { first_name: "Sam" },
  };

  it("cancels a due email that is turned off, without sending it", async () => {
    const rows = [{ ...row }];
    const prefs = new Map<string, unknown>([["c1", { template_delivery_modes: { event_one_week_reminder: "off" } }]]);
    const result = await drainEmailQueue(fakeDb({}, rows), ["c1"], { transactionalOnly: true, deliveryPreferences: prefs });
    expect(result).toMatchObject({ processed: 0, sent: 0, turnedOff: 1 });
    expect(rows[0]).toMatchObject({ status: "cancelled", error_message: "Not sent: turned off in Email settings" });
    expect(emailService.sendEmailDetailed).not.toHaveBeenCalled();
  });

  it("sends an automatic email as before", async () => {
    const rows = [{ ...row }];
    const result = await drainEmailQueue(fakeDb({}, rows), ["c1"], { transactionalOnly: true, deliveryPreferences: new Map() });
    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(rows[0].status).toBe("sent");
  });
});
