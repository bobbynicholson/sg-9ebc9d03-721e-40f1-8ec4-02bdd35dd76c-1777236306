import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "owner", "admin", "region_admin"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const orderId = String(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    return res.status(400).json({ error: "This order link is invalid. Reopen the order and try again." });
  }

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Your session has expired. Sign in and try again." });

    const { data: profile, error: profileError } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile) return res.status(403).json({ error: "We couldn't verify your staff account." });

    const role = String((profile as any).active_role || (profile as any).role || "").toLowerCase();
    if (!ADMIN_ROLES.has(role)) return res.status(403).json({ error: "Only an administrator can record this service milestone." });

    const admin = getServiceSupabase();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, company_id, status, deleted_at, created_at, service_started_at, service_ended_at, event_complete_at, departed_venue_at, completed_at, cancelled_at")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) return res.status(500).json({ error: dbErrorMessage(orderError, { entity: "order" }) });
    if (!order || order.deleted_at) return res.status(404).json({ error: "Order not found. Refresh the page and try again." });
    if (role !== "super_admin" && (profile as any).company_id !== (order as any).company_id) {
      return res.status(403).json({ error: "You can only record service milestones for your company’s orders." });
    }
    if ((order as any).cancelled_at || String((order as any).status || "").toLowerCase() === "cancelled") {
      return res.status(409).json({ error: "A cancelled order cannot be given a service start time." });
    }
    if ((order as any).service_started_at) {
      return res.status(409).json({ error: "A service start time is already recorded. Refresh the order to see it." });
    }

    const rawStartedAt = String((req.body || {}).started_at || "");
    const startedAtDate = new Date(rawStartedAt);
    if (!rawStartedAt || Number.isNaN(startedAtDate.getTime())) {
      return res.status(400).json({ error: "Choose a valid date and time for when service began." });
    }
    const startedAt = startedAtDate.toISOString();
    if (startedAtDate.getTime() > Date.now() + 5 * 60_000) {
      return res.status(400).json({ error: "Service start time cannot be in the future." });
    }
    if ((order as any).created_at && startedAtDate.getTime() < new Date((order as any).created_at).getTime()) {
      return res.status(400).json({ error: "Service start time must be after this order was created." });
    }

    const laterMilestones = [
      (order as any).service_ended_at,
      (order as any).event_complete_at,
      (order as any).departed_venue_at,
      (order as any).completed_at,
    ].filter((value): value is string => !!value).sort();
    if (laterMilestones[0] && startedAtDate.getTime() > new Date(laterMilestones[0]).getTime()) {
      return res.status(400).json({ error: "Service start must be at or before the earliest later service or closeout update." });
    }

    const { data: updated, error: updateError } = await admin
      .from("orders")
      .update({ service_started_at: startedAt, updated_at: new Date().toISOString() } as any)
      .eq("id", orderId)
      .is("service_started_at", null)
      .select("service_started_at")
      .maybeSingle();
    if (updateError) return res.status(500).json({ error: dbErrorMessage(updateError, { entity: "service start time" }) });
    if (!updated) return res.status(409).json({ error: "Another update recorded service start first. Refresh the order to see the saved time." });

    const { error: auditError } = await admin.from("audit_logs").insert({
      company_id: (order as any).company_id,
      user_id: user.id,
      action: "order_service_started_recorded",
      entity_type: "order",
      entity_id: orderId,
      details: { service_started_at: startedAt, source: "order_timeline_admin_entry" },
    });
    if (auditError) console.warn("[orders/service-started] audit log insert failed:", auditError.message);

    return res.status(200).json({ ok: true, service_started_at: startedAt, audit_logged: !auditError });
  } catch (error) {
    console.error("[orders/service-started] failed:", error);
    return res.status(500).json({ error: dbErrorMessage(error, { entity: "service start time" }) });
  }
}

export default withApiLogging(handler);
