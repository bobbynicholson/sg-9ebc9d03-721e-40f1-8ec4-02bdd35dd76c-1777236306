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
  leads:   { inserted: number; skipped: number; errored: number };
}

async function findExistingLead(
  supabase: ReturnType<typeof getServiceSupabase>,
  companyId: string,
  mapped: any,
): Promise<string | null> {
  // Email is the canonical de-dupe key for leads -- a tenant typing
  // the same prospect twice should hit a skip.
  const email = mapped.email || mapped.client_email;
  if (!email) return null;
  const { data } = await supabase
    .from("leads")
    .select("id")
    .eq("company_id", companyId)
    .or(`email.ilike.${String(email).trim()},client_email.ilike.${String(email).trim()}`)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return data ? (data as any).id : null;
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
      .ilike("client_name", String(mapped.client_name).trim())
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

    // Optional target region. The importer page lets the operator
    // pick which branch the imported clients / orders belong to.
    // Validated against regions for this tenant -- a poisoned id
    // from another company is rejected rather than silently dropped.
    let targetRegionId: string | null = null;
    const requestedRegionId = (req.body && typeof req.body === "object")
      ? (req.body as any).region_id
      : null;
    if (typeof requestedRegionId === "string" && requestedRegionId.length === 36) {
      const { data: regionRow } = await ssr
        .from("regions")
        .select("id")
        .eq("id", requestedRegionId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (regionRow) targetRegionId = (regionRow as any).id;
    }

    const job = await getImportJob(jobId, companyId);
    if (!job) return res.status(404).json({ error: "Import job not found" });
    if (job.status !== "previewed" && job.status !== "mapped") {
      return res.status(409).json({
        error: `Job is in status '${job.status}'. Run the preview step first.`,
      });
    }

    await setJobStatus(jobId, "committing");

    // Cast: import_rows isn't in the auto-generated Database types
    // yet -- without it TS chases the union forever ("Type
    // instantiation is excessively deep").
    const supabase = getServiceSupabase() as any;
    const rows = await listImportRows(jobId, { limit: 5000 });

    const summary: CommitSummary = {
      clients: { inserted: 0, skipped: 0, errored: 0 },
      orders:  { inserted: 0, skipped: 0, errored: 0 },
      leads:   { inserted: 0, skipped: 0, errored: 0 },
    };

    // Three passes: clients first so orders can resolve client_id;
    // leads runs independently (no FK to clients/orders).
    const clientRows = rows.filter((r) => r.target_table === "clients" && r.status !== "error");
    const orderRows  = rows.filter((r) => r.target_table === "orders"  && r.status !== "error");
    const leadRows   = rows.filter((r) => r.target_table === "leads"   && r.status !== "error");

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

        // clients schema: client_name, email, phone, notes, is_active.
        // No `company_name` or `status` columns -- the AI mapper's
        // schema includes them but they're collapsed into client_name
        // and is_active here.
        const insertPayload: any = {
          company_id: companyId,
          region_id: targetRegionId,
          client_name: mapped.client_name || mapped.company_name || "Imported client",
          email: mapped.email || null,
          phone: mapped.phone || null,
          notes: mapped.notes || null,
          is_active: mapped.status === "inactive" ? false : true,
          import_job_id: jobId,
        };

        const { data: inserted, error } = await supabase
          .from("clients")
          .insert(insertPayload)
          .select("id, email, client_name")
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
              .ilike("client_name", k)
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

        // orders schema doesn't have notes / external_ref columns
        // (verified via information_schema). The AI mapper's order
        // target list still includes them so the operator can mark
        // a column as such; we just drop those values at insert
        // time. status defaults to 'pending' to match the existing
        // enum.
        const orderPayload: any = {
          company_id: companyId,
          region_id: targetRegionId,
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
          status: mapped.status || "pending",
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

    // Leads pass. Independent of clients / orders.
    for (const r of leadRows) {
      try {
        const mapped = r.mapped_data || {};
        const existing = await findExistingLead(supabase, companyId, mapped);
        if (existing) {
          summary.leads.skipped += 1;
          await supabase.from("import_rows").update({
            status: "skipped",
            target_id: existing,
            error_message: "Already on file (matching email)",
          } as any).eq("id", r.id);
          continue;
        }

        // leads requires email + client_email + contact_name. Preview
        // already mirrored email <-> client_email and contact_name <->
        // client_name; defensive: do it again.
        const email = mapped.email || mapped.client_email;
        const contact = mapped.contact_name || mapped.client_name;
        const insertPayload: any = {
          company_id: companyId,
          region_id: targetRegionId,
          contact_name: contact,
          client_name: mapped.client_name || contact,
          email: email,
          client_email: email,
          phone: mapped.phone || mapped.client_phone || null,
          client_phone: mapped.client_phone || mapped.phone || null,
          company_name: mapped.company_name || null,
          event_type: mapped.event_type || null,
          event_date: mapped.event_date || null,
          guest_count: mapped.guest_count ?? null,
          venue_address: mapped.venue_address || null,
          budget: mapped.budget ?? null,
          source: mapped.source || null,
          special_requests: mapped.special_requests || null,
          notes: mapped.notes || null,
          tags: mapped.tags || null,
          import_job_id: jobId,
        };

        const { data: inserted, error } = await supabase
          .from("leads")
          .insert(insertPayload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);

        summary.leads.inserted += 1;
        await supabase.from("import_rows").update({
          status: "inserted",
          target_id: (inserted as any).id,
        } as any).eq("id", r.id);
      } catch (e: any) {
        summary.leads.errored += 1;
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
