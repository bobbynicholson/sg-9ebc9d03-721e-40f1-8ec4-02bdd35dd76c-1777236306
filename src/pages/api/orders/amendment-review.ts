/**
 * POST /api/orders/amendment-review
 *
 * Admin reviews a pending amendment request - approve, reject, or
 * partial-approve. Approval applies the diff to the order row and
 * triggers the cascade: kitchen prep regen, shopping list refresh,
 * inventory deduction recalc, invoice update if the total changed.
 *
 * Auth: caller must be admin/owner in the same company as the
 * request.
 *
 * Body:
 *   {
 *     request_id: string,
 *     action: 'approve' | 'reject' | 'approve_partial',
 *     // for approve_partial only: which keys to apply
 *     apply_keys?: string[],
 *     review_notes?: string
 *   }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { resolveClientUserId } from "@/services/lifecycle/resolveClientUserId";
import { resolveEmailTemplate } from "@/services/email/templateResolver";
import { emailService } from "@/services/emailService";

/**
 * LCF-T (task #242): client-facing email when an amendment outcome
 * lands. The handler used to only push an in-portal notification, so
 * a client who didn't log in had no idea their event change was
 * applied or declined. Best-effort: every failure path is non-blocking
 * (the review itself has already happened).
 */
async function sendAmendmentEmail(opts: {
  templateType: "order_changed" | "order_change_rejected";
  companyId: string;
  orderId: string;
  changeSummary: string;
  partial: boolean;
  reviewNotes: string | null;
}): Promise<void> {
  try {
    const admin = getServiceSupabase();
    const { data: orderRow } = await (admin as any)
      .from("orders")
      .select("client_email, client_name, order_number, event_name, event_date, venue_address")
      .eq("id", opts.orderId)
      .maybeSingle();
    if (!orderRow || !(orderRow as any).client_email) return;

    const { data: companyRow } = await (admin as any)
      .from("companies")
      .select("company_name, slug")
      .eq("id", opts.companyId)
      .maybeSingle();
    const tenantName = (companyRow as any)?.company_name || "your caterer";
    const slug = (companyRow as any)?.slug || "";

    const firstName = String((orderRow as any).client_name || "there").trim().split(" ")[0] || "there";
    const orderNumber = (orderRow as any).order_number || "your order";
    const eventName = (orderRow as any).event_name || orderNumber;
    const eventDate = (orderRow as any).event_date as string | null;
    const eventDateLabel = eventDate
      ? new Date(eventDate).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
      : "";

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com";
    const orderLink = slug
      ? `${baseUrl}/${slug}/c/order/${opts.orderId}`
      : `${baseUrl}/c/order/${opts.orderId}`;

    const reviewNotesParagraph = opts.reviewNotes && opts.reviewNotes.trim()
      ? `Reason from the team: ${opts.reviewNotes.trim()}\n\n`
      : "";

    const variables: Record<string, string> = {
      first_name: firstName,
      client_first_name: firstName,
      order_number: String(orderNumber),
      event_name: String(eventName),
      tenant_name: tenantName,
      event_date_label: eventDateLabel ? ` for ${eventDateLabel}` : "",
      event_date_phrase: eventDateLabel ? ` for ${eventDateLabel}` : "",
      venue_phrase: (orderRow as any).venue_address ? ` to ${(orderRow as any).venue_address}` : "",
      eta_sentence: "",
      change_summary: opts.changeSummary,
      order_link: orderLink,
      partial: opts.partial ? "1" : "",
      review_notes_paragraph: reviewNotesParagraph,
      review_notes: opts.reviewNotes || "",
    };

    const fallback = opts.templateType === "order_changed"
      ? {
          subject: `Update on your order ${orderNumber}`,
          bodyHtml:
            `Hi ${firstName},\n\n` +
            `We've updated your order ${orderNumber}${eventDateLabel ? ` for ${eventDateLabel}` : ""}.\n\n` +
            `What changed: ${opts.changeSummary}\n\n` +
            `Open your order to see the latest details: ${orderLink}\n\n` +
            `Reply to this email if anything looks off.\n\n` +
            `Thanks,\n${tenantName}`,
        }
      : {
          subject: `Couldn't apply your change to ${orderNumber}`,
          bodyHtml:
            `Hi ${firstName},\n\n` +
            `We couldn't apply the change you requested on order ${orderNumber}.\n\n` +
            reviewNotesParagraph +
            `Reply to this email and we'll work it out together.\n\n` +
            `Thanks,\n${tenantName}`,
        };

    const resolved = await resolveEmailTemplate({
      companyId: opts.companyId,
      templateType: opts.templateType,
      variables,
      fallback,
      client: admin,
    });

    await (emailService as any).sendEmail({
      companyId: opts.companyId,
      to: (orderRow as any).client_email,
      subject: resolved.subject,
      body: resolved.bodyHtml,
      _client: admin,
    });
  } catch (e) {
    console.warn("[amendment-review] email send failed (non-blocking):", e);
  }
}

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const ALLOWED_FIELDS = new Set([
  "guest_count",
  "menu_items",
  "equipment_items",
  "special_instructions",
  "delivery_time",
  "venue_address",
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[orders/amendment-review] profiles fetch failed:", profileErr);
    }
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ error: "Owner or admin only" });
    }

    const { request_id, action, apply_keys, review_notes } = (req.body || {}) as any;
    if (!request_id || !["approve", "reject", "approve_partial"].includes(action)) {
      return res.status(400).json({ error: "Invalid request_id or action" });
    }

    const { data: request, error: requestErr } = await ssr
      .from("order_amendment_requests")
      .select("id, order_id, company_id, proposed_changes, status, requested_by_user_id")
      .eq("id", request_id)
      .maybeSingle();
    if (requestErr) {
      console.error("[orders/amendment-review] order_amendment_requests fetch failed:", requestErr);
    }
    if (!request) return res.status(404).json({ error: "Amendment request not found" });
    if ((request as any).status !== "pending") {
      return res.status(409).json({ error: `Request is already ${(request as any).status}` });
    }
    if (
      role !== "super_admin" &&
      (profile as any)?.company_id !== (request as any).company_id
    ) {
      return res.status(403).json({ error: "Wrong company" });
    }

    const nowIso = new Date().toISOString();

    if (action === "reject") {
      await ssr.from("order_amendment_requests").update({
        status: "rejected",
        reviewed_by_user_id: user.id,
        reviewed_at: nowIso,
        review_notes: review_notes || null,
      } as any).eq("id", request_id);

      // Wave 24: cross-cutting audit_logs entry. Without this the
      // platform-wide audit feed had no record of WHO declined the
      // change request - problematic for compliance, dispute
      // resolution ("we never agreed to that price change"), and
      // operator hand-off across shifts. Best-effort - a failed log
      // never rolls back the review.
      try {
        await (ssr as any).from("audit_logs").insert({
          company_id: (request as any).company_id,
          user_id: user.id,
          action: "amendment_rejected",
          entity_type: "order",
          entity_id: (request as any).order_id,
          details: {
            request_id,
            review_notes: review_notes || null,
            requested_by_user_id: (request as any).requested_by_user_id || null,
          },
        });
      } catch (auditErr) {
        console.warn("[amendment-review] audit_logs insert failed:", auditErr);
      }

      // Notify the client that their change request was declined.
      // Best-effort - a notification failure must not roll back the
      // review. requested_by_user_id is the client's auth uid, fall
      // back to the orders->clients lookup if it's missing.
      try {
        const { data: orderRow, error: orderRowErr } = await ssr
          .from("orders")
          .select("client_id, order_number")
          .eq("id", (request as any).order_id)
          .maybeSingle();
        if (orderRowErr) {
          console.error("[orders/amendment-review] orders fetch failed:", orderRowErr);
        }
        const recipientId =
          (request as any).requested_by_user_id ||
          (await resolveClientUserId(ssr, (orderRow as any)?.client_id));
        if (recipientId) {
          const { notificationService } = await import("@/services/notificationService");
          // Wave 24: dedup so a double-click on Reject doesn't double-
          // notify the client.
          await notificationService.createNotification({
            company_id: (request as any).company_id,
            recipient_id: recipientId,
            user_id: user.id,
            notification_type: "amendment_rejected",
            title: "Change request declined",
            message: review_notes
              ? `We couldn't apply your change request. Reason from the team: ${review_notes}`
              : "We couldn't apply your change request. Please get in touch and we'll work it out.",
            priority: "high",
            link: `/client-portal/my-orders?orderId=${(request as any).order_id}`,
            related_entity_type: "order",
            related_entity_id: (request as any).order_id,
            dedup: true,
          });
        }
      } catch (e) {
        console.warn("[amendment-review] reject notify failed:", e);
      }

      // LCF-T: client email so a client who isn't watching the portal
      // still hears that the change was declined.
      await sendAmendmentEmail({
        templateType: "order_change_rejected",
        companyId: (request as any).company_id,
        orderId: (request as any).order_id,
        changeSummary: "",
        partial: false,
        reviewNotes: review_notes || null,
      });

      return res.status(200).json({ ok: true, applied: 0 });
    }

    // Determine which keys to apply.
    const proposed = (request as any).proposed_changes || {};
    let toApply: Record<string, any> = {};
    if (action === "approve") {
      toApply = { ...proposed };
    } else {
      // approve_partial - intersect proposed with apply_keys.
      if (!Array.isArray(apply_keys) || apply_keys.length === 0) {
        return res.status(400).json({ error: "apply_keys required for approve_partial" });
      }
      for (const k of apply_keys) {
        if (k in proposed && ALLOWED_FIELDS.has(k)) toApply[k] = proposed[k];
      }
    }
    if (Object.keys(toApply).length === 0) {
      return res.status(400).json({ error: "No amendable keys to apply" });
    }

    // Snapshot current order values for the keys we're about to change.
    const { data: orderBefore, error: orderBeforeErr } = await ssr
      .from("orders")
      .select(Array.from(ALLOWED_FIELDS).join(", "))
      .eq("id", (request as any).order_id)
      .maybeSingle();
    if (orderBeforeErr) {
      console.error("[orders/amendment-review] orders fetch failed:", orderBeforeErr);
    }
    const snapshot: Record<string, any> = {};
    for (const k of Object.keys(toApply)) {
      snapshot[k] = orderBefore ? (orderBefore as any)[k] : null;
    }

    // Apply the diff to the orders row.
    const { error: updateErr } = await ssr
      .from("orders")
      .update({
        ...toApply,
        updated_at: nowIso,
      } as any)
      .eq("id", (request as any).order_id);
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Wave 21 audit: amendment-review applied the diff (guest_count,
    // menu_items, equipment_items) but never recomputed orders.subtotal /
    // tax_amount / total_amount. recalcInvoiceForOrder below pulls the
    // GROSS from orders.total_amount when the tenant is inc-VAT (Wave
    // 17 fix), so a stale orders.total_amount produced an invoice that
    // didn't match the new spec. Recompute order totals from the live
    // order_items + delivery + waiter rows BEFORE the invoice cascade
    // so both sides agree.
    if (Object.keys(toApply).some((k) => ["guest_count", "menu_items", "equipment_items"].includes(k))) {
      try {
        const { data: items } = await ssr
          .from("order_items")
          .select("unit_price, quantity")
          .eq("order_id", (request as any).order_id);
        const { data: orderRow } = await ssr
          .from("orders")
          .select("delivery_fee, waiter_total_fee, region_id, company_id")
          .eq("id", (request as any).order_id)
          .maybeSingle();
        const lineSum = ((items || []) as any[]).reduce(
          (s, it) => s + Number(it.quantity ?? 1) * Number(it.unit_price ?? 0),
          0,
        );
        const deliveryFee = Number((orderRow as any)?.delivery_fee || 0);
        const waiterFee = Number((orderRow as any)?.waiter_total_fee || 0);
        const lineSumPlus = lineSum + deliveryFee + waiterFee;
        // Resolve the per-tenant VAT rate + pricing convention from
        // the branch settings. Same source the invoice generator uses.
        const { resolveBranchSettings } = await import("@/services/branchSettingsService");
        const branch = await resolveBranchSettings(
          (orderRow as any)?.company_id,
          ((orderRow as any)?.region_id as string | null) ?? null,
        );
        const taxRate = branch.vatRegistered ? Number(branch.vatRate) : 0;
        const { data: companyVat } = await ssr
          .from("companies")
          .select("pricing_includes_vat")
          .eq("id", (orderRow as any)?.company_id)
          .maybeSingle();
        const incVat = (companyVat as any)?.pricing_includes_vat === true;
        const { calculateOrderTotal } = await import("@/services/order/orderFinancials");
        const totals = await calculateOrderTotal(
          [{ unit_price: lineSumPlus, quantity: 1 }],
          taxRate,
          incVat ? "inc" : "ex",
        );
        await ssr
          .from("orders")
          .update({
            subtotal: totals.subtotal,
            tax_amount: totals.tax,
            total_amount: totals.total,
            updated_at: nowIso,
          } as any)
          .eq("id", (request as any).order_id);
      } catch (e) {
        console.warn("[amendment-review] order total recompute failed (non-blocking):", e);
      }
    }

    // Stamp the request as approved + capture snapshot.
    await ssr.from("order_amendment_requests").update({
      status: action === "approve_partial" && Object.keys(toApply).length < Object.keys(proposed).length
        ? "approved" // still 'approved' even when partial - keys list lives in applied_snapshot
        : "approved",
      reviewed_by_user_id: user.id,
      reviewed_at: nowIso,
      review_notes: review_notes || null,
      applied_snapshot: { before: snapshot, applied_keys: Object.keys(toApply) },
      applied_at: nowIso,
    } as any).eq("id", request_id);

    // Cascade: kitchen prep regen + invoice diff + inventory recalc.
    // Previously these were fire-and-forget so a serverless cold-stop
    // between approval and cascade completion left the order amended
    // with stale prep tasks / invoice / inventory and nobody knew
    // [P0-08]. Now the cascade is awaited and each step's result is
    // returned in the response, so the operator can re-trigger any
    // step that failed (or the receipt object plugs into the future
    // retry endpoint without reshaping).
    const cascade: {
      kitchen_prep: { ok: boolean; reason?: string };
      invoice: { ok: boolean; reason?: string };
      inventory: { ok: boolean; reason?: string; skipped?: boolean };
    } = {
      kitchen_prep: { ok: false },
      invoice: { ok: false },
      inventory: { ok: false, skipped: true },
    };

    try {
      const { kitchenPrepService } = await import("@/services/kitchenPrepService");
      await (kitchenPrepService as any).ensurePrepTasksForOrder(
        (request as any).company_id,
        (request as any).order_id,
      );
      cascade.kitchen_prep.ok = true;
    } catch (e: any) {
      cascade.kitchen_prep.reason = e?.message || "kitchen prep regen failed";
      console.warn("[amendment-review] kitchen prep regen failed:", e);
    }

    try {
      const {
        ensureInvoiceForOrder,
        recalcInvoiceForOrder,
      } = await import("@/services/invoiceGenerationService");
      // Flow audit Leg C P0-4: ensureInvoiceForOrder no-ops when an
      // invoice already exists, so previously the amendment shifted
      // the order total but left the invoice + balance_due frozen.
      // Try to recalc first; if no invoice exists yet (rare for an
      // order under amendment), fall back to ensure.
      const recalc = await recalcInvoiceForOrder(
        (request as any).order_id,
        (request as any).company_id,
        ssr,
      );
      if (recalc.success && recalc.updated) {
        cascade.invoice.ok = true;
      } else if (recalc.reason === "no_invoice") {
        await ensureInvoiceForOrder(
          (request as any).order_id,
          (request as any).company_id,
          ssr,
        );
        cascade.invoice.ok = true;
      } else {
        cascade.invoice.ok = false;
        cascade.invoice.reason = recalc.error || recalc.reason || "invoice recalc returned no update";
      }
    } catch (e: any) {
      cascade.invoice.reason = e?.message || "invoice refresh failed";
      console.warn("[amendment-review] invoice refresh failed:", e);
    }

    // Inventory cascade. Only fire when the amendment touched
    // guest_count, menu_items, or equipment_items.
    const inventoryRelevant = ["guest_count", "menu_items", "equipment_items"];
    const touchedInventory = Object.keys(toApply).some((k) => inventoryRelevant.includes(k));
    if (touchedInventory) {
      cascade.inventory = { ok: false, skipped: false };
      try {
        const { recalculateInventoryForOrder } = await import("@/services/inventoryDeductionService");
        const result = await recalculateInventoryForOrder(
          (request as any).order_id,
          (request as any).company_id,
          user.id,
        );
        cascade.inventory.ok = !!result.success;
        if (!result.success) {
          cascade.inventory.reason = (result.errors || []).join("; ") || "inventory recalc errors";
        }
      } catch (e: any) {
        cascade.inventory.reason = e?.message || "inventory recalc crashed";
        console.warn("[amendment-review] inventory recalc crashed:", e);
      }
    }

    // TIGHTEN I.64 (2026-06-01): mirror the applied amendment back to
    // the source quote. The auditors flagged that previously the
    // amendment-approved path mutated the order's totals / menu_items /
    // equipment_items / venue / guest_count and ran the kitchen / invoice
    // / inventory cascades - but never touched the source quote. So
    // after a partial refund or a guest-count change, /admin/quotes/[id]
    // showed the original quote, /admin/orders/[id] showed the amended
    // version, and the two diverged silently. The reverse trigger
    // tg_orders_propagate_to_quote DOES mirror date/time/venue/guests
    // but NOT menu_items, equipment_items or totals - so menu changes
    // from an amendment were strictly lost on the quote side.
    //
    // Walk orders.quote_id and rewrite the same fields the amendment
    // changed. Best-effort - amendment commit shouldn't roll back if
    // the quote mirror fails; we collect into cascade.quote_mirror so
    // the operator can see the outcome.
    let quoteMirror: { ok: boolean; reason?: string; skipped?: boolean } = { ok: false, skipped: true };
    try {
      const { data: orderForQuote } = await ssr
        .from("orders")
        .select("quote_id")
        .eq("id", (request as any).order_id)
        .maybeSingle();
      const linkedQuoteId = (orderForQuote as any)?.quote_id || null;
      if (!linkedQuoteId) {
        quoteMirror = { ok: true, skipped: true };
      } else {
        const quotePatch: Record<string, any> = { updated_at: nowIso };
        // Direct field mirrors: shape-equivalent on quotes.
        for (const k of ["guest_count", "venue_address", "menu_items", "equipment_items", "special_instructions"]) {
          if (k in toApply) quotePatch[k] = (toApply as any)[k];
        }
        // delivery_time on orders -> event_time on quotes.
        if ("delivery_time" in toApply) {
          quotePatch.event_time = (toApply as any).delivery_time;
        }
        // Totals (only when we recomputed above) - mirror to quote so
        // the public quote view + invoice generated from quote line
        // items doesn't drift. Re-fetch the order row to read the
        // freshly-written totals (the `totals` local is scoped to a
        // sibling try block). Same "did the amendment touch totals"
        // test the recompute used.
        const totalsTouchingKeys = ["guest_count", "menu_items", "equipment_items"];
        const totalsWereRecomputed = Object.keys(toApply).some((k) => totalsTouchingKeys.includes(k));
        if (totalsWereRecomputed) {
          const { data: freshOrder } = await ssr
            .from("orders")
            .select("subtotal, tax_amount, total_amount")
            .eq("id", (request as any).order_id)
            .maybeSingle();
          if (freshOrder) {
            quotePatch.subtotal = (freshOrder as any).subtotal;
            quotePatch.tax_amount = (freshOrder as any).tax_amount;
            quotePatch.tax = (freshOrder as any).tax_amount;
            quotePatch.total = (freshOrder as any).total_amount;
            quotePatch.total_amount = (freshOrder as any).total_amount;
          }
        }
        if (Object.keys(quotePatch).length > 1) {
          const { error: mirrorErr } = await ssr
            .from("quotes")
            .update(quotePatch as any)
            .eq("id", linkedQuoteId);
          if (mirrorErr) {
            quoteMirror = { ok: false, reason: mirrorErr.message };
          } else {
            quoteMirror = { ok: true, skipped: false };
          }
        } else {
          quoteMirror = { ok: true, skipped: true };
        }
      }
    } catch (mirrorErr: any) {
      quoteMirror = { ok: false, reason: mirrorErr?.message || "quote mirror crashed" };
      console.warn("[amendment-review] quote mirror failed:", mirrorErr);
    }

    // Persist cascade outcome on the request row so the operator can
    // see at a glance which steps need a retry, and so a future retry
    // endpoint can pick up where this one left off.
    await ssr.from("order_amendment_requests").update({
      applied_snapshot: {
        before: snapshot,
        applied_keys: Object.keys(toApply),
        cascade: { ...cascade, quote_mirror: quoteMirror },
      },
    } as any).eq("id", request_id);

    // Notify the client that their change went through. Best-effort
    // - a notification failure must not roll back the amendment.
    try {
      const { data: orderRow, error: orderRowErr3 } = await ssr
        .from("orders")
        .select("client_id, order_number")
        .eq("id", (request as any).order_id)
        .maybeSingle();
      if (orderRowErr3) {
        console.error("[orders/amendment-review] orders fetch failed:", orderRowErr3);
      }
      const recipientId =
        (request as any).requested_by_user_id ||
        (await resolveClientUserId(ssr, (orderRow as any)?.client_id));
      if (recipientId) {
        const partial = action === "approve_partial";
        const appliedList = Object.keys(toApply)
          .map((k) => k.replace(/_/g, " "))
          .join(", ");
        const { notificationService } = await import("@/services/notificationService");
        // Wave 24: dedup so a double-click on Approve doesn't double-
        // notify the client.
        await notificationService.createNotification({
          company_id: (request as any).company_id,
          recipient_id: recipientId,
          user_id: user.id,
          notification_type: partial ? "amendment_partial_approved" : "amendment_approved",
          title: partial ? "Change request partly applied" : "Change request approved",
          message: partial
            ? `We applied part of your change request: ${appliedList}. Open your order to see the latest details.`
            : `Your change request was applied: ${appliedList}. Open your order to see the latest details.`,
          priority: "normal",
          link: `/client-portal/my-orders?orderId=${(request as any).order_id}`,
          related_entity_type: "order",
          related_entity_id: (request as any).order_id,
          dedup: true,
        });
      }
    } catch (e) {
      console.warn("[amendment-review] approve notify failed:", e);
    }

    // LCF-T: client email so the change lands even for clients who
    // don't live in the portal. Uses the order_changed template (with
    // a partial flag when only some keys applied) so an operator can
    // edit the wording in /admin/email-templates.
    {
      const appliedHuman = Object.keys(toApply)
        .map((k) => k.replace(/_/g, " "))
        .join(", ") || "the requested change";
      await sendAmendmentEmail({
        templateType: "order_changed",
        companyId: (request as any).company_id,
        orderId: (request as any).order_id,
        changeSummary: appliedHuman,
        partial: action === "approve_partial",
        reviewNotes: review_notes || null,
      });
    }

    // Wave 24: audit_logs entry for the approve path. Captures WHO
    // applied the change + WHAT changed (before snapshot, applied
    // keys, cascade outcome). Critical for compliance + dispute
    // resolution - the operator can prove "guest count moved from
    // 80 to 120 at 10:45 by jane@spitco.test" and the cascade
    // outcomes show whether kitchen prep + invoice + inventory all
    // re-sync'd successfully.
    try {
      await (ssr as any).from("audit_logs").insert({
        company_id: (request as any).company_id,
        user_id: user.id,
        action: action === "approve_partial" ? "amendment_partial_approved" : "amendment_approved",
        entity_type: "order",
        entity_id: (request as any).order_id,
        details: {
          request_id,
          applied_keys: Object.keys(toApply),
          before: snapshot,
          cascade,
          review_notes: review_notes || null,
          requested_by_user_id: (request as any).requested_by_user_id || null,
        },
      });
    } catch (auditErr) {
      console.warn("[amendment-review] audit_logs insert failed:", auditErr);
    }

    return res.status(200).json({
      ok: true,
      applied: Object.keys(toApply).length,
      applied_keys: Object.keys(toApply),
      inventory_recalc_queued: touchedInventory,
      cascade,
    });
  } catch (err: any) {
    console.error("[amendment-review] crashed:", err);
    return res.status(500).json({ error: err?.message || "Amendment review failed" });
  }
}
