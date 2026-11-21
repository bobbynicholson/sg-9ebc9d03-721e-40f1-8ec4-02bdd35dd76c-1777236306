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
    if (!ADMIN_ROLES.has(role)) return res.status(403).json({ error: "Only an administrator can record this driver milestone." });

    const admin = getServiceSupabase();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, company_id, status, deleted_at, created_at, departed_venue_at, cancelled_at")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) return res.status(500).json({ error: dbErrorMessage(orderError, { entity: "order" }) });
    if (!order || (order as any).deleted_at) return res.status(404).json({ error: "Order not found. Refresh the page and try again." });
    if (role !== "super_admin" && (profile as any).company_id !== (order as any).company_id) {
      return res.status(403).json({ error: "You can only record milestones for your company's orders." });
    }
    if ((order as any).cancelled_at || String((order as any).status || "").toLowerCase() === "cancelled") {
      return res.status(409).json({ error: "A cancelled order cannot be given a departure time." });
    }
    if ((order as any).departed_venue_at) {
      return res.status(409).json({ error: "A departure time is already recorded. Refresh the order to see it." });
    }

    const raw = String((req.body || {}).departed_at || "");
    const date = new Date(raw);
    if (!raw || Number.isNaN(date.getTime())) return res.status(400).json({ error: "Choose a valid date and time for when the driver left the venue." });
    if (date.getTime() > Date.now() + 5 * 60_000) return res.status(400).json({ error: "Departure time cannot be in the future." });
    if ((order as any).created_at && date.getTime() < new Date((order as any).created_at).getTime()) {
      return res.status(400).json({ error: "Departure time must be after this order was created." });
    }

    const departedAt = date.toISOString();
    const { data: updated, error: updateError } = await admin
      .from("orders")
      .update({ departed_venue_at: departedAt, updated_at: new Date().toISOString() } as any)
      .eq("id", orderId)
      .is("departed_venue_at", null)
      .select("departed_venue_at")
      .maybeSingle();
    if (updateError) return res.status(500).json({ error: dbErrorMessage(updateError, { entity: "departure time" }) });
    if (!updated) return res.status(409).json({ error: "Another update recorded departure first. Refresh the order to see it." });

    const { error: auditError } = await admin.from("audit_logs").insert({
      company_id: (order as any).company_id,
      user_id: user.id,
      action: "order_departed_venue_recorded",
      entity_type: "order",
      entity_id: orderId,
      details: { departed_venue_at: departedAt, source: "order_timeline_admin_entry" },
    });
    if (auditError) console.warn("[orders/departed-venue] audit log insert failed:", auditError.message);

    return res.status(200).json({ ok: true, departed_venue_at: departedAt, audit_logged: !auditError });
  } catch (error) {
    console.error("[orders/departed-venue] failed:", error);
    return res.status(500).json({ error: dbErrorMessage(error, { entity: "departure time" }) });
  }
}

export default withApiLogging(handler);
