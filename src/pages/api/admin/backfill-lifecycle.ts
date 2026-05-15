/**
 * POST /api/admin/backfill-lifecycle
 *
 * Walks every active order for the caller's company (or all companies
 * if super_admin) and runs lifecycleService.ensureLifecycleArtifactsForOrder
 * to backfill missing contact / lead / quote / invoice rows.
 *
 * Idempotent. Safe to spam.
 *
 * Body: { dry_run?: boolean }  -- dry_run defaults true so a curious
 * click doesn't write anything.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { lifecycleService } from "@/services/lifecycleService";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

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
      console.error("[admin/backfill-lifecycle] profiles fetch failed:", profileErr);
    }
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }

    const dryRun = (req.body as any)?.dry_run !== false; // default true

    // Pull all active orders this admin can see. Super_admin gets all
    // companies; everyone else is RLS-scoped to their own.
    let query = ssr
      .from("orders")
      .select("id, company_id, order_number, client_id, quote_id, client_email")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (role !== "super_admin" && (profile as any)?.company_id) {
      query = query.eq("company_id", (profile as any).company_id);
    }
    const { data: orders, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const summary: Array<{
      order_id: string;
      order_number: string;
      backfilled: string[];
    }> = [];

    if (dryRun) {
      // Just report what would change without running the writes.
      for (const o of orders || []) {
        const missing: string[] = [];
        if (!(o as any).client_id) missing.push("client");
        if (!(o as any).quote_id) missing.push("quote");
        if ((o as any).client_email) {
          // Lead and invoice presence we can't tell without a join;
          // dry-run flags them as "maybe" by including them whenever
          // the order has an email.
          missing.push("lead?");
          missing.push("invoice?");
        }
        if (missing.length > 0) {
          summary.push({
            order_id: (o as any).id,
            order_number: (o as any).order_number || (o as any).id.slice(0, 8),
            backfilled: missing,
          });
        }
      }
      return res.status(200).json({
        ok: true,
        dry_run: true,
        total_active_orders: (orders || []).length,
        orders_with_gaps: summary.length,
        gaps: summary.slice(0, 50),
      });
    }

    // Real run. Sequential -- volume is low enough not to need batching.
    for (const o of orders || []) {
      try {
        const result = await lifecycleService.ensureLifecycleArtifactsForOrder(
          (o as any).id,
          { client: ssr as any },
        );
        if (result.backfilled.length > 0) {
          summary.push({
            order_id: result.orderId,
            order_number: (o as any).order_number || result.orderId.slice(0, 8),
            backfilled: result.backfilled,
          });
        }
      } catch (e) {
        console.warn(`[backfill-lifecycle] order ${(o as any).id} failed:`, e);
      }
    }

    // Also walk every active client without a matching lead and
    // backfill a 'won' lead row -- so /admin/leads "All" / "Won
    // (archive)" shows the full historical pipeline.
    let clientLeadsCreated = 0;
    let clientsQuery = ssr
      .from("clients")
      .select("id, company_id, client_name, email")
      .is("deleted_at", null);
    if (role !== "super_admin" && (profile as any)?.company_id) {
      clientsQuery = clientsQuery.eq("company_id", (profile as any).company_id);
    }
    const { data: clientRows } = await clientsQuery;
    for (const c of clientRows || []) {
      try {
        const result = await lifecycleService.ensureLeadForClient(
          (c as any).id,
          { client: ssr as any },
        );
        if (result.created) clientLeadsCreated++;
      } catch (e) {
        console.warn(`[backfill-lifecycle] client ${(c as any).id} lead-fill failed:`, e);
      }
    }

    return res.status(200).json({
      ok: true,
      dry_run: false,
      total_active_orders: (orders || []).length,
      orders_backfilled: summary.length,
      client_leads_created: clientLeadsCreated,
      details: summary,
    });
  } catch (err: any) {
    console.error("[backfill-lifecycle] crashed:", err);
    return res.status(500).json({ error: err?.message || "Backfill failed" });
  }
}
