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
}

export interface PostOrderCascadeReceipt {
  invoice: { ok: boolean; invoiceId?: string; alreadyExisted?: boolean; skipped?: string; reason?: string };
  email: { ok: boolean; reason?: string; skipped?: boolean };
  kitchen: { ok: boolean; tasksCreated?: number; reason?: string };
  equipment: { ok: boolean; bookingsCreated?: number; reason?: string; skipped?: boolean };
  conflicts: { ok: boolean; shortfalls?: number; reason?: string; skipped?: boolean };
  shopping: { ok: boolean; shortfalls?: number; reason?: string; skipped?: boolean };
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
  // line items -- the invoice was R0.00, kitchen had no prep list,
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
            return {
              order_id: orderId,
              menu_item_id: it.menu_item_id || null,
              item_name: name,
              description: it.category || it.dietary_tags?.join?.(", ") || null,
              quantity: qty,
              unit_price: unit,
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
        .select("id, order_number, client_email, client_name, event_date, currency, total_amount, company_id")
        .eq("id", orderId)
        .maybeSingle();
      if (orderErr) {
        console.error("[order/postCreationCascade] orders fetch failed:", orderErr);
      }

      if (!order) {
        receipt.email = { ok: false, skipped: true, reason: "order_not_found" };
      } else if (!(order as any).client_email) {
        receipt.email = { ok: false, skipped: true, reason: "no_client_email" };
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
        // id from the receipt -- pull the public_token so the
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
        // operator sees the real cause -- "Resend domain not verified",
        // "from_email_domain_mismatch", "blocked_recipient" etc. --
        // in the accept-on-behalf toast and the email-failures dashboard.
        // Wave 23.5: subject-line tone polish. "Order Confirmed -
        // #ORD-003827" reads templated; the operator's own copy
        // would say "Your {event} booking is confirmed -- {company}".
        // Build a more personable line that still surfaces the order
        // number for inbox search.
        const orderNumberLabel = (order as any).order_number || orderId;
        const eventNameForSubject = (order as any).event_name || "your event";
        const detailed = await (emailService as any).sendEmailDetailed({
          companyId,
          to: (order as any).client_email,
          subject: `${eventNameForSubject} confirmed -- ${companyName} (${orderNumberLabel})`,
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
            // Phase 6 #5: surface the invoice link as a template
            // variable. Tenant-customised templates can drop
            // {{invoice_link}} wherever; the default body picks it
            // up at render time without any tenant action.
            invoice_link: invoiceLink || "",
            invoiceLink: invoiceLink || "",
          },
          // Forward the injected client so the gates + audit logging
          // happen under the same auth context as the rest of the
          // cascade.
          _client: client,
        });
        if (detailed?.success) {
          receipt.email = { ok: true, skipped: false };
        } else {
          const reason = detailed?.error_code || detailed?.error || "send_failed";
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
      const { data: order, error: orderErr2 } = await (client as any)
        .from("orders")
        .select("id, quote_id, event_date, company_id")
        .eq("id", orderId)
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
                  link: `/admin/orders?orderId=${orderId}`,
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
  // (when the order is delivered), which is too late -- shopping
  // can't have driven to the supplier already. Now: run the same
  // previewInventoryDeduction the admin sees in the order editor,
  // and for every ingredient where needed > available, broadcast a
  // single condensed alert to shopping_staff with the deficit list.
  // Non-blocking: failures don't refuse the order, just log.
  if (!opts.skipShoppingSuggestion) {
    try {
      const { data: order, error: orderErr4 } = await (client as any)
        .from("orders")
        .select("id, guest_count, final_guest_count, number_of_guests, event_date, region_id, order_number")
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
          quantity: 1,
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

  // Phase 3 #4: persist the receipt onto the order so the admin
  // detail panel can show what happened at order-creation time.
  // Non-blocking -- a write failure here doesn't unwind anything;
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

  return receipt;
}
