/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Client-safe delivery summary for a single order.
 *
 * Why server-side: a client session cannot SELECT the driver's profile
 * row under RLS (profiles is staff-scoped), so the client portal cannot
 * show "who is bringing my food". Rather than open profiles to clients
 * (which would leak a driver's full PII row), this endpoint runs with the
 * service role and returns ONLY the safe fields (driver name + phone,
 * vehicle basics) - and only to a caller entitled to this order:
 *   - any staff/admin of the order's company, or
 *   - the client the order belongs to (clients.user_id = session user).
 *
 * GET /api/orders/<id>/client-delivery
 *   -> { driver, secondaryDriver, vehicle }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";

type Contact = { full_name: string | null; phone: string | null } | null;
type Vehicle = {
  nickname: string | null; plate: string | null; make: string | null;
  model: string | null; refrigerated: boolean | null; has_warmer: boolean | null;
} | null;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const orderId = String(req.query.id || "");
  if (!orderId) return res.status(400).json({ error: "Missing order id" });

  // Caller must be signed in.
  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Sign in first" });

  let admin: any;
  try {
    admin = getServiceSupabase();
  } catch {
    return res.status(500).json({ error: "Server not configured" });
  }

  // Load the order (service role bypasses RLS; we do our own entitlement
  // check below so this never leaks across tenants).
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, company_id, client_id, assigned_driver_id, secondary_driver_id, assigned_vehicle_id")
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (orderErr) {
    console.error("[client-delivery] order fetch failed:", orderErr);
    return res.status(500).json({ error: "Could not load order" });
  }
  if (!order) return res.status(404).json({ error: "Order not found" });

  // Entitlement: staff/admin of the order's company OR the client the
  // order belongs to. Anything else is a 403 - never reveal the driver.
  //
  // CRITICAL: a matching company_id is NOT sufficient for the staff
  // branch. Clients carry a company_id too (they belong to a tenant),
  // so "company_id matches" would let ANY client of this tenant read
  // ANOTHER client's driver. The staff branch therefore requires a
  // non-client role; clients must qualify through the clients-row
  // ownership check below (they own THIS order's client_id).
  let entitled = false;
  const { data: prof } = await admin
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (
    prof?.company_id &&
    prof.company_id === order.company_id &&
    prof.role &&
    prof.role !== "client"
  ) {
    entitled = true; // staff/admin of this tenant
  }
  if (!entitled && order.client_id) {
    const { data: clientRow } = await admin
      .from("clients")
      .select("id")
      .eq("id", order.client_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (clientRow) entitled = true; // the client this order belongs to
  }
  if (!entitled) return res.status(403).json({ error: "Not your order" });

  // Resolve the safe driver contact fields + vehicle basics.
  const wantIds = [order.assigned_driver_id, order.secondary_driver_id].filter(Boolean);
  let driver: Contact = null;
  let secondaryDriver: Contact = null;
  if (wantIds.length > 0) {
    const { data: people } = await admin
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", wantIds);
    const byId = new Map(((people as any[]) || []).map((p) => [p.id, p]));
    if (order.assigned_driver_id && byId.has(order.assigned_driver_id)) {
      const p = byId.get(order.assigned_driver_id);
      driver = { full_name: p.full_name ?? null, phone: p.phone ?? null };
    }
    if (order.secondary_driver_id && byId.has(order.secondary_driver_id)) {
      const p = byId.get(order.secondary_driver_id);
      secondaryDriver = { full_name: p.full_name ?? null, phone: p.phone ?? null };
    }
  }

  let vehicle: Vehicle = null;
  if (order.assigned_vehicle_id) {
    const { data: v } = await admin
      .from("vehicles")
      .select("nickname, plate, make, model, refrigerated, has_warmer")
      .eq("id", order.assigned_vehicle_id)
      .maybeSingle();
    if (v) vehicle = v as Vehicle;
  }

  return res.status(200).json({ driver, secondaryDriver, vehicle });
}

export default withApiLogging(handler);
