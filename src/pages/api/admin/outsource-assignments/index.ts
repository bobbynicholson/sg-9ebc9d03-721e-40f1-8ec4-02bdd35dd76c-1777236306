/**
 * POST /api/admin/outsource-assignments
 *
 * Wave 67 Phase D -- admin creates a new outsource assignment for an
 * order. Wraps the service create() with tenant scope + role check.
 *
 * Body: { orderId, providerId, serviceDescription, quotedCost, rateType?,
 *         requiredOnSiteAt?, scopeNotes?, menuItemId?, orderItemId? }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import crypto from "crypto";

const ALLOWED_ROLES = new Set([
  "super_admin", "company_admin", "admin", "sales_admin", "region_admin",
]);

function mintToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Admin only" });
    const companyId = (profile as any)?.company_id as string | undefined;
    if (!companyId) return res.status(400).json({ error: "No company on profile" });

    const body = (req.body || {}) as any;
    const orderId = typeof body.orderId === "string" ? body.orderId : null;
    const providerId = typeof body.providerId === "string" ? body.providerId : null;
    const serviceDescription = typeof body.serviceDescription === "string"
      ? body.serviceDescription.trim().slice(0, 500)
      : "";
    const quotedCost = typeof body.quotedCost === "number" ? body.quotedCost : Number(body.quotedCost);

    if (!orderId || !providerId) return res.status(400).json({ error: "orderId + providerId required" });
    if (!serviceDescription) return res.status(400).json({ error: "serviceDescription required" });
    if (!Number.isFinite(quotedCost) || quotedCost < 0) {
      return res.status(400).json({ error: "quotedCost must be a non-negative number" });
    }

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch {
      return res.status(500).json({ error: "Server not configured" });
    }

    // Tenant-scope both order + provider before write.
    const [orderRes, providerRes] = await Promise.all([
      admin.from("orders")
        .select("id, company_id, event_date, event_time")
        .eq("id", orderId).eq("company_id", companyId).maybeSingle(),
      admin.from("outsource_providers")
        .select("id, company_id, default_currency, default_rate_type")
        .eq("id", providerId).eq("company_id", companyId).maybeSingle(),
    ]);
    if (!orderRes.data) return res.status(404).json({ error: "Order not found in your company" });
    if (!providerRes.data) return res.status(404).json({ error: "Provider not found in your company" });

    const rateType = typeof body.rateType === "string"
      ? body.rateType
      : (providerRes.data as any).default_rate_type || "per_event";
    const costCurrency = typeof body.costCurrency === "string"
      ? body.costCurrency
      : (providerRes.data as any).default_currency || "ZAR";

    // Token expiry: event_date + 1 day if event in future, else now + 90d.
    let expiresAt: string;
    const eventIso = (orderRes.data as any).event_date;
    if (eventIso) {
      const eventTime = (orderRes.data as any).event_time || "23:59:59";
      const eventMs = new Date(`${eventIso}T${String(eventTime).slice(0, 8)}`).getTime();
      if (Number.isFinite(eventMs) && eventMs > Date.now()) {
        expiresAt = new Date(eventMs + 24 * 60 * 60 * 1000).toISOString();
      } else {
        expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      }
    } else {
      expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    }

    const { data: inserted, error: insErr } = await admin
      .from("outsource_assignments")
      .insert({
        company_id: companyId,
        order_id: orderId,
        provider_id: providerId,
        order_item_id: typeof body.orderItemId === "string" ? body.orderItemId : null,
        menu_item_id: typeof body.menuItemId === "string" ? body.menuItemId : null,
        service_description: serviceDescription,
        required_on_site_at: typeof body.requiredOnSiteAt === "string" ? body.requiredOnSiteAt : null,
        scope_notes: typeof body.scopeNotes === "string" ? body.scopeNotes.trim().slice(0, 1000) : null,
        quoted_cost: Number(quotedCost.toFixed(2)),
        cost_currency: costCurrency,
        rate_type: rateType,
        accept_token: mintToken(),
        accept_token_expires_at: expiresAt,
        requested_by: user.id,
      })
      .select()
      .single();

    if (insErr) {
      console.error("[admin/outsource-assignments] insert failed:", insErr);
      return res.status(500).json({ error: insErr.message });
    }

    try {
      await admin.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: "outsource_assignment_created",
        entity_type: "outsource_assignment",
        entity_id: inserted.id,
        details: { order_id: orderId, provider_id: providerId, quoted_cost: quotedCost },
      });
    } catch (auditErr) {
      console.warn("[admin/outsource-assignments] audit failed:", auditErr);
    }

    return res.status(200).json({ ok: true, assignment: inserted });
  } catch (err: any) {
    console.error("[admin/outsource-assignments] crashed:", err);
    return res.status(500).json({ error: err?.message || "Create failed" });
  }
}
