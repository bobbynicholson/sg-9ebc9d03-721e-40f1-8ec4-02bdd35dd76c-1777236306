/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Server-safe post-order-creation cascade.
 *
 * The audit (May 2026) flagged that quoteService.convertQuoteToOrder
 * was the only path that fired the three side effects an order needs
 * once it lands: auto-invoice, confirmation email, kitchen prep
 * tasks. Every other entry point - the new server-side leads
 * convert-to-order route, future webhook hooks, the imminent
 * checkout-on-payment flow - silently dropped them.
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
import { randomBytes } from "crypto";
import { ensureInvoiceForOrder } from "@/services/invoiceGenerationService";
import { kitchenPrepService } from "@/services/kitchenPrepService";
import { emailService } from "@/services/emailService";
import { getEquipmentAvailability } from "@/services/equipmentAvailabilityService";
import { notificationService } from "@/services/notificationService";

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
  skipConflictCheck?: boolean;
  skipShoppingSuggestion?: boolean;
  /** REG-D (regions follow-ups): opt out of the branch-driven driver
   *  auto-assignment step. The smoke-test runner and manual operator
   *  flows that want to pick a driver themselves should pass true. */
  skipAutoAssign?: boolean;
  /** TIGHTEN I.24: opt out of the cleaning-handover anticipation row
   *  Wave 70.24 added. Default off (handover IS created). Smoke tests
   *  + flows that don't need the cleaning portal pre-warmed pass true. */
  skipCleaning?: boolean;
  /** FIX (2026-06-12): true when the operator recorded the deposit as
   *  already paid at convert time. When FALSE and a deposit invoice
   *  was just issued, the "order confirmed" email is suppressed - the
   *  client otherwise received two simultaneous emails telling
   *  conflicting stories ("your order is confirmed" vs "pay the
   *  deposit to lock in your date"). The deposit-invoice email owns
   *  the moment; confirmation language belongs after money lands. */
  depositSettled?: boolean;
}

export interface PostOrderCascadeReceipt {
  invoice: { ok: boolean; invoiceId?: string; alreadyExisted?: boolean; skipped?: string; reason?: string };
  email: { ok: boolean; reason?: string; skipped?: boolean };
  kitchen: { ok: boolean; tasksCreated?: number; reason?: string };
  equipment: { ok: boolean; bookingsCreated?: number; reason?: string; skipped?: boolean };
  conflicts: { ok: boolean; shortfalls?: number; reason?: string; skipped?: boolean };
  shopping: { ok: boolean; shortfalls?: number; reason?: string; skipped?: boolean };
  // Wave 67 Phase E - outsource provider auto-assignment step.
  // Fires for every order_items line whose menu_item is fulfilment_type
  // 'outsourced' or 'hybrid' with a default_outsource_provider_id set.
  outsource?: { ok: boolean; assignmentsCreated?: number; reason?: string; skipped?: boolean };
  // REG-D (regions follow-ups): branch-driven driver auto-assignment.
  // Fires when the order's region has auto_assign_orders=true AND the
  // order is at status='confirmed'. Delegates to
  // dispatchService.assignDriverWithGate so every safety gate (capacity,
  // time-conflict, cold-chain, vehicle availability) is honoured.
  autoAssign?: {
    ok: boolean;
    driverId?: string | null;
    driverName?: string | null;
    score?: number;
    skipped?: boolean;
    reason?: string;
  };
  // TIGHTEN I.24: cleaning_event_handover row created in 'expected'
  // status so the cleaning portal gets the Wave 70.24 anticipation
  // feature for orders born confirmed via the quote-accept RPC. Before
  // this, only orders that hit updateOrderStatus(...,'confirmed') got
  // the row; the canonical convert_quote_to_order path skipped it and
  // cleaning teams only saw the order at delivered-time (markHandoverReturned
  // back-fills as a defence).
  cleaning?: {
    ok: boolean;
    handoverId?: string;
    skipped?: boolean;
    reason?: string;
  };
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
    conflicts: { ok: false, shortfalls: 0, reason: "not_attempted" },
    shopping: { ok: false, shortfalls: 0, reason: "not_attempted" },
  };

  // ── Step 0: Line items ────────────────────────────────────────────
  // Audit (May 2026, Wave 3): convertQuoteToOrder writes the order
  // row without menu_items / equipment_items columns (they live on
  // quotes only), and never populated order_items from the source
  // quote. Result: every accepted quote became an order with zero
  // line items - the invoice was R0.00, kitchen had no prep list,
  // dispatch saw nothing to load. Wire it here so every cascade
  // entry point (quote accept, leads convert, future webhooks) gets
  // the same back-fill before the invoice step reads order_items.
  //
  // Idempotent: skip when the order already has any rows.
  try {
    const { data: order0 } = await (client as any)
      .from("orders")
      .select("quote_id")
      .eq("id", orderId)
      .is("deleted_at", null)
      .maybeSingle();
    if (order0?.quote_id) {
      const { data: existing0 } = await (client as any)
        .from("order_items")
        .select("id")
        .eq("order_id", orderId)
        .limit(1);
      if (!existing0 || existing0.length === 0) {
        const { data: quote0 } = await (client as any)
          .from("quotes")
          .select("menu_items, guest_count")
          .eq("id", order0.quote_id)
          .maybeSingle();
        const raw = (quote0 as any)?.menu_items;
        const items: any[] = Array.isArray(raw)
          ? raw
          : typeof raw === "string"
            ? (() => { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; } })()
            : [];
        const guestCount = Number((quote0 as any)?.guest_count || 0);

        // PR-B (cashflow cost mapping): snapshot menu_items.cost_per_unit
        // onto order_items.unit_cost at this conversion moment. One
        // batch fetch for every menu_item_id referenced in the quote;
        // the cost is then attached to the corresponding insert row.
        // Rows where menu_item_id is null (free-text quote lines) or
        // where the menu item has no cost set stay NULL on unit_cost.
        const menuItemIds = Array.from(
          new Set(
            (items as any[])
              .map((it) => it.menu_item_id)
              .filter((x): x is string => typeof x === "string" && x.length > 0),
          ),
        );
        const costById = new Map<string, number>();
        if (menuItemIds.length > 0) {
          try {
            const { data: menuRows } = await (client as any)
              .from("menu_items")
              .select("id, cost_per_unit")
              .in("id", menuItemIds);
            for (const m of (menuRows || []) as any[]) {
              const c = Number(m?.cost_per_unit);
              if (Number.isFinite(c) && c > 0) costById.set(m.id, c);
            }
          } catch (e) {
            console.warn("[postOrderCreationCascade] menu_items cost lookup failed:", { orderId, error: e });
          }
        }

        const rows = items
          .map((it: any) => {
            const name = it.item_name || it.name || "";
            if (!name) return null;
            const mode = String(it.pricing_mode || it.pricingMode || "per_person");
            const baseQty = Number(it.quantity || 0);
            const qty = mode === "per_person"
              ? (baseQty > 0 ? baseQty : guestCount)
              : (mode === "flat" ? 1 : baseQty);
            const unit = Number(it.unit_price ?? it.unitPrice ?? it.pricePerPerson ?? 0);
            const lineTotal = Number(it.line_total ?? (qty * unit));
            const menuItemId = it.menu_item_id || null;
            const unitCost = menuItemId && costById.has(menuItemId)
              ? costById.get(menuItemId)!
              : null;
            return {
              order_id: orderId,
              menu_item_id: menuItemId,
              item_name: name,
              description: it.category || it.dietary_tags?.join?.(", ") || null,
              quantity: qty,
              unit_price: unit,
              unit_cost: unitCost,
              line_total: lineTotal,
            };
          })
          .filter(Boolean);
        if (rows.length > 0) {
          const { error: insErr } = await (client as any)
            .from("order_items")
            .insert(rows);
          if (insErr) {
            console.warn("[postOrderCreationCascade] order_items insert failed:", { orderId, error: insErr });
          }
        }
      }
    }
  } catch (e: any) {
    console.warn("[postOrderCreationCascade] order_items step crashed:", { orderId, error: e });
  }

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
      const { data: order, error: orderErr } = await (client as any)
        .from("orders")
        .select("id, order_number, client_email, client_name, event_name, event_date, currency, total_amount, company_id")
        .eq("id", orderId)
        .is("deleted_at", null)
        .maybeSingle();
      if (orderErr) {
        console.error("[order/postCreationCascade] orders fetch failed:", orderErr);
      }

      if (!order) {
        receipt.email = { ok: false, skipped: true, reason: "order_not_found" };
      } else if (!(order as any).client_email) {
        receipt.email = { ok: false, skipped: true, reason: "no_client_email" };
      } else if (!opts.depositSettled && receipt.invoice.ok && receipt.invoice.invoiceId) {
        // On quote acceptance, the deposit invoice email is the single
        // client-facing confirmation. Sending order_confirmed as well
        // creates duplicate "you're booked" emails seconds apart.
        receipt.email = { ok: true, skipped: true, reason: "deposit_invoice_email_owns_acceptance" };
      } else if (await _orderConfirmedAlreadySentRecently(client, orderId)) {
        // Wave 48 A6 - dedup against the status-flip path. When an
        // order is created already at status='confirmed' (the quote
        // accept flow) the cascade's email here AND the status-flip
        // sendStatusNotifications path BOTH fire `order_confirmed`
        // within seconds. The 5-min in-app dedup catches the second
        // push but the email branch had no gate for the cascade-time
        // fire. Probe email_automation_log: if any prior
        // order_confirmed row exists for this order in the last 5
        // minutes, skip and let the other path own it.
        receipt.email = { ok: true, skipped: true, reason: "deduped_recent_send" };
      } else {
        const { data: companyRow, error: companyRowErr } = await (client as any)
          .from("companies")
          .select("company_name")
          .eq("id", companyId)
          .maybeSingle();
        if (companyRowErr) {
          console.error("[order/postCreationCascade] companies fetch failed:", companyRowErr);
        }
        const companyName = (companyRow as any)?.company_name || "Your Catering Company";
        const totalAmount = `${(order as any).currency || "ZAR"} ${Number((order as any).total_amount || 0).toFixed(2)}`;
        const eventDate = (order as any).event_date
          ? new Date((order as any).event_date).toLocaleDateString()
          : "TBD";

        // Phase 6 #5: invoice link in the confirmation email. The
        // cascade just created an invoice (Step 1) and we have the
        // id from the receipt - pull the public_token so the
        // client gets a one-click 'view invoice' deeplink instead
        // of having to ask the operator for it. Best-effort; the
        // email still goes if the lookup fails.
        let invoiceLink: string | null = null;
        if (receipt.invoice.ok && receipt.invoice.invoiceId) {
          try {
            const { data: invRow } = await (client as any)
              .from("invoices")
              .select("public_token")
              .eq("id", receipt.invoice.invoiceId)
              .is("deleted_at", null)
              .maybeSingle();
            const token = (invRow as any)?.public_token;
            if (token && origin) {
              invoiceLink = `${origin.replace(/\/$/, "")}/pay/i/${token}`;
            }
          } catch (linkErr) {
            console.warn("[postOrderCreationCascade] invoice link lookup failed:", linkErr);
          }
        }

        // Wave 13 audit: this used to call sendEmail (boolean wrapper)
        // and store the generic "send_failed" reason, throwing away
        // the structured diagnosis. Switch to sendEmailDetailed so the
        // operator sees the real cause - "Resend domain not verified",
        // "from_email_domain_mismatch", "blocked_recipient" etc. --
        // in the accept-on-behalf toast and the email-failures dashboard.
        // Wave 23.5: subject-line tone polish. "Order Confirmed -
        // #ORD-003827" reads templated; the operator's own copy
        // would say "Your {event} booking is confirmed - {company}".
        // Build a more personable line that still surfaces the order
        // number for inbox search.
        const orderNumberLabel = (order as any).order_number || orderId;
        const eventNameForSubject = (order as any).event_name || "your event";

        // FIX (2026-06-12): the seeded order_confirmed template (I.114)
        // and tenant overrides speak snake_case - {{first_name}},
        // {{order_number}}, {{event_date_phrase}}, {{order_url}},
        // {{tenant_name}}. This send passed a camelCase-only bag, so
        // clients received the raw placeholders verbatim. Mirror the
        // variable set sendStatusNotifications builds (orderWorkflow
        // ~L1927), including the minted tokenised order link, and keep
        // the legacy camelCase keys for older tenant overrides.
        const clientFirstName =
          String((order as any).client_name || "").trim().split(/\s+/)[0] || "there";
        const eventDateLabel = (order as any).event_date
          ? new Date((order as any).event_date).toLocaleDateString("en-ZA", {
              day: "numeric", month: "long", year: "numeric",
            })
          : "";
        let orderUrl = "";
        try {
          const { mintOrderCustomerLink } = await import("@/lib/customerLinksServer");
          orderUrl = await mintOrderCustomerLink({
            sb: client,
            companyId,
            orderId,
            label: "order-confirmed-email",
            origin: origin || null,
          });
        } catch (mintErr) {
          console.warn("[postOrderCreationCascade] order link mint failed:", mintErr);
        }

        const detailed = await (emailService as any).sendEmailDetailed({
          companyId,
          to: (order as any).client_email,
          subject: `${eventNameForSubject} confirmed - ${companyName} (${orderNumberLabel})`,
          // Template type aligns with the seed [P0-14]. Was
          // "order-confirmation" which has no row in email_templates.
          template: "order_confirmed",
          orderId,
          variables: {
            first_name: clientFirstName,
            client_first_name: clientFirstName,
            client_name: (order as any).client_name || "",
            order_number: orderNumberLabel,
            event_name: eventNameForSubject,
            tenant_name: companyName,
            company_name: companyName,
            event_date: eventDateLabel || "TBD",
            event_date_label: eventDateLabel,
            event_date_phrase: eventDateLabel ? ` for ${eventDateLabel}` : "",
            order_url: orderUrl,
            total: totalAmount,
            total_amount: totalAmount,
            // Phase 6 #5: surface the invoice link as a template
            // variable. Tenant-customised templates can drop
            // {{invoice_link}} wherever; the default body picks it
            // up at render time without any tenant action.
            invoice_link: invoiceLink || "",
            invoice_url: invoiceLink || "",
            payment_link: invoiceLink || "",
            payment_url: invoiceLink || "",
            // Legacy camelCase keys retained for tenant overrides
            // written against the old bag.
            clientName: (order as any).client_name,
            orderNumber: orderNumberLabel,
            eventDate,
            totalAmount,
            companyName,
            invoiceLink: invoiceLink || "",
            paymentLink: invoiceLink || "",
          },
          // Forward the injected client so the gates + audit logging
          // happen under the same auth context as the rest of the
          // cascade.
          _client: client,
        });
        if (detailed?.success) {
          receipt.email = { ok: true, skipped: false };
        } else {
          // Wave 51 C1 - prefer the human-readable `error` string over
          // the machine-code `error_code`. Pre-Wave-51 the order was
          // reversed, so when emailService returned `error_code: "unknown"`
          // (its catch-all branches at lines 468, 702, 724) the toast
          // surfaced the literal "unknown" instead of the actual reason.
          // Operators saw "Email did NOT send. unknown." with no clue
          // what to fix. Now: error first (the sentence), error_code
          // second (the machine slug), and only if BOTH are missing do
          // we fall back to "send_failed".
          const reason = detailed?.error
            || (detailed?.error_code && detailed.error_code !== "unknown" ? detailed.error_code : null)
            || "send_failed";
          receipt.email = { ok: false, skipped: false, reason };
          console.warn("[postOrderCreationCascade] email send failed:", {
            orderId,
            companyId,
            error_code: detailed?.error_code,
            error: detailed?.error,
          });
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
  // forgot vanished from the availability calculator - double-
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
      const { data: order, error: orderErr2 } = await (client as any)
        .from("orders")
        .select("id, quote_id, event_date, company_id")
        .eq("id", orderId)
        .is("deleted_at", null)
        .maybeSingle();
      if (orderErr2) {
        console.error("[order/postCreationCascade] orders fetch failed:", orderErr2);
      }
      if (!order) {
        receipt.equipment = { ok: false, bookingsCreated: 0, reason: "order_not_found" };
      } else if (!(order as any).quote_id) {
        receipt.equipment = { ok: true, bookingsCreated: 0, reason: "no_source_quote" };
      } else {
        const { data: quote, error: quoteErr } = await (client as any)
          .from("quotes")
          .select("equipment_items")
          .eq("id", (order as any).quote_id)
          .is("deleted_at", null)
          .maybeSingle();
        if (quoteErr) {
          console.error("[order/postCreationCascade] quotes fetch failed:", quoteErr);
        }
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
          const { data: existing, error: existingErr } = await (client as any)
            .from("equipment_bookings")
            .select("equipment_id")
            .eq("order_id", orderId);
          if (existingErr) {
            console.error("[order/postCreationCascade] equipment_bookings fetch failed:", existingErr);
          }
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

  // ── Step 4.5: Outsource provider auto-assignment (Wave 67 Phase E) ──
  // For every order_items line whose menu_item is fulfilment_type
  // 'outsourced' or 'hybrid' AND has default_outsource_provider_id set,
  // mint an outsource_assignments row. Operator still needs to send
  // the request (mailto/wa.me from the panel) - this just removes the
  // "click Add provider for every spit braai" repetition.
  //
  // Idempotency: skip when an assignment already exists for the same
  // (order_id, provider_id, menu_item_id) triple so a retry doesn't
  // double-fire. Status starts as 'requested' with manually_marked
  // false. Cost comes from menu_items.outsource_unit_cost when set,
  // otherwise the provider's default_rate.
  try {
    // Pull every order_items row with its joined menu_item fulfilment
    // metadata. Cast to any - the joined select isn't in the
    // generated types yet.
    const { data: orderItemsRaw, error: oiErr } = await (client as any)
      .from("order_items")
      .select(`
        id, order_id, menu_item_id,
        menu_item:menu_item_id (
          id, item_name, fulfilment_type, default_outsource_provider_id,
          outsource_unit_cost, outsource_lead_hours
        )
      `)
      .eq("order_id", orderId);
    if (oiErr) {
      receipt.outsource = { ok: false, assignmentsCreated: 0, reason: oiErr.message };
    } else {
      const candidates = (orderItemsRaw || []).filter((row: any) => {
        const mi = row.menu_item;
        if (!mi) return false;
        if (mi.fulfilment_type !== "outsourced" && mi.fulfilment_type !== "hybrid") return false;
        if (!mi.default_outsource_provider_id) return false;
        return true;
      });

      if (candidates.length === 0) {
        receipt.outsource = { ok: true, assignmentsCreated: 0, reason: "no_outsourced_items_with_default_provider" };
      } else {
        // Resolve provider rate defaults so the assignment lands with a
        // sensible quoted_cost when the menu item doesn't override.
        const providerIds = Array.from(new Set(candidates.map((c: any) => c.menu_item.default_outsource_provider_id)));
        const { data: providers } = await (client as any)
          .from("outsource_providers")
          .select("id, default_rate, default_rate_type, default_currency")
          .in("id", providerIds);
        const providersById = new Map<string, any>();
        for (const p of (providers || [])) providersById.set(p.id, p);

        // Idempotency: pull existing assignments first so we skip dupes.
        const { data: existing } = await (client as any)
          .from("outsource_assignments")
          .select("provider_id, menu_item_id")
          .eq("order_id", orderId)
          .is("deleted_at", null);
        const existingKeys = new Set<string>(
          (existing || []).map((e: any) => `${e.provider_id}|${e.menu_item_id || ""}`),
        );

        // Order event_date + event_time used for the token expiry +
        // the required_on_site_at default.
        const { data: ordRow } = await (client as any)
          .from("orders")
          .select("event_date, event_time")
          .eq("id", orderId)
          .is("deleted_at", null)
          .maybeSingle();
        const eventIso = (ordRow as any)?.event_date as string | null;
        const eventTime = (ordRow as any)?.event_time as string | null;
        const requiredOnSiteAt = eventIso
          ? new Date(`${eventIso}T${(eventTime || "12:00").slice(0, 5)}:00`).toISOString()
          : null;
        const expiresAt = eventIso
          ? new Date(new Date(eventIso).getTime() + 24 * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        let created = 0;
        for (const row of candidates) {
          const mi = row.menu_item;
          const key = `${mi.default_outsource_provider_id}|${mi.id || ""}`;
          if (existingKeys.has(key)) continue;

          const provider = providersById.get(mi.default_outsource_provider_id) || {};
          const cost = mi.outsource_unit_cost != null
            ? Number(mi.outsource_unit_cost)
            : (provider.default_rate != null ? Number(provider.default_rate) : 0);
          if (!Number.isFinite(cost)) continue;

          // Crypto-safe token via Node's crypto. postCreationCascade
          // runs server-side only (leads + quote conversion routes,
          // never the browser supabase client) so the static import
          // at the top of this file is safe.
          const token = randomBytes(32).toString("hex");

          const { error: insErr } = await (client as any)
            .from("outsource_assignments")
            .insert({
              company_id: companyId,
              order_id: orderId,
              provider_id: mi.default_outsource_provider_id,
              order_item_id: row.id,
              menu_item_id: mi.id,
              service_description: `${mi.item_name || "Service"} for this booking`,
              required_on_site_at: requiredOnSiteAt,
              quoted_cost: Number(cost.toFixed(2)),
              cost_currency: provider.default_currency || "ZAR",
              rate_type: provider.default_rate_type || "per_event",
              accept_token: token,
              accept_token_expires_at: expiresAt,
              requested_by: actorUserId || null,
            });
          if (!insErr) created += 1;
          else console.warn("[postOrderCreationCascade] outsource auto-create failed:", insErr);
        }
        receipt.outsource = { ok: true, assignmentsCreated: created };
      }
    }
  } catch (e: any) {
    receipt.outsource = { ok: false, assignmentsCreated: 0, reason: e?.message || "outsource step crashed" };
    console.warn("[postOrderCreationCascade] outsource step crashed:", { orderId, companyId, error: e });
  }

  // ── Step 5: Equipment conflict check ─────────────────────────────
  // Audit Equipment G3: getEquipmentAvailability existed as a
  // service but was never invoked at order-create / confirm time,
  // so two events on the same date could both claim the same kit
  // with no warning until the truck was being loaded. Now: for each
  // equipment_booking just created on this order, ask the
  // availability calculator how many units are reserved against this
  // date and if the total exceeds owned stock, raise an in-app
  // notification to the admin so they can place a hire-in (or move
  // the booking). Non-blocking: shortfalls don't refuse the order,
  // just surface the problem loudly.
  if (!opts.skipConflictCheck) {
    try {
      const { data: order, error: orderErr3 } = await (client as any)
        .from("orders")
        .select("id, event_date, region_id")
        .eq("id", orderId)
        .maybeSingle();
      if (orderErr3) {
        console.error("[order/postCreationCascade] orders fetch failed:", orderErr3);
      }
      if (!order || !(order as any).event_date) {
        receipt.conflicts = { ok: true, shortfalls: 0, reason: "no_event_date" };
      } else {
        const { data: bookings, error: bookingsErr } = await (client as any)
          .from("equipment_bookings")
          .select("equipment_id, quantity, equipment:equipment_id(name)")
          .eq("order_id", orderId);
        if (bookingsErr) {
          console.error("[order/postCreationCascade] equipment_bookings fetch failed:", bookingsErr);
        }
        const bookingRows = (bookings || []) as any[];
        if (bookingRows.length === 0) {
          receipt.conflicts = { ok: true, shortfalls: 0, reason: "no_equipment_on_order" };
        } else {
          let shortfallCount = 0;
          const shortfallDetails: Array<{ name: string; reserved: number; owned: number; needed: number }> = [];
          for (const b of bookingRows) {
            if (!b.equipment_id) continue;
            try {
              const avail = await getEquipmentAvailability(
                companyId,
                b.equipment_id,
                (order as any).event_date,
                { excludeOrderId: orderId },
              );
              const needed = Number(b.quantity || 0);
              if (avail.reserved + needed > avail.owned) {
                shortfallCount += 1;
                shortfallDetails.push({
                  name: (Array.isArray(b.equipment) ? b.equipment[0] : b.equipment)?.name || "Unnamed equipment",
                  reserved: avail.reserved,
                  owned: avail.owned,
                  needed,
                });
              }
            } catch (calcErr) {
              console.warn("[postOrderCreationCascade] availability calc failed for item:", b.equipment_id, calcErr);
            }
          }

          if (shortfallCount > 0) {
            // Build a single condensed alert summarising every
            // shortfall on this order. The bell deep-links to the
            // order edit modal where the operator can place a hire-in.
            const summary = shortfallDetails
              .slice(0, 5)
              .map((d) => `${d.name} (need ${d.needed}, only ${Math.max(0, d.owned - d.reserved)} free)`)
              .join("; ");
            const more = shortfallDetails.length > 5 ? `, +${shortfallDetails.length - 5} more` : "";
            try {
              await notificationService.broadcastNotification(
                {
                  companyId,
                  regionId: (order as any).region_id || null,
                  targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
                  title: `Equipment shortfall on order`,
                  message: `Order needs hire-in for: ${summary}${more}. Place a hire-in or adjust booked equipment.`,
                  type: "equipment_shortfall",
                  priority: "high",
                  link: `/order/${orderId}?role=admin`,
                  relatedEntityType: "order",
                  relatedEntityId: orderId,
                },
                client as any,
              );
            } catch (notifErr) {
              console.warn("[postOrderCreationCascade] shortfall broadcast failed:", notifErr);
            }
          }
          receipt.conflicts = { ok: true, shortfalls: shortfallCount };
        }
      }
    } catch (e: any) {
      receipt.conflicts = { ok: false, shortfalls: 0, reason: e?.message || "conflict step crashed" };
      console.warn("[postOrderCreationCascade] conflict step crashed:", { orderId, companyId, error: e });
    }
  } else {
    receipt.conflicts = { ok: true, shortfalls: 0, skipped: true, reason: "skipped_by_caller" };
  }

  // ── Step 6: Shopping suggestion ──────────────────────────────────
  // Audit Inventory G2 + Shopping G1: when an order lands, projected
  // ingredient demand for the menu items + guest count can already
  // exceed on-hand stock. Today we only notice at deduction time
  // (when the order is delivered), which is too late - shopping
  // can't have driven to the supplier already. Now: run the same
  // previewInventoryDeduction the admin sees in the order editor,
  // and for every ingredient where needed > available, broadcast a
  // single condensed alert to shopping_staff with the deficit list.
  // Non-blocking: failures don't refuse the order, just log.
  if (!opts.skipShoppingSuggestion) {
    try {
      const { data: order, error: orderErr4 } = await (client as any)
        .from("orders")
        // Wave 66.9 trap: final_guest_count / number_of_guests don't
        // exist on orders - selecting them 400s the whole fetch and
        // the shopping suggestion never fires. guest_count alone.
        .select("id, guest_count, event_date, region_id, order_number")
        .eq("id", orderId)
        .maybeSingle();
      if (orderErr4) {
        console.error("[order/postCreationCascade] orders fetch failed:", orderErr4);
      }
      if (!order) {
        receipt.shopping = { ok: true, shortfalls: 0, reason: "order_not_found" };
      } else {
        // Flow audit Leg D P0-3: previously read orders.menu_items
        // which is a quote-only column. For leads-convert-to-order
        // and webhook-created paths the field is null/empty and the
        // shopping forecast silently no-op'd. Read from order_items
        // (back-filled by Step 0 from quote.menu_items).
        const { data: itemRows, error: itemRowsErr } = await (client as any)
          .from("order_items")
          .select("item_name, menu_item_id, quantity")
          .eq("order_id", orderId);
        if (itemRowsErr) {
          console.error("[order/postCreationCascade] order_items fetch failed:", itemRowsErr);
        }
        const menuItems = (itemRows || []).map((r: any) => ({
          name: r.item_name,
          menu_item_id: r.menu_item_id,
          // Ops audit 2026-06-15: was hardcoded to 1, so multi-unit lines
          // (e.g. 3 platters) under-forecast the shopping demand. The
          // select already pulls quantity - use it.
          quantity: Number(r.quantity) || 1,
        }));
        const guestCount = Number(
          (order as any).final_guest_count ||
            (order as any).guest_count ||
            (order as any).number_of_guests ||
            0,
        );
        if (menuItems.length === 0 || guestCount <= 0) {
          receipt.shopping = { ok: true, shortfalls: 0, reason: "no_menu_or_guests" };
        } else {
          const { previewInventoryDeduction } = await import("@/services/inventoryDeductionService");
          const preview = await previewInventoryDeduction(menuItems, guestCount, companyId);
          const shortItems = preview.items.filter((i) => !i.sufficient);
          if (shortItems.length > 0) {
            const summary = shortItems
              .slice(0, 6)
              .map((i) => {
                const deficit = Math.max(0, i.needed - i.available);
                return `${i.ingredient} (short ${deficit.toFixed(2)} ${i.unit})`;
              })
              .join("; ");
            const more = shortItems.length > 6 ? `, +${shortItems.length - 6} more` : "";
            const eventLine = (order as any).event_date
              ? ` for ${new Date((order as any).event_date).toLocaleDateString()}`
              : "";
            try {
              await notificationService.broadcastNotification(
                {
                  companyId,
                  regionId: (order as any).region_id || null,
                  targetRoles: ["shopping_staff" as any],
                  title: `Shopping needed for order #${(order as any).order_number || orderId.slice(-8)}`,
                  message: `Projected demand${eventLine} exceeds stock: ${summary}${more}.`,
                  type: "shopping_suggested",
                  priority: "normal",
                  link: `/team-portal/shopping/inventory?orderId=${orderId}`,
                  relatedEntityType: "order",
                  relatedEntityId: orderId,
                },
                client as any,
              );
            } catch (notifErr) {
              console.warn("[postOrderCreationCascade] shopping suggestion broadcast failed:", notifErr);
            }
          }
          receipt.shopping = { ok: true, shortfalls: shortItems.length };
        }
      }
    } catch (e: any) {
      receipt.shopping = { ok: false, shortfalls: 0, reason: e?.message || "shopping step crashed" };
      console.warn("[postOrderCreationCascade] shopping step crashed:", { orderId, companyId, error: e });
    }
  } else {
    receipt.shopping = { ok: true, shortfalls: 0, skipped: true, reason: "skipped_by_caller" };
  }

  // ── Step 7.5: Cleaning handover anticipation (TIGHTEN I.24) ───────
  // Wave 70.24 introduced cleaning_event_handovers so the cleaning
  // portal can show "Brown lunch returns at 14:00, expect 80 items"
  // instead of reacting once items physically arrive. The handover
  // is created on updateOrderStatus(_, "confirmed"), but the canonical
  // accept-quote path inserts via convert_quote_to_order RPC at
  // status='confirmed' directly without going through updateOrderStatus.
  // Result: every accepted-quote order skipped the anticipation row
  // and cleaning teams only saw it when the driver dropped equipment.
  //
  // Fix: call createExpectedHandover here. Idempotent (the upsert
  // hits unique constraint on company_id + order_id). Reads
  // equipment_bookings for the item count, so MUST run after Step 4.
  if (!opts.skipCleaning) {
    try {
      const { data: orderForCleaning, error: cleaningOrderErr } = await (client as any)
        .from("orders")
        .select("event_date, event_time, status")
        .eq("id", orderId)
        .is("deleted_at", null)
        .maybeSingle();
      if (cleaningOrderErr) {
        console.warn("[postOrderCreationCascade] orders fetch for cleaning failed:", cleaningOrderErr);
      }
      const o = orderForCleaning as any;
      if (!o) {
        receipt.cleaning = { ok: false, skipped: true, reason: "order_not_found" };
      } else if (o.status === "cancelled" || o.status === "completed") {
        // Defensive: cancel/complete races shouldn't fire a fresh
        // 'expected' row.
        receipt.cleaning = { ok: false, skipped: true, reason: "order_terminal" };
      } else {
        const { createExpectedHandover } = await import("@/services/cleaningHandoverService");
        const result = await createExpectedHandover(client as any, {
          companyId,
          orderId,
          eventDate: o.event_date || null,
          eventTime: o.event_time || null,
        });
        if (result.ok) {
          receipt.cleaning = { ok: true, handoverId: result.handoverId };
        } else {
          receipt.cleaning = { ok: false, reason: result.error || "createExpectedHandover failed" };
        }
      }
    } catch (e: any) {
      receipt.cleaning = { ok: false, reason: e?.message || "cleaning step crashed" };
      console.warn("[postOrderCreationCascade] cleaning step crashed:", { orderId, companyId, error: e });
    }
  } else {
    receipt.cleaning = { ok: true, skipped: true, reason: "skipped_by_caller" };
  }

  // Phase 3 #4: persist the receipt onto the order so the admin
  // detail panel can show what happened at order-creation time.
  // Non-blocking - a write failure here doesn't unwind anything;
  // the receipt object still returns to the caller.
  try {
    await (client as any)
      .from("orders")
      .update({
        cascade_receipt: receipt,
        cascade_receipt_at: new Date().toISOString(),
      } as any)
      .eq("id", orderId);
  } catch (persistErr) {
    console.warn("[postOrderCreationCascade] receipt persist failed (non-blocking):", persistErr);
  }

  // Wave 50 C14 - loud admin alert when the cascade detects an
  // admin-created order with no source quote. Audit (Specialist 4)
  // flagged this as silent: the order ships with no menu items, no
  // equipment_bookings, no kitchen_prep_tasks, R0 invoice, but the
  // admin only finds out when the kitchen tablet shows nothing or
  // the client never gets billed. Now broadcasts a high-priority
  // warning so the operator immediately sees "this order needs
  // line items + equipment added by hand".
  const cascadeBaileds: string[] = [];
  if ((receipt.equipment as any)?.reason === "no_source_quote") cascadeBaileds.push("equipment");
  if ((receipt.shopping as any)?.reason === "no_menu_or_guests") cascadeBaileds.push("shopping");
  if (cascadeBaileds.length > 0) {
    try {
      const { data: orderForAlert } = await (client as any)
        .from("orders")
        .select("order_number")
        .eq("id", orderId)
        .maybeSingle();
      const orderLabel = (orderForAlert as any)?.order_number || orderId;
      const { notificationService } = await import("../notificationService");
      void notificationService.broadcastNotification({
        companyId,
        type: "cascade_skipped_no_source",
        title: `Manual order ${orderLabel} - needs line items added by hand`,
        message: `No source quote on this order. The cascade skipped: ${cascadeBaileds.join(", ")}. Add the menu + equipment manually so the kitchen, dispatch, and invoice all show the right data.`,
        targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
        priority: "high",
        link: `/order/${orderId}?role=admin`,
        relatedEntityType: "order",
        relatedEntityId: orderId,
        dedup: true,
        dedupWindowMinutes: 60 * 24,
      }).catch((e) => {
        console.warn("[postOrderCreationCascade] cascade-skipped broadcast failed:", e);
      });
    } catch (alertErr) {
      console.warn("[postOrderCreationCascade] cascade-skipped alert crashed:", alertErr);
    }
  }

  // ── Step 7: branch-driven driver auto-assignment ─────────────────
  // REG-D (regions follow-ups): when the order's region has
  // auto_assign_orders=true AND the order is confirmed AND a driver
  // isn't already assigned, fire dispatchService.assignDriverWithGate
  // so every safety gate runs. Skipped silently for draft orders
  // (the operator hasn't committed yet) and for regions with the
  // flag off. Dynamic import to avoid circular dependency between
  // postCreationCascade and dispatchService.
  if (!opts.skipAutoAssign) {
    try {
      const { data: orderRow } = await (client as any)
        .from("orders")
        .select("id, status, region_id, assigned_driver_id, driver_id")
        .eq("id", orderId)
        .is("deleted_at", null)
        .maybeSingle();
      const ord = orderRow as any;
      if (!ord) {
        receipt.autoAssign = { ok: false, skipped: true, reason: "order_not_found" };
      } else if (ord.status !== "confirmed") {
        receipt.autoAssign = { ok: false, skipped: true, reason: "order_not_confirmed" };
      } else if (ord.assigned_driver_id || ord.driver_id) {
        receipt.autoAssign = { ok: false, skipped: true, reason: "driver_already_assigned" };
      } else if (!ord.region_id) {
        receipt.autoAssign = { ok: false, skipped: true, reason: "no_region_on_order" };
      } else {
        const { data: regionRow } = await (client as any)
          .from("regions")
          .select("auto_assign_orders, is_active")
          .eq("id", ord.region_id)
          .maybeSingle();
        const reg = regionRow as any;
        if (!reg || reg.is_active === false) {
          receipt.autoAssign = { ok: false, skipped: true, reason: "region_paused_or_missing" };
        } else if (reg.auto_assign_orders !== true) {
          receipt.autoAssign = { ok: false, skipped: true, reason: "branch_auto_assign_off" };
        } else {
          // Fetch the order detail the suggester needs.
          const { data: orderDetail } = await (client as any)
            .from("orders")
            .select("id, event_date, event_time, venue_lat, venue_lng, region_id, requires_refrigeration")
            .eq("id", orderId)
            .maybeSingle();
          const od = orderDetail as any;
          if (!od?.event_date) {
            receipt.autoAssign = { ok: false, skipped: true, reason: "missing_event_date" };
          } else {
            const { dispatchService } = await import("@/services/dispatchService");
            const suggestions = await dispatchService.suggestDriversForOrder(companyId, {
              id: orderId,
              event_date: od.event_date,
              event_time: od.event_time,
              venue_lat: od.venue_lat ?? null,
              venue_lng: od.venue_lng ?? null,
              region_id: od.region_id ?? null,
              requires_refrigeration: !!od.requires_refrigeration,
            }, 1);
            const top = suggestions.find((s: any) => s.capacity.ok && s.feasibility.ok && s.vehicle.ok);
            if (!top) {
              receipt.autoAssign = { ok: false, skipped: true, reason: "no_eligible_driver" };
            } else {
              const r = await dispatchService.assignDriverWithGate({
                companyId,
                orderId,
                driverId: top.driver.id,
                performedBy: actorUserId || top.driver.id,
                score: top.score.total,
                reason: "Branch auto-assign (regions.auto_assign_orders=true)",
              });
              if (r.ok) {
                receipt.autoAssign = {
                  ok: true,
                  driverId: top.driver.id,
                  driverName: top.driver.full_name,
                  score: top.score.total,
                };
              } else {
                receipt.autoAssign = { ok: false, reason: r.reason || "assign_gate_refused" };
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.warn("[postOrderCreationCascade] autoAssign step crashed:", { orderId, error: e?.message });
      receipt.autoAssign = { ok: false, reason: e?.message || "autoAssign step crashed" };
    }
  } else {
    receipt.autoAssign = { ok: true, skipped: true, reason: "skipped_by_caller" };
  }

  return receipt;
}

/**
 * Wave 48 A6 - dedup probe used by Step 2.
 *
 * Returns true when an `order_confirmed` automation row was logged
 * for this order within the last 5 minutes. The status-flip path
 * (sendStatusNotifications) writes such a row whenever it sends the
 * customer email, so this guard lets cascade and status-flip race
 * without the customer seeing two confirmation emails. The 5-min
 * window is the retry-storm horizon; legitimate "confirm again
 * later" cycles for the same order are extremely rare.
 *
 * Best-effort: any probe failure returns false so we err on the
 * side of sending.
 */
async function _orderConfirmedAlreadySentRecently(
  client: any,
  orderId: string,
): Promise<boolean> {
  try {
    const fiveMinAgoIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count, error } = await (client as any)
      .from("email_automation_log")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("template_type", "order_confirmed")
      .gte("sent_at", fiveMinAgoIso);
    if (error) {
      console.warn("[postOrderCreationCascade] dedup probe failed:", error);
      return false;
    }
    return Number(count || 0) > 0;
  } catch (e) {
    console.warn("[postOrderCreationCascade] dedup probe crashed:", e);
    return false;
  }
}
