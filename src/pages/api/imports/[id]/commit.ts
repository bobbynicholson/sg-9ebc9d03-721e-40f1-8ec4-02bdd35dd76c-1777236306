/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/imports/[id]/commit
 *
 * Take every import_row in status='pending' (passed the preview
 * check) and insert it into clients / orders. Each inserted row is
 * stamped with import_job_id so a single rollback DELETE reverses
 * the whole job.
 *
 * Idempotency:
 *   clients -- de-dupe by (company_id, lower(email)). Existing email
 *              -> skipped (status='skipped', error_message='already
 *              on file').
 *   orders  -- looked up by client name + event_date. Existing match
 *              -> skipped.
 *
 * Tenant scoping: every insert sets company_id from the authenticated
 * session.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  getImportJob, listImportRows, setJobStatus, logEvent,
} from "@/services/importService";

const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

interface CommitSummary {
  clients: { inserted: number; skipped: number; errored: number };
  orders:  { inserted: number; skipped: number; errored: number };
}

async function findExistingClient(
  supabase: ReturnType<typeof getServiceSupabase>,
  companyId: string,
  mapped: any,
): Promise<string | null> {
  // Email is the most reliable de-dupe key. If absent, fall back to
  // exact name match.
  if (mapped.email) {
    const { data } = await supabase
      .from("clients")
      .select("id")
      .eq("company_id", companyId)
      .ilike("email", String(mapped.email).trim())
      .limit(1)
      .maybeSingle();
    if (data) return (data as any).id;
  }
  if (mapped.client_name) {
    const { data } = await supabase
      .from("clients")
      .select("id")
      .eq("company_id", companyId)
      .ilike("full_name", String(mapped.client_name).trim())
      .limit(1)
      .maybeSingle();
    if (data) return (data as any).id;
  }
  return null;
}

async function findExistingOrder(
  supabase: ReturnType<typeof getServiceSupabase>,
  companyId: string,
  mapped: any,
): Promise<string | null> {
  if (!mapped.event_date || !mapped.client_name) return null;
  const { data } = await supabase
    .from("orders")
    .select("id")
    .eq("company_id", companyId)
    .eq("event_date", String(mapped.event_date))
    .ilike("client_name", String(mapped.client_name).trim())
    .limit(1)
    .maybeSingle();
  return data ? (data as any).id : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
    const role = (profile?.active_role || profile?.role || "") as string;
    if (!ALLOWED_CALLER_ROLES.has(role)) {
      return res.status(403).json({ error: "Only owners / admins can run imports" });
    }
    const companyId = profile?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    const jobId = String(req.query.id || "");
    if (!jobId) return res.status(400).json({ error: "Missing job id" });

    const job = await getImportJob(jobId, companyId);
    if (!job) return res.status(404).json({ error: "Import job not found" });
    if (job.status !== "previewed" && job.status !== "mapped") {
      return res.status(409).json({
        error: `Job is in status '${job.status}'. Run the preview step first.`,
      });
    }

    await setJobStatus(jobId, "committing");

    const supabase = getServiceSupabase();
    const rows = await listImportRows(jobId, { limit: 5000 });

    const summary: CommitSummary = {
      clients: { inserted: 0, skipped: 0, errored: 0 },
      orders:  { inserted: 0, skipped: 0, errored: 0 },
    };

    // Two passes: clients first so orders can resolve client_id.
    const clientRows = rows.filter((r) => r.target_table === "clients" && r.status !== "error");
    const orderRows  = rows.filter((r) => r.target_table === "orders"  && r.status !== "error");

    // Track newly-inserted clients keyed by name/email so an order
    // row in the same import can resolve them without a fresh query.
    const newClientByEmail = new Map<string, string>();
    const newClientByName  = new Map<string, string>();

    for (const r of clientRows) {
      try {
        const mapped = r.mapped_data || {};
        const existing = await findExistingClient(supabase, companyId, mapped);
        if (existing) {
          summary.clients.skipped += 1;
          await supabase.from("import_rows").update({
            status: "skipped",
            target_id: existing,
            error_message: "Already on file",
          } as any).eq("id", r.id);
          continue;
        }

        const insertPayload: any = {
          company_id: companyId,
          full_name: mapped.client_name || mapped.company_name || "Imported client",
          email: mapped.email || null,
          phone: mapped.phone || null,
          company_name: mapped.company_name || null,
          notes: mapped.notes || null,
          status: mapped.status || "active",
          import_job_id: jobId,
        };

        const { data: inserted, error } = await supabase
          .from("clients")
          .insert(insertPayload)
          .select("id, email, full_name")
          .single();
        if (error) throw new Error(error.message);

        summary.clients.inserted += 1;
        const newId = (inserted as any).id;
        if (mapped.email) newClientByEmail.set(String(mapped.email).toLowerCase().trim(), newId);
        if (mapped.client_name) newClientByName.set(String(mapped.client_name).toLowerCase().trim(), newId);

        await supabase.from("import_rows").update({
          status: "inserted",
          target_id: newId,
        } as any).eq("id", r.id);
      } catch (e: any) {
        summary.clients.errored += 1;
        await supabase.from("import_rows").update({
          status: "error",
          error_message: e?.message || "insert failed",
        } as any).eq("id", r.id);
      }
    }

    for (const r of orderRows) {
      try {
        const mapped = r.mapped_data || {};

        // Resolve client_id. Try the in-batch maps first (rows we
        // just inserted), fall back to a DB lookup.
        let clientId: string | null = null;
        if (mapped.client_email) {
          const k = String(mapped.client_email).toLowerCase().trim();
          clientId = newClientByEmail.get(k) ?? null;
          if (!clientId) {
            const { data } = await supabase
              .from("clients")
              .select("id")
              .eq("company_id", companyId)
              .ilike("email", k)
              .limit(1)
              .maybeSingle();
            clientId = data ? (data as any).id : null;
          }
        }
        if (!clientId && mapped.client_name) {
          const k = String(mapped.client_name).toLowerCase().trim();
          clientId = newClientByName.get(k) ?? null;
          if (!clientId) {
            const { data } = await supabase
              .from("clients")
              .select("id")
              .eq("company_id", companyId)
              .ilike("full_name", k)
              .limit(1)
              .maybeSingle();
            clientId = data ? (data as any).id : null;
          }
        }

        const existingOrder = await findExistingOrder(supabase, companyId, mapped);
        if (existingOrder) {
          summary.orders.skipped += 1;
          await supabase.from("import_rows").update({
            status: "skipped",
            target_id: existingOrder,
            error_message: "Order already on file (same client + date)",
          } as any).eq("id", r.id);
          continue;
        }

        const orderPayload: any = {
          company_id: companyId,
          client_id: clientId,
          client_name: mapped.client_name || null,
          client_email: mapped.client_email || null,
          client_phone: mapped.client_phone || null,
          event_name: mapped.event_name || null,
          event_date: mapped.event_date,
          event_time: mapped.event_time || null,
          guest_count: mapped.guest_count ?? null,
          venue_address: mapped.venue_address || null,
          total_amount: mapped.total_amount ?? null,
          notes: mapped.notes || null,
          external_ref: mapped.external_ref || null,
          status: mapped.status || "imported",
          import_job_id: jobId,
        };

        const { data: inserted, error } = await supabase
          .from("orders")
          .insert(orderPayload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);

        summary.orders.inserted += 1;
        await supabase.from("import_rows").update({
          status: "inserted",
          target_id: (inserted as any).id,
        } as any).eq("id", r.id);
      } catch (e: any) {
        summary.orders.errored += 1;
        await supabase.from("import_rows").update({
          status: "error",
          error_message: e?.message || "insert failed",
        } as any).eq("id", r.id);
      }
    }

    await setJobStatus(jobId, "completed", {
      summary: {
        ...(job.summary || {}),
        commit: summary,
      },
    });
    await logEvent(jobId, "committed", summary);

    return res.status(200).json({ ok: true, summary });
  } catch (outer: any) {
    console.error("imports/[id]/commit handler crashed:", outer);
    return res.status(500).json({ error: outer?.message || "Commit failed" });
  }
}
