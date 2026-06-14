/**
 * POST /api/orders/cancellation-review
 *
 * Admin reviews a pending cancellation/postpone request - approve or
 * reject. Approval kicks off the cancel cascade + refund, OR stamps the
 * postponement on the order for the postpone path.
 *
 * Body:
 *   {
 *     request_id: string,
 *     action: 'approve' | 'reject',
 *     refund_override?: number,  // for cancel-approve only
 *     review_notes?: string
 *   }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { cancelOrder } from "@/services/order/orderWorkflow";
import { sendCancellationEmail, sendPostponementApprovedEmail } from "@/services/email/cancellationEmails";
import { resolveClientUserId } from "@/services/lifecycle/resolveClientUserId";
import { refundService } from "@/services/refundService";
import { withApiLogging } from "@/lib/withApiLogging";


// Send a client-portal notification. Best-effort - failures are
// logged but never block the review action that called us.
async function notifyClient(
  ssr: any,
  params: {
    companyId: string;
    orderId: string;
    requestedByUserId: string | null;
    actorUserId: string;
    notificationType: string;
    title: string;
    message: string;
    priority?: string;
  },
) {
  try {
    const { data: orderRow, error: orderRowErr } = await ssr
      .from("orders")
      .select("client_id")
      .eq("id", params.orderId)
      .maybeSingle();
    if (orderRowErr) {
      console.error("[orders/cancellation-review] orders fetch failed:", orderRowErr);
    }
    const recipientId =
      params.requestedByUserId || (await resolveClientUserId(ssr, (orderRow as any)?.client_id));
    if (!recipientId) return;
    const { notificationService } = await import("@/services/notificationService");
    // Wave 24: dedup so a double-click on Approve / Reject doesn't
    // fire two identical client-side notifications. The window is
    // 60min by default which is plenty wider than any realistic UI
    // misfire and shorter than the gap between distinct legitimate
    // reviews on the same order (e.g. operator approves cancel,
    // changes mind, re-opens, re-cancels - they want the new row).
    await notificationService.createNotification({
      company_id: params.companyId,
      recipient_id: recipientId,
      user_id: params.actorUserId,
      notification_type: params.notificationType,
      title: params.title,
      message: params.message,
      priority: params.priority || "normal",
      link: `/client-portal/my-orders?orderId=${params.orderId}`,
      related_entity_type: "order",
      related_entity_id: params.orderId,
      dedup: true,
    });
  } catch (e) {
    console.warn("[cancellation-review] notify failed:", e);
  }
}

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
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
      console.error("[orders/cancellation-review] profiles fetch failed:", profileErr);
    }
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }

    const body = (req.body || {}) as any;
    const request_id = String(body.request_id || "");
    const action = String(body.action || "");
    const review_notes = body.review_notes ? String(body.review_notes) : null;
    const refund_override =
      body.refund_override !== undefined ? Number(body.refund_override) : null;

    if (!request_id || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid request_id or action" });
    }

    // Wave 32: pull policy_snapshot too so we can read the
    // _payout_choice + _credit_amount sidecar the wizard wrote on
    // submission. Without this, an operator approving an
    // inside-window cancellation always issues a refund - ignoring
    // the client's choice of credit - so the catering company's
    // cashflow nudge from Wave 28 silently doesn't work.
    const { data: request, error: requestErr } = await ssr
      .from("cancellation_requests")
      .select("id, order_id, company_id, request_type, requested_postpone_date, status, refund_amount_calculated, reason, requested_by_user_id, policy_snapshot")
      .eq("id", request_id)
      .maybeSingle();
    if (requestErr) {
      console.error("[orders/cancellation-review] cancellation_requests fetch failed:", requestErr);
    }
    if (!request) return res.status(404).json({ error: "Request not found" });
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
      await ssr.from("cancellation_requests").update({
        status: "rejected",
        reviewed_by_user_id: user.id,
        reviewed_at: nowIso,
        review_notes,
      } as any).eq("id", request_id);

      const isPostpone = (request as any).request_type === "postpone";

      // Wave 24: cross-cutting audit_logs entry. Mirrors the amendment-
      // review pattern. Without this the platform-wide audit feed had
      // no record of WHO declined a cancellation / postponement --
      // problematic for compliance + dispute resolution. Best-effort.
      try {
        await (ssr as any).from("audit_logs").insert({
          company_id: (request as any).company_id,
          user_id: user.id,
          action: isPostpone ? "postponement_rejected" : "cancellation_rejected",
          entity_type: "order",
          entity_id: (request as any).order_id,
          details: {
            request_id,
            request_type: (request as any).request_type,
            review_notes: review_notes || null,
            requested_by_user_id: (request as any).requested_by_user_id || null,
          },
        });
      } catch (auditErr) {
        console.warn("[cancellation-review] audit_logs reject insert failed:", auditErr);
      }

      await notifyClient(ssr, {
        companyId: (request as any).company_id,
        orderId: (request as any).order_id,
        requestedByUserId: (request as any).requested_by_user_id || null,
        actorUserId: user.id,
        notificationType: isPostpone ? "postponement_rejected" : "cancellation_rejected",
        title: isPostpone ? "Postponement declined" : "Cancellation declined",
        message: review_notes
          ? `We couldn't approve the request. Reason from the team: ${review_notes}`
          : "We couldn't approve the request. Please get in touch and we'll work it out.",
        priority: "high",
      });

      return res.status(200).json({ ok: true, action: "rejected" });
    }

    // ---- Approve path -----------------------------------------------------

    if ((request as any).request_type === "postpone") {
      // Wave 21 audit: postpone-approve used to silently skip the
      // event_date update if requested_postpone_date was null --
      // operator clicked Approve, the cancellation_request flipped to
      // approved + the client got a "your postponement is confirmed"
      // notification, but the order date didn't move. Chef + driver
      // showed up at the original date. Make the date a hard
      // requirement on approve unless the operator explicitly opts
      // out via skip_date_change=true (admin override - e.g. they're
      // approving conceptually and will follow up by phone with a
      // date later).
      const skipDateChange = body.skip_date_change === true;
      const requestedDate = (request as any).requested_postpone_date as string | null;
      if (!requestedDate && !skipDateChange) {
        return res.status(400).json({
          error: "This postpone request has no proposed new date. Either ask the client for a date, set one in the dialog, or pass skip_date_change=true to approve without moving the event.",
        });
      }
      // Stamp the postponement onto the order. The agreed new date
      // moves event_date when present; the original date is captured
      // for audit so a "we postponed FROM X TO Y" trail survives.
      const { data: order, error: orderErr2 } = await ssr
        .from("orders")
        .select("event_date")
        .eq("id", (request as any).order_id)
        .maybeSingle();
      if (orderErr2) {
        console.error("[orders/cancellation-review] orders fetch failed:", orderErr2);
      }
      const originalDate = (order as any)?.event_date || null;

      const updates: any = {
        postponed_at: nowIso,
        postponed_from_date: originalDate,
      };
      if (requestedDate) {
        updates.event_date = requestedDate;
      }

      const { error: orderErr } = await ssr.from("orders").update(updates).eq("id", (request as any).order_id);
      if (orderErr) return res.status(500).json({ error: orderErr.message });

      await ssr.from("cancellation_requests").update({
        status: "approved",
        reviewed_by_user_id: user.id,
        reviewed_at: nowIso,
        review_notes,
        applied_at: nowIso,
      } as any).eq("id", request_id);

      // Wave 18 audit: postpone-approval used to ONLY stamp the new
      // event_date on the order. Kitchen prep tasks, equipment_bookings,
      // collection driver_assignments and the queued pre-event email
      // reminders all stayed pinned to the ORIGINAL date. Chef showed
      // up at the wrong site, vehicle was double-booked, client got
      // "see you tomorrow!" the day before an event that wasn't
      // happening. Cascade the new date through every linked artefact
      // so the postpone actually means what it says.
      if (updates.event_date && originalDate && updates.event_date !== originalDate) {
        const newEventIso = String(updates.event_date);
        const oldEventIso = String(originalDate);
        const dayMs = 86400000;
        const drift = (new Date(newEventIso).getTime() - new Date(oldEventIso).getTime()) || 0;
        // Equipment bookings - shift the booked window by the same
        // delta so the availability calculator releases the old date
        // and reserves the new one. Window shape stays intact.
        try {
          const { data: bookings } = await ssr
            .from("equipment_bookings")
            .select("id, booked_from, booked_until")
            .eq("order_id", (request as any).order_id)
            .in("status", ["booked", "in_use", "planned"]);
          for (const b of (bookings || []) as any[]) {
            const newFrom = b.booked_from ? new Date(new Date(b.booked_from).getTime() + drift).toISOString() : null;
            const newUntil = b.booked_until ? new Date(new Date(b.booked_until).getTime() + drift).toISOString() : null;
            await ssr
              .from("equipment_bookings")
              .update({ booked_from: newFrom, booked_until: newUntil } as any)
              .eq("id", b.id);
          }
        } catch (e) {
          console.warn("[postpone] equipment_bookings shift failed:", e);
        }
        // Vehicle bookings - same shift logic.
        try {
          const { data: vbookings } = await ssr
            .from("vehicle_bookings")
            .select("id, booked_from, booked_until")
            .eq("order_id", (request as any).order_id)
            .in("status", ["planned", "on_route"]);
          for (const b of (vbookings || []) as any[]) {
            const newFrom = b.booked_from ? new Date(new Date(b.booked_from).getTime() + drift).toISOString() : null;
            const newUntil = b.booked_until ? new Date(new Date(b.booked_until).getTime() + drift).toISOString() : null;
            await ssr
              .from("vehicle_bookings")
              .update({ booked_from: newFrom, booked_until: newUntil } as any)
              .eq("id", b.id);
          }
        } catch (e) {
          console.warn("[postpone] vehicle_bookings shift failed:", e);
        }
        // Driver collection assignment - shift scheduled_for.
        try {
          const { data: assigns } = await ssr
            .from("driver_assignments")
            .select("id, scheduled_for")
            .eq("order_id", (request as any).order_id)
            .neq("status", "completed");
          for (const a of (assigns || []) as any[]) {
            if (!a.scheduled_for) continue;
            const newScheduled = new Date(new Date(a.scheduled_for).getTime() + drift).toISOString();
            await ssr
              .from("driver_assignments")
              .update({ scheduled_for: newScheduled } as any)
              .eq("id", a.id);
          }
        } catch (e) {
          console.warn("[postpone] driver_assignments shift failed:", e);
        }
        // Queued pre-event reminders - cancel the old ones, the
        // ensureScheduledPreEventReminders cron will queue fresh ones
        // against the new event_date the next time the order is
        // touched. We don't try to recompute them inline here because
        // the original sender uses a fully-rendered email body and
        // recomputing it server-side would diverge from the queued
        // copy.
        //
        // A.13 #3 (2026-05-18 sweep): two drift bugs on this UPDATE.
        // (1) `updated_at` is not a column on outgoing_email_queue
        //     (schema only has created_at + sent_at + paused_at +
        //     scheduled_for) so the write PGRST204'd every time.
        // (2) the status filter was 'pending' which isn't in the
        //     queue's CHECK (queued, in_progress, paused, sent,
        //     failed, cancelled). Postponed events were therefore
        //     leaving the original pre-event reminders queued
        //     against the old date and clients got the wrong-day
        //     "see you tomorrow!" emails after a postpone.
        try {
          // TIGHTEN I.65 (2026-06-01): the prior version only
          // cancelled queued rows where trigger_event='pre_event'.
          // Aftersales rows (template_type starting 'aftersales_*',
          // scheduled at event_date + N months) were left pointing
          // at the old date - a client whose event was pushed out 6
          // months would still get "how did your event last week
          // go?" emails on the original date. Also balance reminders
          // and any other queued, order-scoped row stamped from
          // event_date drift. Now: cancel ALL queued/paused rows
          // tied to this order so the next confirm / propagateQuote
          // cycle re-queues them against the new date.
          await ssr
            .from("outgoing_email_queue")
            .update({ status: "cancelled" } as any)
            .eq("trigger_ref_id", (request as any).order_id)
            .in("status", ["queued", "paused"]);
        } catch (e) {
          console.warn("[postpone] queued email cancel failed:", e);
        }
        // Kitchen prep tasks - delete the existing rows for this
        // order; ensurePrepTasksForOrder will regenerate them against
        // the new event_date the next time the order is touched.
        try {
          await ssr
            .from("kitchen_prep_tasks")
            .delete()
            .eq("order_id", (request as any).order_id)
            .neq("status", "completed");
        } catch (e) {
          console.warn("[postpone] kitchen_prep_tasks delete failed:", e);
        }
        // TIGHTEN I.65: kick the kitchen prep regen explicitly so
        // there's no window where the order has no prep tasks for the
        // new date. Was relying on "the next time the order is
        // touched", which could be hours.
        try {
          const { kitchenPrepService } = await import("@/services/kitchenPrepService");
          await (kitchenPrepService as any).ensurePrepTasksForOrder(
            (request as any).company_id,
            (request as any).order_id,
            user.id,
            undefined,
            { force: true },
          );
        } catch (e) {
          console.warn("[postpone] kitchen prep regen failed:", e);
        }
      }

      void sendPostponementApprovedEmail((request as any).order_id, updates.event_date || null);

      // Wave 24: audit_logs entry for postponement approval. Captures
      // who approved + the new event date so disputes about "we never
      // moved the event" have a clear trail.
      try {
        await (ssr as any).from("audit_logs").insert({
          company_id: (request as any).company_id,
          user_id: user.id,
          action: "postponement_approved",
          entity_type: "order",
          entity_id: (request as any).order_id,
          details: {
            request_id,
            new_event_date: updates.event_date || null,
            skip_date_change: skipDateChange,
            review_notes: review_notes || null,
            requested_by_user_id: (request as any).requested_by_user_id || null,
          },
        });
      } catch (auditErr) {
        console.warn("[cancellation-review] audit_logs postpone insert failed:", auditErr);
      }

      await notifyClient(ssr, {
        companyId: (request as any).company_id,
        orderId: (request as any).order_id,
        requestedByUserId: (request as any).requested_by_user_id || null,
        actorUserId: user.id,
        notificationType: "postponement_approved",
        title: "Postponement approved",
        message: updates.event_date
          ? `Your event has been moved to ${updates.event_date}. Open your order to confirm the details.`
          : "Your postponement was approved. We'll be in touch to lock in the new date.",
      });

      return res.status(200).json({
        ok: true,
        action: "postponed",
        new_event_date: updates.event_date || null,
      });
    }

    // request_type === 'cancel'
    // Pull a fresh refund snapshot so policy changes between request +
    // review are picked up.
    const { data: snapshot, error: snapErr } = await ssr.rpc("get_refund_for_order", {
      p_order_id: (request as any).order_id,
    });
    if (snapErr) return res.status(500).json({ error: snapErr.message });
    const snap = (snapshot as any) || {};
    const refund_calc = Number(snap.refund_amount) || 0;
    // Wave 21 audit: refund_override used to accept any non-negative
    // number, including amounts larger than what the client actually
    // paid. An admin slip-up (or a copy-paste of the order total
    // instead of the deposit) could refund more than the company
    // had collected - a real loss given PayFast/Yoco fire the gateway
    // refund as soon as the row hits the ledger. Cap at total_amount_paid
    // from the snapshot so the override can only ever DECREASE the
    // calculated refund (never inflate it). Negative inputs still rejected.
    const totalPaid = Number(snap.total_amount_paid || 0);
    const refund_final = (() => {
      if (refund_override === null) return refund_calc;
      if (!Number.isFinite(refund_override) || refund_override < 0) return refund_calc;
      const capped = Math.min(refund_override, totalPaid);
      return Number(capped.toFixed(2));
    })();
    if (refund_override !== null && refund_override > totalPaid + 0.01) {
      console.warn(
        "[cancellation-review] refund_override exceeded total_paid; capped",
        { request_id, override: refund_override, total_paid: totalPaid, capped_to: refund_final },
      );
    }

    const cancelResult = await cancelOrder((request as any).order_id, {
      reason: (request as any).reason || review_notes || "Client-requested cancellation",
      reason_category: "client_cancelled",
      cancelled_by_user_id: user.id,
      client: ssr,
    });
    if (!cancelResult.success) {
      return res.status(500).json({ error: cancelResult.error || "Cancel failed" });
    }

    // Tell the assigned staff to stand down. releaseResources (inside
    // cancelOrder) reverses the DB allocations - prep tasks, equipment +
    // vehicle bookings, driver assignments - but never told the people
    // actually working the job. Broadcast to the ops roles + admins so
    // no one shows up for a cancelled event. Best-effort, service client.
    try {
      const { data: ordRow } = await ssr
        .from("orders")
        .select("order_number")
        .eq("id", (request as any).order_id)
        .maybeSingle();
      const orderLabel = (ordRow as any)?.order_number || String((request as any).order_id).slice(0, 8);
      const { notificationService } = await import("@/services/notificationService");
      await notificationService.broadcastNotification({
        companyId: (request as any).company_id,
        type: "cancellation_approved",
        title: "Order cancelled - stand down",
        message: `Order ${orderLabel} has been cancelled. Any prep, delivery or cleaning for it is off.`,
        targetRoles: ["kitchen_staff", "driver", "cleaning_staff", "company_admin", "admin", "owner", "super_admin"] as any,
        priority: "high",
        link: `/admin/orders?orderId=${(request as any).order_id}`,
        relatedEntityType: "order",
        relatedEntityId: (request as any).order_id,
        dedup: true,
      }, ssr);
    } catch (notifyErr) {
      console.warn("[cancellation-review] staff stand-down notification failed:", notifyErr);
    }

    await ssr.from("cancellation_requests").update({
      status: "approved",
      reviewed_by_user_id: user.id,
      reviewed_at: nowIso,
      review_notes,
      applied_at: nowIso,
      refund_amount_calculated: refund_calc,
      refund_amount_approved: refund_final,
      policy_snapshot: snap.policy_snapshot ?? snap,
    } as any).eq("id", request_id);

    // Wave 32: branch on the wizard's stored payout_choice. The
    // sidecar lives in the request's policy_snapshot (written when
    // the request was first submitted via the magic-link or auth-
    // portal endpoint). Defaults to 'refund' for legacy requests
    // submitted before Wave 28.5 that have no sidecar.
    const stored_snapshot: any = (request as any).policy_snapshot || {};
    const wizard_payout_choice: "refund" | "credit" =
      stored_snapshot._payout_choice === "credit" ? "credit" : "refund";
    const wizard_credit_amount: number =
      Number(stored_snapshot._credit_amount) || 0;
    const wizard_committed_cost_note: string | null =
      stored_snapshot._committed_cost_note || null;

    // Derive a server-trusted credit amount from the fresh policy
    // snapshot (in case the policy changed between request and
    // review, or the wizard is on an old client). Mirrors the same
    // math runAutoCancel uses.
    const bonus_pp = Math.max(
      0,
      Math.min(100, Number((snap.policy_snapshot as any)?.credit_bonus_pct ?? 10)),
    );
    const credit_pct = Math.min(100, (Number(snap.refund_pct) || 0) + bonus_pp);
    const derived_credit = Math.round(
      Math.max(
        Number(snap.deposit_paid_amount) || 0,
        Number(snap.total_amount_paid) || 0,
      ) * (credit_pct / 100) * 100,
    ) / 100;
    const credit_final =
      wizard_credit_amount > 0 ? wizard_credit_amount : derived_credit;

    let refundPaymentId: string | null = null;
    let creditPaymentId: string | null = null;
    let refundStatus: "auto_processed" | "pending_manual" | "auto_failed" | null = null;

    if (wizard_payout_choice === "credit" && credit_final > 0) {
      // Issue store credit - mirrors the runAutoCancel +
      // /api/orders/[id]/cancel admin-side credit branch.
      const { data: ord, error: ordErr } = await ssr
        .from("orders")
        .select("client_id")
        .eq("id", (request as any).order_id)
        .maybeSingle();
      if (ordErr) {
        console.error("[orders/cancellation-review] orders fetch failed:", ordErr);
      }
      const { data: credRow } = await (ssr as any).from("payments").insert({
        company_id: (request as any).company_id,
        order_id: (request as any).order_id,
        client_id: (ord as any)?.client_id || null,
        payment_type: "credit_issue",
        amount: credit_final,
        payment_status: "completed",
        reason: `Cancellation credit (client-requested, ${snap.tier_label || "tier"}, ${credit_pct}% of paid${
          bonus_pp > 0 ? ` - includes ${bonus_pp}pp goodwill bonus` : ""
        })`,
        created_by_user_id: user.id,
        cancellation_request_id: request_id,
      }).select("id").single();
      creditPaymentId = (credRow as any)?.id || null;
      // Order is reconciled via credit - nothing further owed.
      await ssr.from("orders").update({
        payment_status: "refunded",
      } as any).eq("id", (request as any).order_id);
      try {
        await (ssr as any).from("audit_logs").insert({
          company_id: (request as any).company_id,
          order_id: (request as any).order_id,
          user_id: user.id,
          action: "cancellation_credit_issued",
          entity_type: "payments",
          entity_id: creditPaymentId,
          details: {
            credit_amount: credit_final,
            credit_pct,
            bonus_pp,
            tier_label: snap.tier_label,
            requested_by: "client",
            via: "review",
            committed_cost_note: wizard_committed_cost_note,
          },
        });
      } catch (e) {
        console.warn("[cancellation-review] credit audit failed:", e);
      }
    } else if (wizard_payout_choice === "refund" && refund_final > 0) {
      // Phase 2A migrated reads to payment_status; Phase 4B drops the legacy text column.
      const { data: payRow } = await ssr.from("payments").insert({
        company_id: (request as any).company_id,
        order_id: (request as any).order_id,
        payment_type: "refund",
        amount: refund_final,
        payment_status: "pending",
        reason: `Cancellation refund (client-requested, ${snap.refund_pct ?? 0}% of paid)`,
        created_by_user_id: user.id,
        cancellation_request_id: request_id,
      } as any).select("id").single();
      refundPaymentId = (payRow as any)?.id || null;

      // Auto-route through PayFast when the parent capture was via
      // PayFast. EFT / cash / manual stay pending for the existing
      // /admin/refunds mark-paid flow. Awaited so the operator's
      // response reflects what actually happened.
      if (refundPaymentId) {
        try {
          const refundResult = await refundService.processRefund(refundPaymentId, user.id);
          if (refundResult.status === "auto_processed") {
            refundStatus = "auto_processed";
          } else if (refundResult.status === "auto_failed") {
            refundStatus = "auto_failed";
          } else {
            // pending_manual / already_completed / error -> all surface
            // to the operator as pending so finance can decide.
            refundStatus = "pending_manual";
          }
        } catch (e) {
          console.warn("[cancellation-review] refundService threw:", e);
          refundStatus = "pending_manual";
        }
      }

      // Flow audit Leg C P0-6: order.payment_status used to flip to
      // 'refunded' / 'partially_refunded' BEFORE processRefund ran.
      // If PayFast then refused the refund (auto_failed), the order
      // stayed stamped as refunded even though the money was still
      // sitting with the merchant. Now we only mark the order
      // refunded when the refund actually settled (auto_processed)
      // or the operator explicitly opted into a manual EFT
      // (pending_manual). On auto_failed we leave payment_status
      // alone so the retry flow at /admin/refunds shows the order
      // as still paid, matching reality.
      if (refundStatus === "auto_processed" || refundStatus === "pending_manual") {
        await ssr.from("orders").update({
          payment_status: refund_final >= Number(snap.total_amount_paid || 0)
            ? "refunded"
            : "partially_refunded",
        } as any).eq("id", (request as any).order_id);
      }
    }

    // Wave 32: email variant follows the wizard payout choice. Was
    // always firing the refund-paragraph variant - so a client who
    // chose credit got a "your refund of R0 is being processed"
    // email instead of "we've added R485 to your account."
    if (wizard_payout_choice === "credit" && credit_final > 0) {
      void sendCancellationEmail((request as any).order_id, 0, {
        creditAmount: credit_final,
      });
    } else {
      void sendCancellationEmail((request as any).order_id, refund_final);
    }

    // Wave 24: audit_logs entry for the cancellation approval. The
    // most money-critical decision in this whole flow - captures
    // who approved + the refund snapshot (calculated, override,
    // final, payment_id, status). Disputes about "we never agreed
    // to that refund amount" or "PayFast says the refund failed but
    // your system shows refunded" need this trail to resolve.
    try {
      await (ssr as any).from("audit_logs").insert({
        company_id: (request as any).company_id,
        user_id: user.id,
        action: "cancellation_approved",
        entity_type: "order",
        entity_id: (request as any).order_id,
        details: {
          request_id,
          refund_calculated: refund_calc,
          refund_override: refund_override,
          refund_final,
          total_amount_paid: totalPaid,
          refund_payment_id: refundPaymentId,
          refund_status: refundStatus,
          review_notes: review_notes || null,
          requested_by_user_id: (request as any).requested_by_user_id || null,
        },
      });
    } catch (auditErr) {
      console.warn("[cancellation-review] audit_logs cancel insert failed:", auditErr);
    }

    await notifyClient(ssr, {
      companyId: (request as any).company_id,
      orderId: (request as any).order_id,
      requestedByUserId: (request as any).requested_by_user_id || null,
      actorUserId: user.id,
      notificationType: "cancellation_approved",
      title: "Cancellation approved",
      message: refund_final > 0
        ? `Your order is cancelled. A refund of R${refund_final.toFixed(2)} is on the way.`
        : "Your order is cancelled. No refund applies under our cancellation policy.",
    });

    return res.status(200).json({
      ok: true,
      action: "cancelled",
      refund_amount: refund_final,
      refund_payment_id: refundPaymentId,
      refund_status: refundStatus,
    });
  } catch (err: any) {
    console.error("[cancellation-review] crashed:", err);
    return res.status(500).json({ error: err?.message || "Cancellation review failed" });
  }
}

export default withApiLogging(handler);
