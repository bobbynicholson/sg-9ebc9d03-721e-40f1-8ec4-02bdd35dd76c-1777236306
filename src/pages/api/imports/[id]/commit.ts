/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/imports/[id]/commit
 *
 * Take import_rows in status='pending' (passed the preview check) and
 * insert into clients / orders / leads. Each inserted row is stamped
 * with import_job_id so a single rollback DELETE reverses the whole
 * job.
 *
 * **Batched / resumable.** A single request processes at most
 * `batch_size` pending rows (default 250, max 500). Returns
 * `{ ok, summary, processed, more }` -- the client loops calling
 * commit until `more === false`. The natural resume key is
 * `import_rows.status='pending'`: rows already inserted /
 * skipped / errored never come back. This is what stops a 4 000-row
 * import from blowing past Vercel's 300s function cap and returning
 * an HTML error page that JSON.parse chokes on.
 *
 * Job status is flipped to 'committing' on the first batch and to
 * 'completed' on the last (no more pending rows). On any non-last
 * batch we leave it at 'committing' so re-entry is legal.
 *
 * Idempotency:
 *   clients -- de-dupe by (company_id, lower(email)). Existing email
 *              -> skipped (status='skipped').
 *   orders  -- looked up by client name + event_date. Existing match
 *              -> skipped.
 *   leads   -- de-dupe by email.
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

// Vercel default per-route timeout is 60s (Hobby) / 60s (Pro). At ~50ms
// per row of work (lookup + insert + update_import_rows), a 10k import
// needs ~8-10 minutes. Bump to the Pro-plan max of 300s. If the cap
// climbs above ~5k rows, the commit really needs to move to a
// background job (queue + poll).
export const maxDuration = 300;

const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

interface CountTriad {
  inserted: number;
  updated: number;
  skipped: number;
  errored: number;
}

interface CommitSummary {
  clients: CountTriad;
  orders:  CountTriad;
  leads:   CountTriad;
  dry_run: boolean;
}

const addCounts = (a: CountTriad | undefined, b: CountTriad): CountTriad => ({
  inserted: (a?.inserted ?? 0) + b.inserted,
  updated:  (a?.updated  ?? 0) + b.updated,
  skipped:  (a?.skipped  ?? 0) + b.skipped,
  errored:  (a?.errored  ?? 0) + b.errored,
});

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

    // Test-run mode (phase 3b). When set, the commit pass runs all the
    // resolution + dedup logic but skips the actual INSERT / UPDATE
    // statements and the job-status flip. The summary returned reflects
    // what would have happened. Used by the "Test run" button on the
    // preview screen so an operator can sanity-check a big import
    // without touching production tables.
    const dryRun = (req.body && typeof req.body === "object")
      ? Boolean((req.body as any).dry_run)
      : (String(req.query.dry_run || "") === "1");

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
    // Allow re-entry while a commit is in flight (subsequent batches
    // arrive with status='committing'). 'previewed' / 'mapped' are
    // the first-batch entry points.
    if (
      job.status !== "previewed" &&
      job.status !== "mapped" &&
      job.status !== "committing"
    ) {
      return res.status(409).json({
        error: `Job is in status '${job.status}'. Run the preview step first.`,
      });
    }

    // Per-call cap. Sized so even the worst-case row (orders pass:
    // client lookup + existing-order check + insert + status update)
    // finishes well under the 300s function cap. Configurable in case
    // a tenant has unusually slow DB latencies.
    const batchSize = Math.min(
      Math.max(Number(req.query.batch_size) || 250, 50),
      500,
    );

    if (!dryRun && job.status !== "committing") {
      await setJobStatus(jobId, "committing");
    }

    // Cast: import_rows isn't in the auto-generated Database types
    // yet -- without it TS chases the union forever ("Type
    // instantiation is excessively deep").
    const supabase = getServiceSupabase() as any;
    // Status-filtered fetch is the resume key. On the first call this
    // returns the batch-sized prefix of pending rows; on each
    // subsequent call it returns the next batch (the prior batch's
    // rows now have status='inserted'/'skipped'/'updated'/'error').
    // For dry runs we don't want to slice the dataset (the operator
    // is sanity-checking) but we also don't want to chew an entire
    // 11 000-row workbook in one request -- cap at 1 000 for dry-run
    // sample.
    const rows = dryRun
      ? await listImportRows(jobId, { status: "pending", limit: 1000 })
      : await listImportRows(jobId, { status: "pending", limit: batchSize });

    const summary: CommitSummary = {
      clients: { inserted: 0, updated: 0, skipped: 0, errored: 0 },
      orders:  { inserted: 0, updated: 0, skipped: 0, errored: 0 },
      leads:   { inserted: 0, updated: 0, skipped: 0, errored: 0 },
      dry_run: dryRun,
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
        // Honour the per-row dedup decision set during preview review.
        // 'skip' (default) -> bail when a match exists.
        // 'update'         -> apply mapped_data to the matched row.
        // 'create_new'     -> insert anyway, no match check.
        const decision = (r as any).dedup_decision as
          | "skip" | "update" | "create_new" | null;
        const stampedMatchId = (r as any).dedup_match_id as string | null;

        let existing: string | null = stampedMatchId;
        if (decision !== "create_new" && !existing) {
          existing = await findExistingClient(supabase, companyId, mapped);
        }

        // clients schema: client_name, email, phone, notes, is_active.
        const payload: any = {
          company_id: companyId,
          region_id: targetRegionId,
          client_name: mapped.client_name || mapped.company_name || "Imported client",
          email: mapped.email || null,
          phone: mapped.phone || null,
          notes: mapped.notes || null,
          is_active: mapped.status === "inactive" ? false : true,
          import_job_id: jobId,
        };

        if (existing && decision === "update") {
          if (!dryRun) {
            const { error } = await supabase
              .from("clients")
              .update(payload)
              .eq("id", existing)
              .eq("company_id", companyId);
            if (error) throw new Error(error.message);
          }
          summary.clients.updated += 1;
          if (mapped.email) newClientByEmail.set(String(mapped.email).toLowerCase().trim(), existing);
          if (mapped.client_name) newClientByName.set(String(mapped.client_name).toLowerCase().trim(), existing);
          if (!dryRun) {
            await supabase.from("import_rows").update({
              status: "updated",
              target_id: existing,
            } as any).eq("id", r.id);
          }
          continue;
        }

        if (existing && decision !== "create_new") {
          summary.clients.skipped += 1;
          if (!dryRun) {
            await supabase.from("import_rows").update({
              status: "skipped",
              target_id: existing,
              error_message: "Already on file",
            } as any).eq("id", r.id);
          }
          continue;
        }

        if (dryRun) {
          summary.clients.inserted += 1;
          // Still seed the in-batch maps with a placeholder so downstream
          // order rows simulate resolution correctly. Use the row's own
          // id as a stand-in -- never persisted.
          if (mapped.email) newClientByEmail.set(String(mapped.email).toLowerCase().trim(), r.id);
          if (mapped.client_name) newClientByName.set(String(mapped.client_name).toLowerCase().trim(), r.id);
          continue;
        }

        const { data: inserted, error } = await supabase
          .from("clients")
          .insert(payload)
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
        if (!dryRun) {
          await supabase.from("import_rows").update({
            status: "error",
            error_message: e?.message || "insert failed",
          } as any).eq("id", r.id);
        }
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
          if (!dryRun) {
            await supabase.from("import_rows").update({
              status: "skipped",
              target_id: existingOrder,
              error_message: "Order already on file (same client + date)",
            } as any).eq("id", r.id);
          }
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

        if (dryRun) {
          summary.orders.inserted += 1;
          continue;
        }

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
        if (!dryRun) {
          await supabase.from("import_rows").update({
            status: "error",
            error_message: e?.message || "insert failed",
          } as any).eq("id", r.id);
        }
      }
    }

    // Leads pass. Independent of clients / orders.
    for (const r of leadRows) {
      try {
        const mapped = r.mapped_data || {};
        const decision = (r as any).dedup_decision as
          | "skip" | "update" | "create_new" | null;
        const stampedMatchId = (r as any).dedup_match_id as string | null;

        let existing: string | null = stampedMatchId;
        if (decision !== "create_new" && !existing) {
          existing = await findExistingLead(supabase, companyId, mapped);
        }

        // leads requires email + client_email + contact_name. Preview
        // already mirrored email <-> client_email and contact_name <->
        // client_name; defensive: do it again.
        const email = mapped.email || mapped.client_email;
        const contact = mapped.contact_name || mapped.client_name;
        const payload: any = {
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

        if (existing && decision === "update") {
          if (!dryRun) {
            const { error } = await supabase
              .from("leads")
              .update(payload)
              .eq("id", existing)
              .eq("company_id", companyId);
            if (error) throw new Error(error.message);
            await supabase.from("import_rows").update({
              status: "updated",
              target_id: existing,
            } as any).eq("id", r.id);
          }
          summary.leads.updated += 1;
          continue;
        }

        if (existing && decision !== "create_new") {
          summary.leads.skipped += 1;
          if (!dryRun) {
            await supabase.from("import_rows").update({
              status: "skipped",
              target_id: existing,
              error_message: "Already on file (matching email)",
            } as any).eq("id", r.id);
          }
          continue;
        }

        if (dryRun) {
          summary.leads.inserted += 1;
          continue;
        }

        const { data: inserted, error } = await supabase
          .from("leads")
          .insert(payload)
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
        if (!dryRun) {
          await supabase.from("import_rows").update({
            status: "error",
            error_message: e?.message || "insert failed",
          } as any).eq("id", r.id);
        }
      }
    }

    // After processing this batch, count how many rows remain pending.
    // If zero, we're done -- flip the job to 'completed' and stamp the
    // final summary. If non-zero, the client will call us again.
    let remainingPending = 0;
    if (!dryRun) {
      const { count } = await supabase
        .from("import_rows")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("status", "pending");
      remainingPending = Number(count ?? 0);
    }
    const isLastBatch = dryRun || remainingPending === 0;

    if (!dryRun && isLastBatch) {
      // Merge this batch's summary into any prior commit summary so
      // the per-batch totals add up.
      const priorCommit = (job.summary as any)?.commit;
      const merged = priorCommit
        ? {
            clients: addCounts(priorCommit.clients, summary.clients),
            orders:  addCounts(priorCommit.orders,  summary.orders),
            leads:   addCounts(priorCommit.leads,   summary.leads),
            dry_run: false,
          }
        : summary;
      await setJobStatus(jobId, "completed", {
        summary: {
          ...(job.summary || {}),
          commit: merged,
        },
      });
      await logEvent(jobId, "committed", merged);
    } else if (!dryRun) {
      // Mid-stream: stash the running totals on the job so an aborted
      // import (browser closed) can still be inspected.
      const priorCommit = (job.summary as any)?.commit;
      const running = priorCommit
        ? {
            clients: addCounts(priorCommit.clients, summary.clients),
            orders:  addCounts(priorCommit.orders,  summary.orders),
            leads:   addCounts(priorCommit.leads,   summary.leads),
            dry_run: false,
          }
        : summary;
      await setJobStatus(jobId, "committing", {
        summary: {
          ...(job.summary || {}),
          commit: running,
        },
      });
    } else {
      await logEvent(jobId, "dry_run", summary);
    }

    return res.status(200).json({
      ok: true,
      summary,
      processed: rows.length,
      remaining: remainingPending,
      more: !isLastBatch,
    });
  } catch (outer: any) {
    console.error("imports/[id]/commit handler crashed:", outer);
    return res.status(500).json({ error: outer?.message || "Commit failed" });
  }
}
