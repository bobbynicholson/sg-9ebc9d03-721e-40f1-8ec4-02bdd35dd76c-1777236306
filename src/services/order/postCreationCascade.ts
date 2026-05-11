/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Server-safe post-order-creation cascade.
 *
 * The audit (May 2026) flagged that quoteService.convertQuoteToOrder
 * was the only path that fired the three side effects an order needs
 * once it lands: auto-invoice, confirmation email, kitchen prep
 * tasks. Every other entry point -- the new server-side leads
 * convert-to-order route, future webhook hooks, the imminent
 * checkout-on-payment flow -- silently dropped them.
 *
 * Pulling the cascade into one helper means:
 *   - Browser callers (quoteService) pass their existing supabase
 *     client and keep working unchanged.
 *   - Server callers (leads route, webhooks) inject a service-role
 *     client and an explicit `origin` so outbound email links resolve
 *     to the live host instead of failing on a relative URL fetch.
 *   - The receipt shape stays stable so the UI can keep rendering
 *     "invoice generated, email sent, kitchen notified" without
 *     refactoring.
 *
 * Idempotency:
 *   - Invoice: ensureInvoiceForOrder short-circuits on an existing
 *     invoices.order_id row, so a retry can't double-create.
 *   - Email: emailService.sendEmail logs every send to
 *     email_automation_log; duplicate sends are visible to the
 *     operator but not blocked at the data layer.
 *   - Kitchen prep: ensurePrepTasksForOrder now bails when the order
 *     already has any pending/in_progress task, preventing the
 *     soft-delete + re-insert double-fire that the original flow
 *     would produce on a retry.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureInvoiceForOrder } from "@/services/invoiceGenerationService";
import { kitchenPrepService } from "@/services/kitchenPrepService";
import { emailService } from "@/services/emailService";

export interface PostOrderCascadeOpts {
  /** Absolute base URL for outbound email links. Defaults to
   *  process.env.NEXT_PUBLIC_SITE_URL when nothing is passed. Server
   *  callers should pass req-derived host so emails always resolve
   *  to the active environment, not a stale env var. */
  origin?: string;
  skipInvoice?: boolean;
  skipEmail?: boolean;
  skipKitchen?: boolean;
  skipEquipment?: boolean;
}

export interface PostOrderCascadeReceipt {
  invoice: { ok: boolean; invoiceId?: string; alreadyExisted?: boolean; skipped?: string; reason?: string };
  email: { ok: boolean; reason?: string; skipped?: boolean };
  kitchen: { ok: boolean; tasksCreated?: number; reason?: string };
  equipment: { ok: boolean; bookingsCreated?: number; reason?: string; skipped?: boolean };
}

/**
 * Run the three post-creation side effects for an order. Each step is
 * wrapped in its own try/catch and never throws: the receipt records
 * the outcome and the next step always runs.
 */
export async function postOrderCreationCascade(
  client: SupabaseClient,
  orderId: string,
  companyId: string,
  actorUserId: string | null,
  opts: PostOrderCascadeOpts = {},
): Promise<PostOrderCascadeReceipt> {
  const origin = opts.origin || process.env.NEXT_PUBLIC_SITE_URL || "";

  const receipt: PostOrderCascadeReceipt = {
    invoice: { ok: false, reason: "not_attempted" },
    email: { ok: false, skipped: true, reason: "not_attempted" },
    kitchen: { ok: false, tasksCreated: 0, reason: "not_attempted" },
    equipment: { ok: false, bookingsCreated: 0, reason: "not_attempted" },
  };

  // ── Step 1: Invoice ───────────────────────────────────────────────
  if (!opts.skipInvoice) {
    try {
      const inv = await ensureInvoiceForOrder(orderId, companyId, client as any, { origin });
      if (inv.success) {
        if (inv.skipped) {
          receipt.invoice = { ok: true, skipped: inv.skipped };
        } else {
          receipt.invoice = {
            ok: true,
            invoiceId: inv.invoiceId,
            alreadyExisted: inv.alreadyExisted ?? false,
          };
        }
      } else {
        receipt.invoice = { ok: false, reason: inv.error || "invoice generation returned failure" };
        console.warn("[postOrderCreationCascade] invoice step failed:", {
          orderId,
          companyId,
          reason: receipt.invoice.reason,
        });
      }
    } catch (e: any) {
      receipt.invoice = { ok: false, reason: e?.message || "invoice step crashed" };
      console.warn("[postOrderCreationCascade] invoice step crashed:", { orderId, companyId, error: e });
    }
  } else {
    receipt.invoice = { ok: true, reason: "skipped_by_caller" };
  }

  // ── Step 2: Confirmation email ────────────────────────────────────
  if (!opts.skipEmail) {
    try {
      // Pull the order + recipient details using the injected client
      // so this works under either RLS or service-role auth.
      const { data: order } = await (client as any)
        .from("orders")
        .select("id, order_number, client_email, client_name, event_date, currency, total_amount, company_id")
        .eq("id", orderId)
        .maybeSingle();

      if (!order) {
        receipt.email = { ok: false, skipped: true, reason: "order_not_found" };
      } else if (!(order as any).client_email) {
        receipt.email = { ok: false, skipped: true, reason: "no_client_email" };
      } else {
        const { data: companyRow } = await (client as any)
          .from("companies")
          .select("company_name")
          .eq("id", companyId)
          .maybeSingle();
        const companyName = (companyRow as any)?.company_name || "Your Catering Company";
        const totalAmount = `${(order as any).currency || "ZAR"} ${Number((order as any).total_amount || 0).toFixed(2)}`;
        const eventDate = (order as any).event_date
          ? new Date((order as any).event_date).toLocaleDateString()
          : "TBD";

        const ok = await emailService.sendEmail({
          companyId,
          to: (order as any).client_email,
          subject: `Order Confirmed - #${(order as any).order_number || orderId}`,
          // Template type aligns with the seed [P0-14]. Was
          // "order-confirmation" which has no row in email_templates.
          template: "order_confirmed",
          orderId,
          variables: {
            clientName: (order as any).client_name,
            orderNumber: (order as any).order_number || orderId,
            eventDate,
            totalAmount,
            companyName,
          },
          // Forward the injected client so the gates + audit logging
          // happen under the same auth context as the rest of the
          // cascade.
          _client: client,
        } as any);
        receipt.email = ok ? { ok: true, skipped: false } : { ok: false, skipped: false, reason: "send_failed" };
        if (!ok) {
          console.warn("[postOrderCreationCascade] email send returned false:", { orderId, companyId });
        }
      }
    } catch (e: any) {
      receipt.email = { ok: false, skipped: false, reason: e?.message || "email step crashed" };
      console.warn("[postOrderCreationCascade] email step crashed:", { orderId, companyId, error: e });
    }
  } else {
    receipt.email = { ok: true, skipped: true, reason: "skipped_by_caller" };
  }

  // ── Step 3: Kitchen prep ──────────────────────────────────────────
  if (!opts.skipKitchen) {
    try {
      const result = await kitchenPrepService.ensurePrepTasksForOrder(
        companyId,
        orderId,
        actorUserId || undefined,
        client as any,
      );
      receipt.kitchen = { ok: true, tasksCreated: result.created };
    } catch (e: any) {
      receipt.kitchen = { ok: false, tasksCreated: 0, reason: e?.message || "kitchen step crashed" };
      console.warn("[postOrderCreationCascade] kitchen step crashed:", { orderId, companyId, error: e });
    }
  } else {
    receipt.kitchen = { ok: true, tasksCreated: 0, reason: "skipped_by_caller" };
  }

  // ── Step 4: Equipment bookings ────────────────────────────────────
  // Audit Equipment G1: every convert-to-order path was leaving
  // quote.equipment_items as a JSONB blob on the quote and never
  // inserting equipment_bookings rows. Operators were manually
  // re-adding each equipment line on each order, and any line they
  // forgot vanished from the availability calculator -- double-
  // bookings, missing hire-ins, blind cleaning queue.
  //
  // Walk the quote's equipment_items, insert one row per item with
  // quantity > 0 and a resolved equipment_id. Idempotent: skip when
  // a row already exists for (order_id, equipment_id) so a retry
  // can't duplicate.
  //
  // booked_from / booked_until default to (event_date - 1 day) and
  // (event_date + 1 day) to give the cleaning + return window some
  // breathing room. The availability calc treats this as the
  // overlap window. Phase 2 will pad by equipment.cleaning_time_hours.
  if (!opts.skipEquipment) {
    try {
      const { data: order } = await (client as any)
        .from("orders")
        .select("id, quote_id, event_date, company_id")
        .eq("id", orderId)
        .maybeSingle();
      if (!order) {
        receipt.equipment = { ok: false, bookingsCreated: 0, reason: "order_not_found" };
      } else if (!(order as any).quote_id) {
        receipt.equipment = { ok: true, bookingsCreated: 0, reason: "no_source_quote" };
      } else {
        const { data: quote } = await (client as any)
          .from("quotes")
          .select("equipment_items")
          .eq("id", (order as any).quote_id)
          .maybeSingle();
        const raw = (quote as any)?.equipment_items;
        const items: any[] = Array.isArray(raw)
          ? raw
          : typeof raw === "string"
            ? (() => { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; } })()
            : [];

        if (items.length === 0) {
          receipt.equipment = { ok: true, bookingsCreated: 0, reason: "no_equipment_on_quote" };
        } else {
          const eventDate = (order as any).event_date;
          const eventTs = eventDate ? new Date(eventDate).getTime() : Date.now();
          const oneDayMs = 24 * 60 * 60 * 1000;
          const bookedFrom = new Date(eventTs - oneDayMs).toISOString();
          const bookedUntil = new Date(eventTs + oneDayMs).toISOString();

          // Idempotency: pull existing bookings for this order first
          // so we don't re-insert on retry.
          const { data: existing } = await (client as any)
            .from("equipment_bookings")
            .select("equipment_id")
            .eq("order_id", orderId);
          const taken = new Set((existing || []).map((b: any) => b.equipment_id));

          const rows = items
            .map((it: any) => {
              const equipmentId = it.id || it.equipment_id || null;
              const quantity = Number(it.quantity || 0);
              if (!equipmentId || quantity <= 0 || taken.has(equipmentId)) return null;
              return {
                company_id: (order as any).company_id || companyId,
                order_id: orderId,
                equipment_id: equipmentId,
                quantity,
                status: "booked",
                booked_from: it.booked_from || bookedFrom,
                booked_until: it.booked_until || bookedUntil,
              };
            })
            .filter(Boolean);

          if (rows.length === 0) {
            receipt.equipment = { ok: true, bookingsCreated: 0, reason: "all_idempotent_or_invalid" };
          } else {
            const { error: insErr } = await (client as any)
              .from("equipment_bookings")
              .insert(rows);
            if (insErr) {
              receipt.equipment = {
                ok: false,
                bookingsCreated: 0,
                reason: insErr.message || "equipment_bookings insert failed",
              };
              console.warn("[postOrderCreationCascade] equipment step failed:", {
                orderId, companyId, error: insErr,
              });
            } else {
              receipt.equipment = { ok: true, bookingsCreated: rows.length };
            }
          }
        }
      }
    } catch (e: any) {
      receipt.equipment = { ok: false, bookingsCreated: 0, reason: e?.message || "equipment step crashed" };
      console.warn("[postOrderCreationCascade] equipment step crashed:", { orderId, companyId, error: e });
    }
  } else {
    receipt.equipment = { ok: true, bookingsCreated: 0, skipped: true, reason: "skipped_by_caller" };
  }

  return receipt;
}
