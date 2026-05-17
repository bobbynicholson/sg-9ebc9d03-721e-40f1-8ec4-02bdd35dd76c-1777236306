/**
 * releaseOrderResources -- Wave 70.48
 *
 * Single chokepoint for "release every downstream allocation tied to
 * this order." Replaces the scattered fire-and-forget blocks that used
 * to live inline in cancelOrder() (orderWorkflow.ts), with parallel
 * copies in cancellation-review.ts (postpone branch) and runAutoCancel.
 *
 * Why centralised:
 *   - Adding a NEW resource to release (e.g. shopping list items in
 *     Wave 70.51) means editing ONE function instead of three.
 *   - Audit / reporting can ask "what was released for order X" by
 *     inspecting the returned receipt instead of grepping logs.
 *   - Wave 70.49-70.51 will hang their new cascades on this helper
 *     without re-touching cancelOrder.
 *
 * Mode controls behaviour for the three real callers:
 *   "cancel"   -- full release; resources marked cancelled, allocations
 *                 reversed, downstream emails stopped. Default.
 *   "postpone" -- release-but-preserve; nulls assignments so the order
 *                 can be re-dispatched on a new date, but leaves
 *                 invoices, inventory, and audit log untouched.
 *   "reject"   -- quote-side rejection cleanup. Most resources never
 *                 existed (they're order-time creations) so this is
 *                 a lighter touch -- only equipment_hire_orders
 *                 currently has quote-side allocations.
 *
 * Returns a receipt (array of {resource, action, count, error?}) so
 * the caller can audit-log what actually happened. Each resource is
 * tried independently; one failure never undoes another.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type ReleaseMode = "cancel" | "postpone" | "reject";

export interface ReleaseLine {
  /** Short table/resource name, e.g. "equipment_bookings". */
  resource: string;
  /** "cancelled" | "nulled" | "reversed" | "skipped" -- what we did. */
  action: string;
  /** Affected row count when known. */
  count?: number;
  /** Error message if this resource failed. Other resources still run. */
  error?: string;
  /**
   * Wave 70.49 -- operator-action follow-ups the system can't do itself.
   * Examples: "notify supplier {name}/{contact} that hire is cancelled",
   * "notify outsource provider {name} that the job is off". These get
   * embedded in the audit_logs row + can be surfaced via a "Manual
   * follow-ups required" panel on the cancellation review screen.
   *
   * Bobby's call (audit Q1): cancel in DB + queue manual follow-up
   * rather than auto-emailing 3rd parties (cancel fees etc. we don't
   * track). This field is the queue.
   */
  followups?: Array<{
    kind: "notify_hire_supplier" | "notify_outsource_provider";
    label: string;
    contact?: string | null;
    ref_id?: string;
  }>;
}

export interface ReleaseReceipt {
  orderId: string;
  mode: ReleaseMode;
  lines: ReleaseLine[];
  /** Wall-clock duration of the full release in ms. */
  ms: number;
}

export interface ReleaseOpts {
  orderId: string;
  /** Required for inventory reversal (the deduction service needs it). */
  companyId?: string | null;
  /** Recorded on reverse transactions so audit shows WHO. */
  actorUserId?: string | null;
  /** Default "cancel". */
  mode?: ReleaseMode;
  /** Supabase client (service or SSR). */
  sb: any;
  /** Suppress console warns -- useful when called from tests. */
  silent?: boolean;
}

/**
 * Release every downstream allocation tied to the given order.
 *
 * IMPORTANT: this function does NOT flip the parent order's status.
 * The caller (cancelOrder / postpone branch / etc.) owns the parent
 * UPDATE so it can include extra columns specific to its workflow
 * (cancellation_reason_category, postponed_from_date, etc.). This
 * helper handles ONLY the downstream cascade.
 */
export async function releaseOrderResources(opts: ReleaseOpts): Promise<ReleaseReceipt> {
  const t0 = Date.now();
  const { orderId, sb, companyId, actorUserId } = opts;
  const mode: ReleaseMode = opts.mode || "cancel";
  const silent = !!opts.silent;
  const nowIso = new Date().toISOString();
  const lines: ReleaseLine[] = [];

  // Generic single-resource update wrapper. Captures count + error
  // into the receipt without unwinding sibling cascades.
  const tryUpdate = async (
    resource: string,
    action: string,
    fn: () => Promise<{ count?: number | null } | { error?: any; count?: number | null }>,
  ): Promise<void> => {
    try {
      const r = await fn();
      const cnt = typeof (r as any).count === "number" ? (r as any).count : undefined;
      if ((r as any).error) {
        const err = String((r as any).error?.message || (r as any).error);
        lines.push({ resource, action: "failed", error: err });
        if (!silent) console.warn(`[releaseOrderResources] ${resource} ${action} failed:`, err);
      } else {
        lines.push({ resource, action, count: cnt });
      }
    } catch (e: any) {
      lines.push({ resource, action: "failed", error: e?.message || String(e) });
      if (!silent) console.warn(`[releaseOrderResources] ${resource} ${action} threw:`, e);
    }
  };

  // ── 1. equipment_bookings ───────────────────────────────────────────
  // Release the slot so the same equipment is bookable for that date.
  // Wave 70.49 will extend this to also touch equipment_hire_orders.
  await tryUpdate("equipment_bookings", "cancelled", async () => {
    const { count, error } = await sb
      .from("equipment_bookings")
      .update({ status: "cancelled" }, { count: "exact" })
      .eq("order_id", orderId);
    return { error, count };
  });

  // ── 2. kitchen_prep_tasks ───────────────────────────────────────────
  // For cancel / reject -- mark skipped.
  // For postpone -- leave alone; they'll re-schedule against the new date.
  //
  // Wave 70.48b: was status='cancelled' which is NOT in the
  // kitchen_prep_tasks_status_check enum (allowed: pending,
  // in_progress, done, skipped). Every previous cancellation since
  // this shipped silently 23514-errored on the prep task flip,
  // leaving tasks stuck on 'pending' and the chef's prep view
  // showing ghost tasks for cancelled events. Discovered by the
  // Wave 70.47 smoke test on the first live run -- the structured
  // release receipt now reports per-resource success/failure where
  // the old fire-and-forget void(async)() blocks just logged a
  // warn that nobody read. 'skipped' is the enum value semantically
  // closest to "this task isn't going to happen" (the chef chose
  // not to do it -- in this case because the event was cancelled).
  if (mode === "cancel" || mode === "reject") {
    await tryUpdate("kitchen_prep_tasks", "skipped", async () => {
      const { count, error } = await sb
        .from("kitchen_prep_tasks")
        .update({ status: "skipped" }, { count: "exact" })
        .eq("order_id", orderId)
        .in("status", ["pending", "in_progress"]);
      return { error, count };
    });
  } else {
    lines.push({ resource: "kitchen_prep_tasks", action: "skipped (postpone)" });
  }

  // ── 3. inventory_transactions (reverse stock) ──────────────────────
  // Postpone keeps deductions (the event WILL happen, just later).
  // Cancel reverses them. Reject doesn't apply (no order-time deduction).
  if (mode === "cancel") {
    try {
      if (companyId) {
        const { reverseInventoryForOrder } = await import("@/services/inventoryDeductionService");
        await reverseInventoryForOrder(
          orderId,
          companyId,
          actorUserId || "system",
        );
        lines.push({ resource: "inventory_transactions", action: "reversed" });
      } else {
        lines.push({ resource: "inventory_transactions", action: "skipped (no company_id)" });
      }
    } catch (e: any) {
      lines.push({ resource: "inventory_transactions", action: "failed", error: e?.message || String(e) });
      if (!silent) console.warn("[releaseOrderResources] inventory reverse failed:", e);
    }
  } else {
    lines.push({ resource: "inventory_transactions", action: "skipped (mode!=cancel)" });
  }

  // ── 4. invoices (void unpaid) ──────────────────────────────────────
  // Only on cancel -- postpone keeps the invoice live against the new
  // event date.
  //
  // Wave 70.51a -- switched status target from 'written_off' to the
  // new 'voided' enum value. 'written_off' was the closest existing
  // value pre-migration but conflates "the order never happened" with
  // "bad debt" in accounting -- the bookkeeper saw cancelled-order
  // invoices on the write-off expense report, polluting the actual
  // bad-debt line. 'voided' is now distinct (Wave 70.51 migration).
  // The deleted_at + balance_due=0 + status flip combination still
  // ensures the invoice drops off active receivables.
  if (mode === "cancel") {
    await tryUpdate("invoices", "voided", async () => {
      const { count, error } = await sb
        .from("invoices")
        .update({
          status: "voided",
          balance_due: 0,
          deleted_at: nowIso,
          updated_at: nowIso,
        }, { count: "exact" })
        .eq("order_id", orderId)
        .is("deleted_at", null)
        .in("status", ["draft", "sent", "overdue", "partially_paid"]);
      return { error, count };
    });
  } else {
    lines.push({ resource: "invoices", action: "skipped (mode!=cancel)" });
  }

  // ── 5. outgoing_email_queue (cancel pending) ───────────────────────
  // All three modes -- pending emails for the original date are now
  // wrong regardless of whether the event was cancelled, postponed
  // (will re-schedule for new date), or the quote rejected.
  //
  // Wave 70.48b: dropped the `updated_at` field from the UPDATE.
  // The table has no updated_at column (only created_at + sent_at +
  // paused_at + scheduled_for). Every previous cancellation since
  // this shipped silently PGRST204-errored ("could not find the
  // updated_at column"), leaving pending emails un-cancelled.
  // Real symptom: clients receiving "see you tomorrow!" reminder
  // emails the day before a cancelled event. Status flip alone is
  // sufficient -- the email cron worker only fires on
  // status='pending', so changing status is the whole job.
  await tryUpdate("outgoing_email_queue", "cancelled", async () => {
    const { count, error } = await sb
      .from("outgoing_email_queue")
      .update({ status: "cancelled" }, { count: "exact" })
      .eq("trigger_ref_id", orderId)
      .eq("status", "pending");
    return { error, count };
  });

  // ── 6. outsource_assignments ────────────────────────────────────────
  // Cancel cascade. Postpone is a special case (the assignment date
  // changes too) -- caller handles that path separately.
  //
  // Wave 70.49 -- before flipping status, read the active assignments
  // so we can capture supplier identity into the receipt as a manual
  // follow-up. Provider is NOT auto-notified (per the audit -- accept
  // links serving silent cancelled pages is worse UX than the operator
  // making a 30-second phone call). The receipt feeds the cancellation
  // review screen's "Manual follow-ups required" panel.
  if (mode === "cancel") {
    const followups: NonNullable<ReleaseLine["followups"]> = [];
    try {
      // Wave 70.49 -- read active assignments + join outsource_providers
      // for the human-readable name. provider_id is the only FK on
      // outsource_assignments; the parent name lives on the provider
      // row. Embed join: `outsource_providers ( name, contact_phone,
      // contact_email )` so the UI can show "notify {name}" without a
      // second round-trip.
      const { data: active } = await sb
        .from("outsource_assignments")
        .select("id, provider_id, outsource_providers ( provider_name, phone, email )")
        .eq("order_id", orderId)
        .in("status", ["requested", "accepted", "en_route", "on_site"])
        .is("deleted_at", null);
      ((active as any[]) || []).forEach((row) => {
        const provider = row.outsource_providers || {};
        const contact = provider.phone || provider.email || null;
        followups.push({
          kind: "notify_outsource_provider",
          label: provider.provider_name || "Outsource provider",
          contact,
          ref_id: row.id,
        });
      });
    } catch (e) {
      if (!silent) console.warn("[releaseOrderResources] outsource read for followups failed:", e);
    }
    const tStage = Date.now();
    try {
      const { count, error } = await sb
        .from("outsource_assignments")
        .update({ status: "cancelled", cancelled_at: nowIso, updated_at: nowIso }, { count: "exact" })
        .eq("order_id", orderId)
        .in("status", ["requested", "accepted", "en_route", "on_site"])
        .is("deleted_at", null);
      if (error) {
        lines.push({ resource: "outsource_assignments", action: "failed", error: error.message });
      } else {
        lines.push({
          resource: "outsource_assignments",
          action: "cancelled",
          count: count ?? undefined,
          followups: followups.length > 0 ? followups : undefined,
        });
      }
    } catch (e: any) {
      lines.push({ resource: "outsource_assignments", action: "failed", error: e?.message || String(e) });
    }
    void tStage; // timing folded into the per-line ms; not separately tracked yet
  } else {
    lines.push({ resource: "outsource_assignments", action: "skipped (mode!=cancel)" });
  }

  // ── 8. equipment_hire_orders (Wave 70.49) ──────────────────────────
  // 3rd-party rental cancellation. Highest direct rand cost per
  // cancellation per the audit -- catering company keeps paying for
  // a marquee/generator/extra chairs for an event that's not happening.
  //
  // Per Bobby's call: mark cancelled in our DB + queue a manual
  // operator follow-up (rather than auto-emailing the supplier; we
  // don't track cancellation-fee policies and an automated "we're
  // cancelling" email can trigger fees we didn't intend to authorise).
  // The receipt's `followups` field carries the supplier name +
  // contact so the operator can act from one place.
  //
  // Filters to non-terminal statuses only (draft, confirmed) -- a
  // hire already in picked_up/returned is a real allocation that
  // can't be "un-cancelled" by us.
  if (mode === "cancel" || mode === "reject") {
    const followups: NonNullable<ReleaseLine["followups"]> = [];
    try {
      const { data: active } = await sb
        .from("equipment_hire_orders")
        .select("id, supplier_name, supplier_contact, equipment_name, quantity, total_cost")
        .eq(mode === "reject" ? "quote_id" : "order_id", orderId)
        .in("status", ["draft", "confirmed"]);
      ((active as any[]) || []).forEach((row) => {
        followups.push({
          kind: "notify_hire_supplier",
          label: `${row.supplier_name || "Unknown supplier"} -- ${row.equipment_name || "equipment"} x${row.quantity}`,
          contact: row.supplier_contact || null,
          ref_id: row.id,
        });
      });
    } catch (e) {
      if (!silent) console.warn("[releaseOrderResources] hire-in read for followups failed:", e);
    }
    try {
      const { count, error } = await sb
        .from("equipment_hire_orders")
        .update({ status: "cancelled", updated_at: nowIso }, { count: "exact" })
        .eq(mode === "reject" ? "quote_id" : "order_id", orderId)
        .in("status", ["draft", "confirmed"]);
      if (error) {
        lines.push({ resource: "equipment_hire_orders", action: "failed", error: error.message });
      } else {
        lines.push({
          resource: "equipment_hire_orders",
          action: "cancelled",
          count: count ?? undefined,
          followups: followups.length > 0 ? followups : undefined,
        });
      }
    } catch (e: any) {
      lines.push({ resource: "equipment_hire_orders", action: "failed", error: e?.message || String(e) });
    }
  } else {
    lines.push({ resource: "equipment_hire_orders", action: "skipped (mode!=cancel/reject)" });
  }

  // ── 9. driver_assignments + earnings reset (Wave 70.49) ─────────────
  // Audit gap: `orders.assigned_driver_id` was nulled by cancelOrder
  // (caller's UPDATE) but the separate `driver_assignments` rows were
  // never touched. Symptom: driver pay run could pay out for cancelled
  // gigs; assignment-based dashboards / AvailableJobsCard could keep
  // surfacing the job. Pre-snapshotted earnings columns (base_fee,
  // distance_fee, total_earnings, waiter_earnings) need to be zeroed
  // so payroll roll-ups don't double-count.
  //
  // Filters to non-terminal statuses (anything not already
  // completed/cancelled). Status table has no DB check constraint so
  // freeform 'cancelled' is safe.
  if (mode === "cancel") {
    await tryUpdate("driver_assignments", "cancelled+zeroed", async () => {
      const { count, error } = await sb
        .from("driver_assignments")
        .update({
          status: "cancelled",
          base_fee: 0,
          distance_fee: 0,
          total_earnings: 0,
          waiter_earnings: 0,
          updated_at: nowIso,
        }, { count: "exact" })
        .eq("order_id", orderId)
        .not("status", "in", "(completed,cancelled)");
      return { error, count };
    });
  } else {
    lines.push({ resource: "driver_assignments", action: "skipped (mode!=cancel)" });
  }

  // ── 10. orders.secondary_* nulling (Wave 70.49) ────────────────────
  // Audit gap: cancelOrder's parent UPDATE only nulled assigned_driver_id
  // / assigned_chef_id / assigned_vehicle_id (primary). The
  // secondary_driver_id + secondary_vehicle_id columns (two-driver
  // weddings, swap-vehicle dispatches) survived the cancel. Symptom:
  // ghost-booked secondary driver/vehicle on the next dispatch's
  // availability check -> double-booking on the day. Now nulled here
  // as part of the release cascade.
  if (mode === "cancel") {
    await tryUpdate("orders.secondary_assignments", "nulled", async () => {
      const { count, error } = await sb
        .from("orders")
        .update({
          secondary_driver_id: null,
          secondary_vehicle_id: null,
        }, { count: "exact" })
        .eq("id", orderId);
      return { error, count };
    });
  } else {
    lines.push({ resource: "orders.secondary_assignments", action: "skipped (mode!=cancel)" });
  }

  // ── 7. cleaning_event_handover ─────────────────────────────────────
  if (mode === "cancel") {
    try {
      const { cancelHandoverForOrder } = await import("@/services/cleaningHandoverService");
      await cancelHandoverForOrder(sb, orderId);
      lines.push({ resource: "cleaning_event_handover", action: "cancelled" });
    } catch (e: any) {
      lines.push({ resource: "cleaning_event_handover", action: "failed", error: e?.message || String(e) });
      if (!silent) console.warn("[releaseOrderResources] cleaning handover cancel failed:", e);
    }
  } else {
    lines.push({ resource: "cleaning_event_handover", action: "skipped (mode!=cancel)" });
  }

  // ── 11. Linked quote -> rejected with structured lost_reason (Wave 70.50a) ──
  // Audit gap: a cancelled order's parent quote stayed `accepted`
  // forever, inflating conversion-rate stats permanently (you won the
  // pitch on paper even though the gig never happened). Now: when an
  // order is cancelled, find its quote via orders.quote_id and flip
  // it to status='rejected' + lost_reason='order_cancelled' +
  // rejected_at=now. The won_then_cancelled_quotes view picks these
  // up for the "churned" bucket on the conversion funnel (Wave 70.50b).
  //
  // Only fires on mode='cancel' -- postpone keeps the quote alive
  // (the same event happens on a new date), reject mode doesn't apply
  // (no order to read quote_id from).
  if (mode === "cancel") {
    await tryUpdate("quotes.linked_lost", "rejected", async () => {
      // Need the order's quote_id first. Single-row lookup; tolerant
      // of missing FK (order may have been entered manually without
      // a quote, in which case nothing to flip).
      const { data: orderRow } = await sb
        .from("orders")
        .select("quote_id")
        .eq("id", orderId)
        .maybeSingle();
      const quoteId = (orderRow as any)?.quote_id;
      if (!quoteId) {
        // Treat as a no-op success -- not every order has a quote.
        return { count: 0 };
      }
      // Only flip if quote is still in a non-terminal state. A quote
      // that was already rejected / expired stays as-is so we don't
      // clobber a more-specific lost_reason set by an earlier
      // workflow.
      const { count, error } = await sb
        .from("quotes")
        .update({
          status: "rejected",
          lost_reason: "order_cancelled",
          rejected_at: nowIso,
        }, { count: "exact" })
        .eq("id", quoteId)
        .in("status", ["draft", "sent", "accepted"]);
      return { error, count };
    });
  } else {
    lines.push({ resource: "quotes.linked_lost", action: "skipped (mode!=cancel)" });
  }

  // ── 12. Linked lead -> lost (Wave 70.50a) ───────────────────────────
  // Audit gap: quote-rejection (client decline) DID auto-flip the
  // parent lead to 'lost' (see /api/public/quotes/[token]/reject.ts)
  // but order-cancellation did NOT, leaving an inconsistent state
  // where a "won" lead's order could be cancelled and the lead would
  // still show in the sales scorecard as won. Now: walk lead links
  // via leads.source_order_id and flip to 'lost' +
  // lost_reason='order_cancelled' + lost_at=now.
  if (mode === "cancel") {
    await tryUpdate("leads.linked_lost", "lost", async () => {
      const { count, error } = await sb
        .from("leads")
        .update({
          status: "lost",
          lost_reason: "order_cancelled",
          lost_at: nowIso,
        }, { count: "exact" })
        .eq("source_order_id", orderId)
        // Skip leads already in a terminal state -- don't clobber
        // a manually-set lost_reason or won_at.
        .not("status", "in", "(lost,won)");
      return { error, count };
    });
  } else {
    lines.push({ resource: "leads.linked_lost", action: "skipped (mode!=cancel)" });
  }

  // ── 13. shopping_list_items soft-remove (Wave 70.51a) ──────────────
  // Audit gap (Tier 1 #2 in the cascade audit): shopping list items
  // pushed into a list were the highest perishable-waste leak after
  // hire-in -- operators kept buying groceries for events that no
  // longer existed because there was no order_id linkage. Wave 70.51
  // migration added shopping_list_items.source_order_id + removed_at
  // + removed_reason. Now: soft-remove every un-purchased item tied
  // to this order with reason='order_cancelled'.
  //
  // Soft-remove not hard-delete because:
  //   - Operators may want to see the historical "we WOULD have
  //     bought X" record for cost-of-loss reporting.
  //   - If the cancel is reversed (rare, but happens), restoring is
  //     a single column flip vs re-inserting rows.
  //   - The UI already filters on removed_at IS NULL for the active
  //     shop view.
  //
  // Already-purchased items are left alone -- the spend is sunk; the
  // operator can mark them for re-use or write-off via the usual
  // inventory flow (Wave 70.51b will surface a "consumed for
  // cancelled order X" reconciliation panel).
  if (mode === "cancel" || mode === "reject") {
    await tryUpdate("shopping_list_items", "removed", async () => {
      // `purchased` is nullable in the schema -- `eq("purchased", false)`
      // would skip NULL rows. We need to soft-remove NULL-purchased
      // items too (NULL = "not yet recorded as purchased" = still in
      // the shop queue). Use `.not("purchased", "is", true)` to catch
      // both false AND null.
      const { count, error } = await sb
        .from("shopping_list_items")
        .update({
          removed_at: nowIso,
          removed_reason: "order_cancelled",
        }, { count: "exact" })
        .eq("source_order_id", orderId)
        .is("removed_at", null)
        .not("purchased", "is", true);
      return { error, count };
    });
  } else {
    lines.push({ resource: "shopping_list_items", action: "skipped (mode!=cancel/reject)" });
  }

  // ────────────────────────────────────────────────────────────────────
  // Wave 70.51b hooks land here: Xero original-invoice void (extend
  // the cancel API's existing credit-note push to also void the
  // original invoice in Xero so the catering company's accounting
  // ledger doesn't end up with parallel invoice + credit-note rows).
  // ────────────────────────────────────────────────────────────────────

  return {
    orderId,
    mode,
    lines,
    ms: Date.now() - t0,
  };
}
