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

/**
 * Sparse update: build a patch that only carries fields with real
 * values. The operator re-uploading a cleaned-up sheet shouldn't have
 * a blank "Notes" cell wipe out a manually-typed note we have on
 * file. Treats null / undefined / "" as "leave unchanged"; non-empty
 * values overwrite.
 *
 * Feature F: re-upload merge intelligence.
 */
function sparseUpdate(payload: Record<string, any>): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    patch[k] = v;
  }
  return patch;
}

/**
 * Bulk dedup pre-fetch for the batch. One round trip per dedup table
 * instead of one per row -- the single biggest commit speedup. A
 * 250-row client batch goes from ~500 round trips to ~3.
 */
interface DedupMaps {
  clientByEmail: Map<string, string>;
  clientByName:  Map<string, string>;
  leadByEmail:   Map<string, string>;
  orderByKey:    Map<string, string>; // key = `${event_date}|${lower(client_name)}`
}

async function buildDedupMaps(
  supabase: any,
  companyId: string,
  clientRows: ReadonlyArray<{ mapped_data: any }>,
  orderRows: ReadonlyArray<{ mapped_data: any }>,
  leadRows: ReadonlyArray<{ mapped_data: any }>,
): Promise<DedupMaps> {
  const clientEmails = new Set<string>();
  const clientNames  = new Set<string>();
  for (const r of clientRows) {
    const m = r.mapped_data || {};
    if (m.email) clientEmails.add(String(m.email).toLowerCase().trim());
    if (m.client_name) clientNames.add(String(m.client_name).toLowerCase().trim());
  }
  const leadEmails = new Set<string>();
  for (const r of leadRows) {
    const m = r.mapped_data || {};
    const e = m.email || m.client_email;
    if (e) leadEmails.add(String(e).toLowerCase().trim());
  }
  const orderDates = new Set<string>();
  const orderNames = new Set<string>();
  for (const r of orderRows) {
    const m = r.mapped_data || {};
    if (m.event_date) orderDates.add(String(m.event_date));
    if (m.client_name) orderNames.add(String(m.client_name).toLowerCase().trim());
  }

  const clientByEmail = new Map<string, string>();
  const clientByName  = new Map<string, string>();
  const leadByEmail   = new Map<string, string>();
  const orderByKey    = new Map<string, string>();

  // Run the pre-fetch queries in parallel -- they're independent.
  await Promise.all([
    (async () => {
      if (clientEmails.size === 0 && clientNames.size === 0) return;
      // One scan through clients in this company keyed by email OR
      // name. Most catering tenants have <10k clients so a single
      // bounded scan is cheaper than two filtered queries; for larger
      // tenants we'd want indexed prefix probes, but that's a future
      // problem.
      const orFilters: string[] = [];
      if (clientEmails.size > 0) {
        orFilters.push(`email.in.(${Array.from(clientEmails).map((e) => `"${e}"`).join(",")})`);
      }
      if (clientNames.size > 0) {
        orFilters.push(`client_name.in.(${Array.from(clientNames).map((n) => `"${n}"`).join(",")})`);
      }
      if (orFilters.length === 0) return;
      const { data } = await supabase
        .from("clients")
        .select("id, email, client_name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .or(orFilters.join(","));
      for (const c of (data || []) as Array<{ id: string; email: string | null; client_name: string | null }>) {
        if (c.email) clientByEmail.set(c.email.toLowerCase().trim(), c.id);
        if (c.client_name) clientByName.set(c.client_name.toLowerCase().trim(), c.id);
      }
    })(),
    (async () => {
      if (leadEmails.size === 0) return;
      const list = Array.from(leadEmails);
      // leads dedupes on either email or client_email. Two queries +
      // merge is simpler than a complex `.or()` filter.
      const [byEmail, byClientEmail] = await Promise.all([
        supabase
          .from("leads")
          .select("id, email")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("email", list),
        supabase
          .from("leads")
          .select("id, client_email")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("client_email", list),
      ]);
      for (const r of (byEmail.data || []) as Array<{ id: string; email: string | null }>) {
        if (r.email) leadByEmail.set(r.email.toLowerCase().trim(), r.id);
      }
      for (const r of (byClientEmail.data || []) as Array<{ id: string; client_email: string | null }>) {
        if (r.client_email && !leadByEmail.has(r.client_email.toLowerCase().trim())) {
          leadByEmail.set(r.client_email.toLowerCase().trim(), r.id);
        }
      }
    })(),
    (async () => {
      if (orderDates.size === 0 || orderNames.size === 0) return;
      // Orders are keyed by (event_date, client_name). Pull every
      // order in this company on any of the candidate dates and
      // post-filter by name in memory.
      const { data } = await supabase
        .from("orders")
        .select("id, event_date, client_name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .in("event_date", Array.from(orderDates));
      for (const o of (data || []) as Array<{ id: string; event_date: string | null; client_name: string | null }>) {
        if (!o.event_date || !o.client_name) continue;
        const nameKey = o.client_name.toLowerCase().trim();
        if (!orderNames.has(nameKey)) continue;
        const key = `${o.event_date}|${nameKey}`;
        if (!orderByKey.has(key)) orderByKey.set(key, o.id);
      }
    })(),
  ]);

  return { clientByEmail, clientByName, leadByEmail, orderByKey };
}

const lookupExistingClient = (dedup: DedupMaps, mapped: any): string | null => {
  if (mapped.email) {
    const hit = dedup.clientByEmail.get(String(mapped.email).toLowerCase().trim());
    if (hit) return hit;
  }
  if (mapped.client_name) {
    const hit = dedup.clientByName.get(String(mapped.client_name).toLowerCase().trim());
    if (hit) return hit;
  }
  return null;
};

const lookupExistingLead = (dedup: DedupMaps, mapped: any): string | null => {
  const e = mapped.email || mapped.client_email;
  if (!e) return null;
  return dedup.leadByEmail.get(String(e).toLowerCase().trim()) ?? null;
};

const lookupExistingOrder = (dedup: DedupMaps, mapped: any): string | null => {
  if (!mapped.event_date || !mapped.client_name) return null;
  const key = `${String(mapped.event_date)}|${String(mapped.client_name).toLowerCase().trim()}`;
  return dedup.orderByKey.get(key) ?? null;
};

/**
 * Run an async per-item function with bounded concurrency. Promise.all
 * across the whole array would open hundreds of Supabase connections
 * at once; chunked Promise.all keeps us inside the connection pool
 * while still landing ~8x speedup over sequential.
 */
async function runChunked<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    await Promise.all(slice.map(fn));
  }
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
    // Source filename for the per-contact provenance chip
    // (Feature C). May be null for very old jobs; we'll just skip the
    // chip in that case rather than error.
    const importedFilename: string | null = (job as any)?.source_filename ?? null;
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

    // Per-call cap. With bulk dedup pre-fetch (one query per dedup
    // table for the whole batch) and 8x parallel row processing, a
    // 1 000-row batch finishes in ~10-15s -- well inside Vercel's
    // 300s function cap with margin for slow DB hops. Override via
    // ?batch_size=N for huge tenants (clamped 50..2000).
    const batchSize = Math.min(
      Math.max(Number(req.query.batch_size) || 1000, 50),
      2000,
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

    // ── Bulk dedup pre-fetch ───────────────────────────────────────
    // Single biggest commit speedup. Without this, every row did 2-4
    // sequential DB round trips just to check whether the record
    // already existed; with it, the entire batch hits the DB ~3 times
    // and every per-row dedup is a cached map lookup.
    const dedup = await buildDedupMaps(supabase, companyId, clientRows, orderRows, leadRows);

    // Track newly-inserted clients keyed by name/email so an order
    // row in the same batch can resolve them without a fresh query.
    const newClientByEmail = new Map<string, string>();
    const newClientByName  = new Map<string, string>();

    // ── Concurrency budget ────────────────────────────────────────
    // 8 parallel requests is the sweet spot for Supabase: high enough
    // to mask single-query latency, low enough not to saturate the
    // pgbouncer pool. 250 rows × 100ms / 8 ≈ 3s per pass.
    const ROW_CONCURRENCY = 8;

    await runChunked(clientRows, ROW_CONCURRENCY, async (r) => {
      try {
        const mapped = r.mapped_data || {};
        // Honour the per-row dedup decision set during preview review.
        const decision = (r as any).dedup_decision as
          | "skip" | "update" | "create_new" | null;
        const stampedMatchId = (r as any).dedup_match_id as string | null;

        const existing: string | null = stampedMatchId
          ?? (decision !== "create_new" ? lookupExistingClient(dedup, mapped) : null);

        const payload: any = {
          company_id: companyId,
          region_id: targetRegionId,
          client_name: mapped.client_name || mapped.company_name || "Imported client",
          email: mapped.email || null,
          // Three phone columns. mobile_number is the WhatsApp
          // target; landline_number shows on the contact card; phone
          // stays as the legacy "primary" pointer so existing reads
          // keep working until every consumer migrates.
          phone: mapped.phone || mapped.mobile_number || mapped.landline_number || null,
          mobile_number: mapped.mobile_number || null,
          landline_number: mapped.landline_number || null,
          notes: mapped.notes || null,
          is_active: mapped.status === "inactive" ? false : true,
          import_job_id: jobId,
          imported_filename: importedFilename,
          // Imported-history rollup (Feature B). Sparse -- only the
          // columns the operator actually filled in get persisted;
          // rest stay null. Surfaced on the contact card so the
          // client doesn't look like a fresh signup.
          historical_total_events: mapped.historical_total_events ?? null,
          historical_lifetime_spend: mapped.historical_lifetime_spend ?? null,
          historical_last_event_date: mapped.historical_last_event_date || null,
          historical_last_event_type: mapped.historical_last_event_type || null,
          historical_notes: mapped.historical_notes || null,
        };

        if (existing && decision === "update") {
          if (!dryRun) {
            // Sparse merge -- only fields present in the new sheet
            // overwrite. Empty cells leave the existing record's
            // value alone. Lets operators re-upload a cleaned sheet
            // without wiping notes / phones / addresses they typed
            // by hand in the portal. (Feature F.)
            const patch = sparseUpdate(payload);
            const { error } = await supabase
              .from("clients")
              .update(patch)
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
          return;
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
          return;
        }

        if (dryRun) {
          summary.clients.inserted += 1;
          if (mapped.email) newClientByEmail.set(String(mapped.email).toLowerCase().trim(), r.id);
          if (mapped.client_name) newClientByName.set(String(mapped.client_name).toLowerCase().trim(), r.id);
          return;
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
    });

    await runChunked(orderRows, ROW_CONCURRENCY, async (r) => {
      try {
        const mapped = r.mapped_data || {};

        // Resolve client_id from in-batch maps + the pre-fetched dedup
        // index. No DB lookups inside the per-row body.
        let clientId: string | null = null;
        if (mapped.client_email) {
          const k = String(mapped.client_email).toLowerCase().trim();
          clientId = newClientByEmail.get(k) ?? dedup.clientByEmail.get(k) ?? null;
        }
        if (!clientId && mapped.client_name) {
          const k = String(mapped.client_name).toLowerCase().trim();
          clientId = newClientByName.get(k) ?? dedup.clientByName.get(k) ?? null;
        }

        const existingOrder = lookupExistingOrder(dedup, mapped);
        if (existingOrder) {
          summary.orders.skipped += 1;
          if (!dryRun) {
            await supabase.from("import_rows").update({
              status: "skipped",
              target_id: existingOrder,
              error_message: "Order already on file (same client + date)",
            } as any).eq("id", r.id);
          }
          return;
        }

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
          return;
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
    });

    await runChunked(leadRows, ROW_CONCURRENCY, async (r) => {
      try {
        const mapped = r.mapped_data || {};
        const decision = (r as any).dedup_decision as
          | "skip" | "update" | "create_new" | null;
        const stampedMatchId = (r as any).dedup_match_id as string | null;

        const existing: string | null = stampedMatchId
          ?? (decision !== "create_new" ? lookupExistingLead(dedup, mapped) : null);

        const email = mapped.email || mapped.client_email;
        const contact = mapped.contact_name || mapped.client_name;
        const payload: any = {
          company_id: companyId,
          region_id: targetRegionId,
          contact_name: contact,
          client_name: mapped.client_name || contact,
          email: email,
          client_email: email,
          phone: mapped.phone || mapped.client_phone || mapped.mobile_number || mapped.landline_number || null,
          client_phone: mapped.client_phone || mapped.phone || mapped.mobile_number || mapped.landline_number || null,
          mobile_number: mapped.mobile_number || null,
          landline_number: mapped.landline_number || null,
          imported_filename: importedFilename,
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
            // Sparse merge (Feature F) -- see clients pass for why.
            const patch = sparseUpdate(payload);
            const { error } = await supabase
              .from("leads")
              .update(patch)
              .eq("id", existing)
              .eq("company_id", companyId);
            if (error) throw new Error(error.message);
            await supabase.from("import_rows").update({
              status: "updated",
              target_id: existing,
            } as any).eq("id", r.id);
          }
          summary.leads.updated += 1;
          return;
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
          return;
        }

        if (dryRun) {
          summary.leads.inserted += 1;
          return;
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
    });

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
