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
  // event date. NOTE: 'written_off' is currently the closest enum value
  // for "voided" (Wave 28.9 documented this). Wave 70.51 will add a
  // proper 'voided' enum value and switch this helper to use it.
  if (mode === "cancel") {
    await tryUpdate("invoices", "voided", async () => {
      const { count, error } = await sb
        .from("invoices")
        .update({
          status: "written_off",
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
  if (mode === "cancel") {
    await tryUpdate("outsource_assignments", "cancelled", async () => {
      const { count, error } = await sb
        .from("outsource_assignments")
        .update({ status: "cancelled", cancelled_at: nowIso, updated_at: nowIso }, { count: "exact" })
        .eq("order_id", orderId)
        .in("status", ["requested", "accepted", "en_route", "on_site"])
        .is("deleted_at", null);
      return { error, count };
    });
  } else {
    lines.push({ resource: "outsource_assignments", action: "skipped (mode!=cancel)" });
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

  // ────────────────────────────────────────────────────────────────────
  // Wave 70.49 hooks land here -- driver_assignments cascade,
  // equipment_hire_orders cascade, secondary_*_id nulling helper,
  // outsource provider notification queue. They get appended to this
  // function so cancelOrder() never has to change again.
  // Wave 70.50 hooks: markLinkedQuoteAsLost, lead -> 'lost' flip.
  // Wave 70.51 hooks: shopping_list_items.source_order_id cascade,
  // invoices 'voided' status, Xero original-invoice void.
  // ────────────────────────────────────────────────────────────────────

  return {
    orderId,
    mode,
    lines,
    ms: Date.now() - t0,
  };
}
