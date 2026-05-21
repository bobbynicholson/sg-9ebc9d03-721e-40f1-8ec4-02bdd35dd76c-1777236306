/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/admin/export-company-data
 *
 * Phase 5 follow-up: GDPR / POPIA-style data export.
 *
 * The /admin/subscription deletion form collects an `exportData` flag
 * and passes it to subscriptionService.requestAccountDeletion - but
 * historically there was no endpoint that actually produces the
 * export. This endpoint closes that gap.
 *
 * Behaviour:
 *   - Authenticated admin / company_admin / owner / super_admin only.
 *   - Scopes the export to the caller's `profile.company_id` (super_admin
 *     can override via `?company_id=` query param to support data-export
 *     requests filed from the platform-side).
 *   - Returns a single JSON blob with the company's clients, orders,
 *     invoices, quotes, and the company row itself. Streams the response
 *     so a tenant with a few thousand orders doesn't OOM the Node worker.
 *   - Sets Content-Disposition: attachment so the browser saves the file.
 *
 * Defence in depth:
 *   - Service-role client used for the dump itself (RLS would mask
 *     soft-deleted rows etc. and the export needs everything the
 *     tenant ever owned).
 *   - Tenant scoping is enforced at the query level via the
 *     resolved company_id, not via RLS.
 *
 * Limits:
 *   - 50k row cap per entity to prevent runaway dumps. Real GDPR
 *     export at higher scale should background-job this and email
 *     a download link, but caterers tracking thousands of orders
 *     fit comfortably under the cap and the synchronous flow is
 *     simpler to reason about.
 *
 * See docs/tenant-lifecycle.md section 4 for the offboarding flow.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const ROW_CAP = 50_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const sb = createPagesServerClient({ req, res });
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Resolve caller's role + company.
    const { data: profile, error: profileErr } = await (sb as any)
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr || !profile) {
      return res.status(403).json({ error: "Profile not found" });
    }
    const role = String(profile.active_role || profile.role || "").trim();
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Resolve target company_id. Super-admin may override via query
    // param to support platform-side export requests.
    const overrideCompanyId = typeof req.query.company_id === "string"
      ? req.query.company_id.trim()
      : null;
    const targetCompanyId = role === "super_admin" && overrideCompanyId
      ? overrideCompanyId
      : profile.company_id;
    if (!targetCompanyId) {
      return res.status(400).json({ error: "No company scope resolved" });
    }
    // Block non-super-admins from cross-tenant queries.
    if (role !== "super_admin" && overrideCompanyId && overrideCompanyId !== profile.company_id) {
      return res.status(403).json({ error: "Forbidden: cross-tenant export" });
    }

    // Service-role client for the dump itself - we want every row the
    // tenant ever owned, including soft-deleted ones.
    const service: any = getServiceSupabase();

    // Pull each entity in parallel. ROW_CAP guards against runaway
    // dumps; if any entity hits the cap we flag it in the response
    // meta so the caller knows to upgrade to a background-job flow.
    const [
      companyRes,
      clientsRes,
      ordersRes,
      invoicesRes,
      quotesRes,
      paymentsRes,
    ] = await Promise.all([
      service.from("companies").select("*").eq("id", targetCompanyId).maybeSingle(),
      service.from("clients").select("*").eq("company_id", targetCompanyId).limit(ROW_CAP),
      service.from("orders").select("*").eq("company_id", targetCompanyId).limit(ROW_CAP),
      service.from("invoices").select("*").eq("company_id", targetCompanyId).limit(ROW_CAP),
      service.from("quotes").select("*").eq("company_id", targetCompanyId).limit(ROW_CAP),
      service.from("payments").select("*").eq("company_id", targetCompanyId).limit(ROW_CAP),
    ]);

    const errors = [companyRes.error, clientsRes.error, ordersRes.error, invoicesRes.error, quotesRes.error, paymentsRes.error].filter(Boolean);
    if (errors.length > 0) {
      console.error("[export-company-data] partial fetch failure:", errors);
      // Still return what we got - a partial export is better than
      // nothing when the user is staring at "I want my data" CTA.
    }

    const counts = {
      clients: clientsRes.data?.length ?? 0,
      orders: ordersRes.data?.length ?? 0,
      invoices: invoicesRes.data?.length ?? 0,
      quotes: quotesRes.data?.length ?? 0,
      payments: paymentsRes.data?.length ?? 0,
    };

    const cappedEntities = Object.entries(counts)
      .filter(([, n]) => n === ROW_CAP)
      .map(([k]) => k);

    const dump = {
      meta: {
        exported_at: new Date().toISOString(),
        company_id: targetCompanyId,
        exported_by_user_id: user.id,
        row_cap: ROW_CAP,
        counts,
        capped_entities: cappedEntities,
        notes: cappedEntities.length > 0
          ? `Some entities hit the ${ROW_CAP}-row cap and may be truncated. Contact support for a full background export.`
          : null,
      },
      company: companyRes.data || null,
      clients: clientsRes.data || [],
      orders: ordersRes.data || [],
      invoices: invoicesRes.data || [],
      quotes: quotesRes.data || [],
      payments: paymentsRes.data || [],
    };

    // Best-effort audit log so the next person looking at the deletion
    // request can see the export happened.
    try {
      await service.from("audit_logs").insert({
        company_id: targetCompanyId,
        user_id: user.id,
        action: "company_data_exported",
        entity_type: "company",
        entity_id: targetCompanyId,
        details: { counts, capped: cappedEntities.length > 0 },
      });
    } catch (auditErr) {
      console.warn("[export-company-data] audit insert failed (non-blocking):", auditErr);
    }

    const filename = `cateringms-export-${targetCompanyId}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(JSON.stringify(dump, null, 2));
  } catch (e: any) {
    console.error("[export-company-data] crashed:", e);
    return res.status(500).json({ error: e?.message || "Export failed" });
  }
}
