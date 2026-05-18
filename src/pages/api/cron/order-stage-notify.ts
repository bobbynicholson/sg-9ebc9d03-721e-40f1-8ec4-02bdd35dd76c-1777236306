/**
 * GET /api/cron/order-stage-notify
 *
 * Wave 45 T3 - per-stage notification engine.
 *
 * Walks every active order across every tenant. Computes the
 * OrderTimeline (the same 22-stage derivation /admin/orders uses)
 * and compares the resolved currentStageKey against the
 * orders.last_notified_stage_key snapshot column.
 *
 * On change: broadcasts an `order_stage_advance` notification to
 * the company's admin/owner roles, then updates the snapshot
 * column so the next run only fires on the next transition.
 *
 * Also detects cross-system blockers (Wave 44 T2 - equipment
 * stuck in cleaning, no driver shift covers dispatch) and
 * broadcasts a separate `order_stage_blocked` notification with a
 * 6h dedup window.
 *
 * Schedule: Vercel cron every 15 minutes (added to vercel.json).
 *
 * Auth: CRON_SECRET-gated identical to the other Wave 36/40
 * cron workers.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { computeOrderTimeline } from "@/services/order/orderTimeline";

const STAGE_ADVANCE_TYPE = "order_stage_advance";
const STAGE_BLOCKED_TYPE = "order_stage_blocked";

// Active = anything between booking and post-event. We skip
// pending (still being shaped), cancelled (dead), and completed
// (no further transitions interesting to alert on).
const ACTIVE_STATUSES = ["confirmed", "preparing", "ready", "in_transit", "delivered"] as const;

// Bound the per-run order count so a slow tenant doesn't blow the
// 60-second Vercel cron budget. 300 orders * 8 batch queries ~=
// well within budget; raise if observed.
const MAX_ORDERS_PER_RUN = 300;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (expected && auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const supabase: any = getServiceSupabase();

  // 1. Pull active orders across all tenants. Service role bypasses
  // RLS - intentional, the cron operates globally and broadcasts
  // back into per-tenant notification streams.
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    // Wave 45 hotfix: include every order field the timeline
    // resolvers reference. The previous SELECT was missing
    // quote_id which made the quote_accepted resolver always
    // return 'upcoming' (because o.quote_id was undefined), so
    // the walker assigned every confirmed order to current
    // stage = quote_accepted. Net effect: the snapshot column
    // ended up wedged at 'quote_accepted' for every order.
    .select(
      "id, company_id, region_id, status, event_date, event_time, order_number, last_notified_stage_key, last_notified_stage_at, quote_id, deposit_paid, deposit_paid_at, deposit_amount, balance_paid, balance_paid_at, balance_amount, balance_due_date, confirmed_at, picked_up_at, delivered_at, ready_at, completed_at, prep_started_at, total_amount, assigned_driver_id, driver_name, equipment_return_method, pod_photo_url, pod_recipient_name, created_at, updated_at",
    )
    .in("status", ACTIVE_STATUSES as unknown as string[])
    .is("deleted_at", null)
    .order("event_date", { ascending: true })
    .limit(MAX_ORDERS_PER_RUN);
  if (ordersErr) {
    console.error("[cron/order-stage-notify] orders fetch failed:", ordersErr);
    return res.status(500).json({ error: ordersErr.message });
  }
  if (!orders || orders.length === 0) {
    return res.status(200).json({ ok: true, checked: 0 });
  }

  const orderIds = (orders as Array<{ id: string }>).map((o) => o.id);

  // 2. Batch-fetch every related row-set computeOrderTimeline
  // needs. Same 8 queries /admin/orders fires + the 2 W44 T2
  // additions for cross-system blockers.
  // HOTFIX: Wave 45 D3 dropped equipment_cleaning_status. The
  // /admin/orders batch loader already passes equipmentCleaningStatus: []
  // to computeOrderTimeline - mirror that here. Without this fix the
  // cron 500s on every run because the table no longer exists.
  const [
    paymentsRes,
    bookingsRes,
    hireRes,
    prepRes,
    assignmentsRes,
    invoicesRes,
    emailLogRes,
    deliveryShiftsRes,
  ] = await Promise.all([
    supabase.from("payments").select("order_id, payment_type, status, processed_at, amount, payment_method, receipt_sent_at").in("order_id", orderIds),
    supabase.from("equipment_bookings").select("order_id, equipment_id, status, returned_quantity, pre_event_cleaning_done_at").in("order_id", orderIds),
    supabase.from("equipment_hire_orders").select("order_id, supplier_name, expected_pickup_date, actual_pickup_date, expected_return_date, actual_return_date, status, created_at").in("order_id", orderIds),
    supabase.from("kitchen_prep_tasks").select("order_id, status, started_at, completed_at").in("order_id", orderIds),
    supabase.from("driver_assignments").select("order_id, assignment_type, status, accepted_at, started_at, completed_at, created_at").in("order_id", orderIds),
    supabase.from("invoices").select("id, order_id, invoice_number, total_amount, sent_at, paid_at, status, balance_due, created_at, invoice_date").in("order_id", orderIds),
    supabase.from("email_automation_log").select("order_id, template_type, status, sent_at, created_at").in("order_id", orderIds),
    supabase
      .from("kitchen_shifts")
      .select("id, order_id, staff_id, planned_start, actual_start")
      .in("order_id", orderIds)
      .eq("shift_type", "delivery")
      .is("deleted_at", null),
  ]);

  // Cross-system blocker T2: pull active cleaning_jobs for any
  // equipment booked across this batch.
  const equipmentIds = Array.from(
    new Set(
      ((bookingsRes.data || []) as Array<{ equipment_id?: string | null }>)
        .map((b) => b.equipment_id)
        .filter((x): x is string => typeof x === "string"),
    ),
  );
  let cleaningJobsActiveRows: Array<{ equipment_id: string; equipment_name?: string | null; status?: string }> = [];
  if (equipmentIds.length > 0) {
    const { data: cjRaw, error: cjErr } = await supabase
      .from("cleaning_jobs")
      .select("equipment_id, status")
      .in("equipment_id", equipmentIds)
      .in("status", ["queued", "in_progress"])
      .is("deleted_at", null);
    if (cjErr) console.error("[cron/order-stage-notify] cleaning_jobs failed:", cjErr);
    const eqIdsInJobs = Array.from(
      new Set(((cjRaw || []) as Array<{ equipment_id: string }>).map((r) => r.equipment_id)),
    );
    const eqNameMap = new Map<string, string>();
    if (eqIdsInJobs.length > 0) {
      const { data: eqRaw, error: eqErr } = await supabase
        .from("equipment")
        .select("id, name")
        .in("id", eqIdsInJobs);
      if (eqErr) console.error("[cron/order-stage-notify] equipment names failed:", eqErr);
      for (const e of (eqRaw || []) as Array<{ id: string; name: string | null }>) {
        if (e.name) eqNameMap.set(e.id, e.name);
      }
    }
    cleaningJobsActiveRows = ((cjRaw || []) as Array<{ equipment_id: string; status: string }>).map((r) => ({
      equipment_id: r.equipment_id,
      equipment_name: eqNameMap.get(r.equipment_id) || null,
      status: r.status,
    }));
  }

  const bucket = <T extends { order_id?: string | null }>(rows: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const r of rows || []) {
      const key = String(r.order_id || "");
      if (!key) continue;
      const arr = m.get(key);
      if (arr) arr.push(r); else m.set(key, [r]);
    }
    return m;
  };
  const paymentsByOrder = bucket(paymentsRes.data as any[] | null);
  const bookingsByOrder = bucket(bookingsRes.data as any[] | null);
  const hireByOrder = bucket(hireRes.data as any[] | null);
  const prepByOrder = bucket(prepRes.data as any[] | null);
  const assignmentsByOrder = bucket(assignmentsRes.data as any[] | null);
  const invoicesByOrder = bucket(invoicesRes.data as any[] | null);
  const emailLogByOrder = bucket(emailLogRes.data as any[] | null);
  const deliveryShiftsByOrder = bucket(deliveryShiftsRes.data as any[] | null);

  // Wave 46 T1 - batch-fetch tenant timezones for every distinct
  // company in this run so the per-order timeline urgency tier
  // buckets by calendar day in the operator's wall clock, not the
  // server's UTC clock.
  const distinctCompanyIds = Array.from(
    new Set(
      (orders as Array<{ company_id?: string | null }>)
        .map((o) => o.company_id)
        .filter((c): c is string => !!c),
    ),
  );
  const tenantTzByCompany = new Map<string, string | null>();
  if (distinctCompanyIds.length > 0) {
    const { data: tzRows, error: tzErr } = await supabase
      .from("companies")
      .select("id, timezone")
      .in("id", distinctCompanyIds);
    if (tzErr) console.error("[cron/order-stage-notify] timezone fetch failed:", tzErr);
    for (const r of (tzRows || []) as Array<{ id: string; timezone: string | null }>) {
      tenantTzByCompany.set(r.id, r.timezone);
    }
  }

  // 3. Per-order: compute timeline, compare to snapshot, fire +
  // update if changed.
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  let advanceFired = 0;
  let blockerFired = 0;
  let unchanged = 0;
  const errors: string[] = [];

  // Lazy-import notificationService once - module-level import
  // avoided to skip its init cost when there's nothing to fire.
  let notificationService: any = null;
  const ensureNotif = async () => {
    if (notificationService) return notificationService;
    const mod = await import("@/services/notificationService");
    notificationService = (mod as any).notificationService;
    return notificationService;
  };

  for (const o of orders as Array<any>) {
    try {
      const orderEqIds = new Set<string>(
        (bookingsByOrder.get(o.id) || [])
          .map((b: any) => b.equipment_id)
          .filter((x: any): x is string => typeof x === "string"),
      );
      const cleaningJobsActive = cleaningJobsActiveRows.filter((r) =>
        orderEqIds.has(r.equipment_id),
      );

      const tl = computeOrderTimeline({
        order: o,
        payments: paymentsByOrder.get(o.id) || [],
        equipmentBookings: bookingsByOrder.get(o.id) || [],
        equipmentHireOrders: hireByOrder.get(o.id) || [],
        equipmentCleaningStatus: [],
        kitchenPrepTasks: prepByOrder.get(o.id) || [],
        driverAssignments: assignmentsByOrder.get(o.id) || [],
        invoices: invoicesByOrder.get(o.id) || [],
        emailLog: emailLogByOrder.get(o.id) || [],
        cleaningJobsActive,
        deliveryShifts: deliveryShiftsByOrder.get(o.id) || [],
        quoteAccepted: true,
        // Wave 46 T1 - pass per-order tenant tz so the urgency
        // tier (today/tomorrow/soon) matches what each operator
        // sees on their /admin/orders page.
        tenantTimezone: tenantTzByCompany.get(o.company_id) || null,
      });

      const currentKey = tl.currentStageKey;
      const lastKey = (o as any).last_notified_stage_key as string | null;

      // ---- Stage-advance notification ----
      // HOTFIX (Wave 45 follow-up):
      //   1. First-run silence: when lastKey is NULL (we've never
      //      broadcast for this order), snapshot the current stage
      //      WITHOUT firing - otherwise the first run after deploy
      //      blasts admins with one notification per active order.
      //   2. Directional check: only fire when the stage moved
      //      FORWARD (current index > last index). A payment refund
      //      can flip currentStageKey backwards; we don't want to
      //      broadcast "advanced to <earlier stage>" - it's confusing
      //      and unactionable.
      if (currentKey && currentKey !== lastKey) {
        const stageOrder: string[] = tl.stages.map((s) => s.key as string);
        const currentIdx = stageOrder.indexOf(currentKey as string);
        const lastIdx = lastKey ? stageOrder.indexOf(lastKey) : -1;
        const isForward = lastKey === null ? false : currentIdx > lastIdx;
        const isFirstRun = lastKey === null;

        if (isFirstRun) {
          // Silent snapshot. Future stage-advance is then properly
          // detected against this baseline.
          const { error: snapErr } = await supabase
            .from("orders")
            .update({
              last_notified_stage_key: currentKey,
              last_notified_stage_at: new Date().toISOString(),
            })
            .eq("id", o.id);
          if (snapErr) {
            errors.push(`${o.id}: first-run snapshot failed: ${snapErr.message}`);
          }
          unchanged += 1;
        } else if (isForward) {
          try {
            const ns = await ensureNotif();
            const stageLabel = tl.stages.find((s) => s.key === currentKey)?.label || currentKey;
            const orderLabel = o.order_number || String(o.id).slice(0, 8);
            await ns.broadcastNotification({
              companyId: o.company_id,
              regionId: o.region_id || null,
              targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
              title: `Order ${orderLabel} -> ${stageLabel}`,
              message: `${orderLabel} pipeline advanced to "${stageLabel}". Event ${o.event_date || "TBD"}.`,
              type: STAGE_ADVANCE_TYPE,
              priority: tl.urgency === "today" || tl.urgency === "overdue" ? "high" : "normal",
              link: `/admin/orders?orderId=${o.id}`,
              relatedEntityType: "order",
              relatedEntityId: o.id,
              metadata: {
                stage_key: currentKey,
                previous_stage_key: lastKey,
                urgency: tl.urgency,
              } as any,
            });
            const { error: updErr } = await supabase
              .from("orders")
              .update({
                last_notified_stage_key: currentKey,
                last_notified_stage_at: new Date().toISOString(),
              })
              .eq("id", o.id);
            if (updErr) {
              errors.push(`${o.id}: snapshot update failed: ${updErr.message}`);
            } else {
              advanceFired += 1;
            }
          } catch (broadcastErr: any) {
            errors.push(`${o.id}: stage_advance broadcast failed: ${broadcastErr?.message || broadcastErr}`);
          }
        } else {
          // Stage moved backwards (e.g. payment refund). Update the
          // snapshot silently so we don't keep noticing on every run,
          // but don't broadcast.
          const { error: backErr } = await supabase
            .from("orders")
            .update({
              last_notified_stage_key: currentKey,
              last_notified_stage_at: new Date().toISOString(),
            })
            .eq("id", o.id);
          if (backErr) {
            errors.push(`${o.id}: backward snapshot failed: ${backErr.message}`);
          }
          unchanged += 1;
        }
      } else {
        unchanged += 1;
      }

      // ---- Cross-system blocker notification (separate from
      // stage advance, fires whenever a blocker is active and we
      // haven't broadcast one for this order in 6h) ----
      if (tl.crossSystemBlockers && tl.crossSystemBlockers.length > 0) {
        const { count: recentBlockerCount, error: countErr } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("company_id", o.company_id)
          .eq("notification_type", STAGE_BLOCKED_TYPE)
          .eq("related_entity_id", o.id)
          .gte("created_at", sixHoursAgo);
        if (countErr) {
          errors.push(`${o.id}: blocker dedup check failed: ${countErr.message}`);
        } else if (typeof recentBlockerCount === "number" && recentBlockerCount === 0) {
          try {
            const ns = await ensureNotif();
            const orderLabel = o.order_number || String(o.id).slice(0, 8);
            const lines = tl.crossSystemBlockers.map((b) => `- ${b.message}`).join("\n");
            const hasErrSeverity = tl.crossSystemBlockers.some((b) => b.severity === "error");
            await ns.broadcastNotification({
              companyId: o.company_id,
              regionId: o.region_id || null,
              targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
              title: `Order ${orderLabel} blocked`,
              message: `${orderLabel} can't progress past "${tl.stages.find((s) => s.key === tl.currentStageKey)?.label || tl.currentStageKey}":\n${lines}`,
              type: STAGE_BLOCKED_TYPE,
              priority: hasErrSeverity ? "high" : "normal",
              link: `/admin/orders?orderId=${o.id}`,
              relatedEntityType: "order",
              relatedEntityId: o.id,
              metadata: {
                stage_key: tl.currentStageKey,
                blockers: tl.crossSystemBlockers,
                urgency: tl.urgency,
              } as any,
            });
            blockerFired += 1;
          } catch (broadcastErr: any) {
            errors.push(`${o.id}: blocker broadcast failed: ${broadcastErr?.message || broadcastErr}`);
          }
        }
      }
    } catch (loopErr: any) {
      errors.push(`${o.id}: ${loopErr?.message || loopErr}`);
    }
  }

  return res.status(200).json({
    ok: true,
    checked: orders.length,
    advance_fired: advanceFired,
    blocker_fired: blockerFired,
    unchanged,
    errors: errors.slice(0, 20),
  });
}
