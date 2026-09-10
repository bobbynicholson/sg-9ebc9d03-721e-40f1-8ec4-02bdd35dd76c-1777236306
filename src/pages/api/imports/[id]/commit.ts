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
 * `{ ok, summary, processed, more }` - the client loops calling
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
 *   clients - de-dupe by (company_id, lower(email)). Existing email
 *              -> skipped (status='skipped').
 *   orders  - looked up by client name + event_date. Existing match
 *              -> skipped.
 *   leads   - de-dupe by email.
 *
 * Tenant scoping: every insert sets company_id from the authenticated
 * session.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  getImportJob, listImportRows, setJobStatus, logEvent,
} from "@/services/importService";
import { withApiLogging } from "@/lib/withApiLogging";


// Vercel default per-route timeout is 60s (Hobby) / 60s (Pro). At ~50ms
// per row of work (lookup + insert + update_import_rows), a 10k import
// needs ~8-10 minutes. Bump to the Pro-plan max of 300s. If the cap
// climbs above ~5k rows, the commit really needs to move to a
// background job (queue + poll).
export const maxDuration = 300;

const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

// Spreadsheet cells arrive as free text. Coerce to the column type so a
// stray "R 5 000", "n/a", or "12 events" in an OPTIONAL field can't 500
// the whole row (the historical_* columns are numeric/date). Anything
// unparseable becomes null - the row still imports, just without that
// non-essential value.
function toNumOrNull(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function toIntOrNull(v: any): number | null {
  const n = toNumOrNull(v);
  return n == null ? null : Math.trunc(n);
}
function toDateOrNull(v: any): string | null {
  if (v == null || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

interface CountTriad {
  inserted: number;
  updated: number;
  skipped: number;
  errored: number;
}

interface CommitSummary {
  clients:  CountTriad;
  orders:   CountTriad;
  leads:    CountTriad;
  quotes:   CountTriad;
  invoices: CountTriad;
  payments: CountTriad;
  dry_run:  boolean;
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
 * instead of one per row - the single biggest commit speedup. A
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

  // Run the pre-fetch queries in parallel - they're independent.
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
      const { data, error: error2 } = await supabase
        .from("clients")
        .select("id, email, client_name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .or(orFilters.join(","));
      if (error2) {
        console.error("[imports/[id]/commit] clients fetch failed:", error2);
      }
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
      const { data, error: error3 } = await supabase
        .from("orders")
        .select("id, event_date, client_name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .in("event_date", Array.from(orderDates));
      if (error3) {
        console.error("[imports/[id]/commit] orders fetch failed:", error3);
      }
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

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
    if (profileErr) {
      console.error("[imports/[id]/commit] profiles fetch failed:", profileErr);
    }
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
    // Validated against regions for this tenant - a poisoned id
    // from another company is rejected rather than silently dropped.
    let targetRegionId: string | null = null;
    const requestedRegionId = (req.body && typeof req.body === "object")
      ? (req.body as any).region_id
      : null;
    if (typeof requestedRegionId === "string" && requestedRegionId.length === 36) {
      const { data: regionRow, error: regionRowErr } = await ssr
        .from("regions")
        .select("id")
        .eq("id", requestedRegionId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (regionRowErr) {
        console.error("[imports/[id]/commit] regions fetch failed:", regionRowErr);
      }
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
    // 1 000-row batch finishes in ~10-15s - well inside Vercel's
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
    // yet - without it TS chases the union forever ("Type
    // instantiation is excessively deep").
    const supabase = getServiceSupabase() as any;
    // Status-filtered fetch is the resume key. On the first call this
    // returns the batch-sized prefix of pending rows; on each
    // subsequent call it returns the next batch (the prior batch's
    // rows now have status='inserted'/'skipped'/'updated'/'error').
    // For dry runs we don't want to slice the dataset (the operator
    // is sanity-checking) but we also don't want to chew an entire
    // 11 000-row workbook in one request - cap at 1 000 for dry-run
    // sample.
    const rows = dryRun
      ? await listImportRows(jobId, { status: "pending", limit: 1000 })
      : await listImportRows(jobId, { status: "pending", limit: batchSize });

    const summary: CommitSummary = {
      clients:  { inserted: 0, updated: 0, skipped: 0, errored: 0 },
      orders:   { inserted: 0, updated: 0, skipped: 0, errored: 0 },
      leads:    { inserted: 0, updated: 0, skipped: 0, errored: 0 },
      quotes:   { inserted: 0, updated: 0, skipped: 0, errored: 0 },
      invoices: { inserted: 0, updated: 0, skipped: 0, errored: 0 },
      payments: { inserted: 0, updated: 0, skipped: 0, errored: 0 },
      dry_run: dryRun,
    };

    // Quarantine stamp (mirrors /api/onboarding/clients/bulk). Every
    // freshly INSERTED record carries imported_at + a 7-day
    // comms_paused_until so automated sequences (welcome, lead
    // auto-reply, after-sales, SLA/event reminders) don't fire on
    // historical data the moment it lands. The owner green-lights the
    // batch early from /admin/onboarding/imports, which calls
    // enable_comms_for_import_job to clear the pause on
    // clients/leads/orders/quotes for this job. Updates of existing
    // records deliberately do NOT get re-paused - they were already
    // live in the CRM.
    const COMMS_PAUSE_DAYS = 7;
    const importedAtIso = new Date().toISOString();
    const commsPausedUntilIso = new Date(
      Date.now() + COMMS_PAUSE_DAYS * 24 * 3600 * 1000,
    ).toISOString();

    // Four passes in dependency order: clients first so orders +
    // quotes can resolve client_id; leads runs independently (no FK
    // to clients/orders). Within a single commit batch the passes
    // run sequentially below.
    const clientRows  = rows.filter((r) => r.target_table === "clients"  && r.status !== "error");
    const orderRows   = rows.filter((r) => r.target_table === "orders"   && r.status !== "error");
    const quoteRows   = rows.filter((r) => r.target_table === "quotes"   && r.status !== "error");
    const invoiceRows = rows.filter((r) => r.target_table === "invoices" && r.status !== "error");
    const paymentRows = rows.filter((r) => r.target_table === "payments" && r.status !== "error");
    const leadRows    = rows.filter((r) => r.target_table === "leads"    && r.status !== "error");

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
    // Day 5 cross-sheet linker maps. Populated as orders + invoices
    // commit so subsequent passes (invoices link to orders by
    // order_number; payments link to invoices by invoice_number)
    // can resolve foreign keys against rows that just landed in
    // this same batch - no second DB round trip needed.
    const newOrderByNumber = new Map<string, { id: string; client_id: string | null }>();
    const newInvoiceByNumber = new Map<string, { id: string; client_id: string; order_id: string | null }>();

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

        // clients.email is NOT NULL + has a unique index, so a row with
        // no email can't be inserted. Rather than let the insert fail with
        // a cryptic Postgres "null value in column email" message, fail it
        // early with a human reason the errored-rows panel can show, so the
        // operator knows exactly what to fix / add manually.
        const cleanEmail = String(mapped.email ?? "").trim();
        if (!cleanEmail) {
          summary.clients.errored += 1;
          if (!dryRun) {
            await supabase.from("import_rows").update({
              status: "error",
              error_message: "Missing email - a client needs a unique email address. Add this one manually or fill the email column and re-import.",
            } as any).eq("id", r.id);
          }
          return;
        }

        const existing: string | null = stampedMatchId
          ?? (decision !== "create_new" ? lookupExistingClient(dedup, mapped) : null);

        const payload: any = {
          company_id: companyId,
          region_id: targetRegionId,
          client_name: mapped.client_name || mapped.company_name || "Imported client",
          email: cleanEmail,
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
          // Imported-history rollup (Feature B). Sparse - only the
          // columns the operator actually filled in get persisted;
          // rest stay null. Surfaced on the contact card so the
          // client doesn't look like a fresh signup.
          // Coerced so a free-text cell ("5 events", "R 12,000", "last
          // year") in these optional columns nulls out instead of failing
          // the numeric/date cast on insert.
          historical_total_events: toIntOrNull(mapped.historical_total_events),
          historical_lifetime_spend: toNumOrNull(mapped.historical_lifetime_spend),
          historical_last_event_date: toDateOrNull(mapped.historical_last_event_date),
          historical_last_event_type: mapped.historical_last_event_type || null,
          historical_notes: mapped.historical_notes || null,
        };

        if (existing && decision === "update") {
          if (!dryRun) {
            // Sparse merge - only fields present in the new sheet
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

        // Fresh insert only: quarantine automated comms for 7 days.
        payload.imported_at = importedAtIso;
        payload.comms_paused_until = commsPausedUntilIso;

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

        // Stub-client auto-creation. orders.client_id is NOT NULL on
        // the schema; if the operator's spreadsheet has an order whose
        // client isn't in the clients sheet AND isn't already in the
        // DB, we auto-create a thin client from this row's
        // name/email/phone so the order can land. The stub carries
        // the same import_job_id so rollback handles it.
        // Pre-audit (May 2026) this branch silently wrote
        // client_id=null and the insert failed - the bug the
        // strategic audit caught.
        if (!clientId && !dryRun) {
          const stubName = (mapped.client_name as string)?.trim()
            || (mapped.client_email as string) || "Imported client";
          const stubEmail = (mapped.client_email as string) || null;
          const stubPhone = (mapped.client_phone as string) || null;
          const { data: stub, error: stubErr } = await supabase
            .from("clients")
            .insert({
              company_id: companyId,
              region_id: targetRegionId,
              client_name: stubName,
              email: stubEmail,
              phone: stubPhone,
              is_active: true,
              import_job_id: jobId,
              imported_filename: importedFilename,
              imported_at: importedAtIso,
              comms_paused_until: commsPausedUntilIso,
              notes: "Auto-created from order import - no matching client row in the sheet.",
            })
            .select("id")
            .single();
          if (stubErr) throw new Error(`Stub client creation failed: ${stubErr.message}`);
          clientId = (stub as any).id;
          if (stubEmail) newClientByEmail.set(stubEmail.toLowerCase().trim(), clientId!);
          newClientByName.set(stubName.toLowerCase().trim(), clientId!);
          summary.clients.inserted += 1;
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
          // Preserve operator's existing order number when supplied.
          // Invoices in the same workbook link back via this column.
          order_number: mapped.order_number || null,
          event_name: mapped.event_name || null,
          event_date: mapped.event_date,
          event_time: mapped.event_time || null,
          guest_count: mapped.guest_count ?? null,
          venue_address: mapped.venue_address || null,
          total_amount: mapped.total_amount ?? null,
          deposit_amount: mapped.deposit_amount ?? null,
          dietary_requirements: mapped.dietary_requirements || null,
          // Default status: completed for past events, confirmed for
          // future. Operator can override with a status column.
          status: mapped.status
            || (mapped.event_date && String(mapped.event_date) < new Date().toISOString().slice(0, 10)
              ? "completed"
              : "confirmed"),
          import_job_id: jobId,
          imported_filename: importedFilename,
          // Quarantine: imported (historical) orders must not trigger
          // SLA monitors / event-approaching reminders / after-sales
          // sequences until the batch is green-lit.
          imported_at: importedAtIso,
          comms_paused_until: commsPausedUntilIso,
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
        const newOrderId = (inserted as any).id;
        // Day 5 cross-sheet linker: stash new order id by order_number
        // so an invoice in the same batch with that order_number can
        // resolve order_id without a DB round trip.
        if (mapped.order_number) {
          newOrderByNumber.set(String(mapped.order_number).trim(), {
            id: newOrderId,
            client_id: clientId,
          });
        }
        await supabase.from("import_rows").update({
          status: "inserted",
          target_id: newOrderId,
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

    // ── Invoices pass ────────────────────────────────────────────
    // Day 3 + Day 5. Runs after clients + orders so:
    //   - client_id can resolve against in-batch + DB clients
    //   - order_id can resolve against in-batch + DB orders by
    //     the operator's `order_number` column
    // Dedupe by invoice_number per company. Auto-derives status from
    // amount_paid + due_date when the operator's spreadsheet doesn't
    // ship one.
    await runChunked(invoiceRows, ROW_CONCURRENCY, async (r) => {
      try {
        const mapped = r.mapped_data || {};

        // Resolve client_id (same priority as orders).
        let clientId: string | null = null;
        if (mapped.client_email) {
          const k = String(mapped.client_email).toLowerCase().trim();
          clientId = newClientByEmail.get(k) ?? dedup.clientByEmail.get(k) ?? null;
        }
        if (!clientId && mapped.client_name) {
          const k = String(mapped.client_name).toLowerCase().trim();
          clientId = newClientByName.get(k) ?? dedup.clientByName.get(k) ?? null;
        }

        // Resolve order_id from order_number cross-sheet linker.
        let orderId: string | null = null;
        if (mapped.order_number) {
          const k = String(mapped.order_number).trim();
          const inBatch = newOrderByNumber.get(k);
          if (inBatch) {
            orderId = inBatch.id;
            // Inherit client_id from the linked order if invoice's
            // own client lookup didn't resolve.
            if (!clientId) clientId = inBatch.client_id;
          } else {
            // Fall back to a DB lookup - the operator may be
            // importing only invoices against orders that already
            // exist in the platform from a previous import.
            const { data: existingOrder, error: existingOrderErr } = await supabase
              .from("orders")
              .select("id, client_id")
              .eq("company_id", companyId)
              .eq("order_number", k)
              .is("deleted_at", null)
              .maybeSingle();
            if (existingOrderErr) {
              console.error("[imports/[id]/commit] orders fetch failed:", existingOrderErr);
            }
            if (existingOrder) {
              orderId = (existingOrder as any).id;
              if (!clientId) clientId = (existingOrder as any).client_id;
            }
          }
        }

        // invoices.client_id is NOT NULL. If we still can't resolve,
        // auto-create a stub client like we do on orders.
        if (!clientId && !dryRun) {
          const stubName = (mapped.client_name as string)?.trim()
            || (mapped.client_email as string) || "Imported invoice client";
          const stubEmail = (mapped.client_email as string) || null;
          const { data: stub, error: stubErr } = await supabase
            .from("clients")
            .insert({
              company_id: companyId,
              region_id: targetRegionId,
              client_name: stubName,
              email: stubEmail,
              is_active: true,
              import_job_id: jobId,
              imported_filename: importedFilename,
              imported_at: importedAtIso,
              comms_paused_until: commsPausedUntilIso,
              notes: "Auto-created from invoice import - no matching client row in the sheet.",
            })
            .select("id")
            .single();
          if (stubErr) throw new Error(`Stub client creation failed: ${stubErr.message}`);
          clientId = (stub as any).id;
          if (stubEmail) newClientByEmail.set(stubEmail.toLowerCase().trim(), clientId!);
          newClientByName.set(stubName.toLowerCase().trim(), clientId!);
          summary.clients.inserted += 1;
        }

        // Skip when this invoice number is already on file - before
        // commit so the operator sees a friendly message rather than
        // a unique-constraint violation.
        if (mapped.invoice_number) {
          const { data: existing, error: existingErr } = await supabase
            .from("invoices")
            .select("id")
            .eq("company_id", companyId)
            .eq("invoice_number", mapped.invoice_number)
            .is("deleted_at", null)
            .maybeSingle();
          if (existingErr) {
            console.error("[imports/[id]/commit] invoices fetch failed:", existingErr);
          }
          if (existing) {
            summary.invoices.skipped += 1;
            if (!dryRun) {
              await supabase.from("import_rows").update({
                status: "skipped",
                target_id: (existing as any).id,
                error_message: "Invoice with this number is already on file",
              } as any).eq("id", r.id);
            }
            return;
          }
        }

        const subtotal = Number(mapped.subtotal ?? mapped.total_amount ?? 0);
        const taxAmount = mapped.tax_amount != null ? Number(mapped.tax_amount) : 0;
        const total = Number(mapped.total_amount ?? subtotal + taxAmount);
        const amountPaid = Number(mapped.amount_paid ?? 0);
        const balanceDue = Math.max(0, total - amountPaid);

        // invoice_date defaults to today; due_date defaults to
        // invoice_date + 30 if blank (DB requires NOT NULL).
        const invoiceDate = (mapped.invoice_date as string) || new Date().toISOString().slice(0, 10);
        let dueDate = mapped.due_date as string | null;
        if (!dueDate) {
          const inv = new Date(invoiceDate);
          inv.setDate(inv.getDate() + 30);
          dueDate = inv.toISOString().slice(0, 10);
        }

        // Auto-derive status from amount_paid + due_date when blank.
        const today = new Date().toISOString().slice(0, 10);
        const autoStatus = amountPaid >= total ? "paid"
          : amountPaid > 0 ? "partially_paid"
          : (dueDate < today ? "overdue" : "sent");

        const invoicePayload: any = {
          company_id: companyId,
          region_id: targetRegionId,
          client_id: clientId,
          order_id: orderId,
          invoice_number: mapped.invoice_number,
          invoice_date: invoiceDate,
          due_date: dueDate,
          subtotal,
          tax_amount: taxAmount,
          total_amount: total,
          amount_paid: amountPaid,
          balance_due: balanceDue,
          status: mapped.status || autoStatus,
          notes: mapped.notes || null,
          // sent_at + paid_at if status implies them
          sent_at: (mapped.status === "sent" || mapped.status === "paid" || amountPaid > 0)
            ? invoiceDate
            : null,
          paid_at: (mapped.status === "paid" || amountPaid >= total)
            ? invoiceDate
            : null,
        };

        if (dryRun) {
          summary.invoices.inserted += 1;
          return;
        }

        const { data: inserted, error } = await supabase
          .from("invoices")
          .insert(invoicePayload)
          .select("id, invoice_number, client_id, order_id")
          .single();
        if (error) throw new Error(error.message);

        summary.invoices.inserted += 1;
        const newInvId = (inserted as any).id;
        // Stash for the payments pass linker.
        if (mapped.invoice_number) {
          newInvoiceByNumber.set(String(mapped.invoice_number).trim(), {
            id: newInvId,
            client_id: clientId!,
            order_id: orderId,
          });
        }
        await supabase.from("import_rows").update({
          status: "inserted",
          target_id: newInvId,
        } as any).eq("id", r.id);
      } catch (e: any) {
        summary.invoices.errored += 1;
        if (!dryRun) {
          await supabase.from("import_rows").update({
            status: "error",
            error_message: e?.message || "Invoice insert failed",
          } as any).eq("id", r.id);
        }
      }
    });

    // ── Payments pass ────────────────────────────────────────────
    // Day 4 + Day 5. Resolves invoice_id from the in-batch invoice
    // map first, then falls back to a DB lookup by invoice_number.
    // Inherits client_id + order_id from whichever invoice it links
    // to so the operator's payments sheet can be just amount + date
    // + invoice_number.
    await runChunked(paymentRows, ROW_CONCURRENCY, async (r) => {
      try {
        const mapped = r.mapped_data || {};

        let invoiceId: string | null = null;
        let clientId: string | null = null;
        let orderId: string | null = null;

        // Strongest link: invoice_number -> invoice row -> client_id
        // and order_id come for free.
        if (mapped.invoice_number) {
          const k = String(mapped.invoice_number).trim();
          const inBatch = newInvoiceByNumber.get(k);
          if (inBatch) {
            invoiceId = inBatch.id;
            clientId = inBatch.client_id;
            orderId = inBatch.order_id;
          } else {
            const { data: existingInv, error: existingInvErr } = await supabase
              .from("invoices")
              .select("id, client_id, order_id")
              .eq("company_id", companyId)
              .eq("invoice_number", k)
              .is("deleted_at", null)
              .maybeSingle();
            if (existingInvErr) {
              console.error("[imports/[id]/commit] invoices fetch failed:", existingInvErr);
            }
            if (existingInv) {
              invoiceId = (existingInv as any).id;
              clientId = (existingInv as any).client_id;
              orderId = (existingInv as any).order_id;
            }
          }
        }

        // Fallback: order_number -> order row.
        if (!orderId && mapped.order_number) {
          const k = String(mapped.order_number).trim();
          const inBatch = newOrderByNumber.get(k);
          if (inBatch) {
            orderId = inBatch.id;
            if (!clientId) clientId = inBatch.client_id;
          } else {
            const { data: existingOrd, error: existingOrdErr } = await supabase
              .from("orders")
              .select("id, client_id")
              .eq("company_id", companyId)
              .eq("order_number", k)
              .is("deleted_at", null)
              .maybeSingle();
            if (existingOrdErr) {
              console.error("[imports/[id]/commit] orders fetch failed:", existingOrdErr);
            }
            if (existingOrd) {
              orderId = (existingOrd as any).id;
              if (!clientId) clientId = (existingOrd as any).client_id;
            }
          }
        }

        const paymentDate = mapped.payment_date as string;
        const paymentPayload: any = {
          company_id: companyId,
          invoice_id: invoiceId,
          order_id: orderId,
          client_id: clientId,
          amount: Number(mapped.amount ?? 0),
          payment_date: paymentDate,
          payment_method: mapped.payment_method || "manual",
          payment_reference: mapped.payment_reference || null,
          payment_status: mapped.payment_status || "completed",
          payment_type: "payment",
          currency: "ZAR",
          notes: mapped.notes || null,
          processed_at: paymentDate,
        };

        if (dryRun) {
          summary.payments.inserted += 1;
          return;
        }

        const { data: inserted, error } = await supabase
          .from("payments")
          .insert(paymentPayload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);

        // If we linked an invoice, bump its amount_paid + balance_due
        // so the dashboard reflects the import without needing a
        // separate reconciliation run. Fire-and-forget; the trigger
        // on payments would do this server-side normally but the
        // import path bypasses some triggers depending on RLS.
        if (invoiceId) {
          try {
            await (supabase as any).rpc("recalc_invoice_totals", { p_invoice_id: invoiceId });
          } catch {
            // Trigger handles it on most paths; non-fatal.
          }
        }

        summary.payments.inserted += 1;
        await supabase.from("import_rows").update({
          status: "inserted",
          target_id: (inserted as any).id,
        } as any).eq("id", r.id);
      } catch (e: any) {
        summary.payments.errored += 1;
        if (!dryRun) {
          await supabase.from("import_rows").update({
            status: "error",
            error_message: e?.message || "Payment insert failed",
          } as any).eq("id", r.id);
        }
      }
    });

    // ── Quotes pass ──────────────────────────────────────────────
    // Runs after clients + orders (so quote.client_id can resolve
    // against any newly-inserted clients, including stubs the orders
    // pass auto-created). Quotes dedupe by quote_number per company
    // - the DB enforces uniqueness via a partial index, but we
    // skip-with-message before the insert so the operator sees a
    // clean "duplicate quote number" rather than a SQL error.
    await runChunked(quoteRows, ROW_CONCURRENCY, async (r) => {
      try {
        const mapped = r.mapped_data || {};

        // Resolve client_id, same priority as orders.
        let clientId: string | null = null;
        if (mapped.client_email) {
          const k = String(mapped.client_email).toLowerCase().trim();
          clientId = newClientByEmail.get(k) ?? dedup.clientByEmail.get(k) ?? null;
        }
        if (!clientId && mapped.client_name) {
          const k = String(mapped.client_name).toLowerCase().trim();
          clientId = newClientByName.get(k) ?? dedup.clientByName.get(k) ?? null;
        }
        // No stub-creation for quotes - quotes.client_id is nullable
        // on the schema, so a quote without a matched client just
        // lands with client_id=null and the dashboard handles it.

        // Skip if a quote with this number already exists for the
        // tenant. Cheaper than catching the unique-constraint error.
        if (mapped.quote_number) {
          const { data: existing, error: existingErr2 } = await supabase
            .from("quotes")
            .select("id")
            .eq("company_id", companyId)
            .eq("quote_number", mapped.quote_number)
            .is("deleted_at", null)
            .maybeSingle();
          if (existingErr2) {
            console.error("[imports/[id]/commit] quotes fetch failed:", existingErr2);
          }
          if (existing) {
            summary.quotes.skipped += 1;
            if (!dryRun) {
              await supabase.from("import_rows").update({
                status: "skipped",
                target_id: (existing as any).id,
                error_message: "Quote with this number is already on file",
              } as any).eq("id", r.id);
            }
            return;
          }
        }

        const total = Number(mapped.total_amount ?? 0);
        const subtotal = mapped.subtotal != null ? Number(mapped.subtotal) : total;
        // quotes.client_email is NOT NULL on the schema. If the
        // operator's spreadsheet doesn't have it, fall back to a
        // placeholder so the row still lands; operator can fix it
        // post-import on the quote detail page.
        const clientEmailForQuote: string =
          mapped.client_email || `imported-${mapped.quote_number}@unknown.local`;
        const quotePayload: any = {
          company_id: companyId,
          region_id: targetRegionId,
          client_id: clientId,
          client_name: mapped.client_name || null,
          client_email: clientEmailForQuote,
          client_phone: mapped.client_phone || null,
          quote_number: mapped.quote_number,
          quote_name: mapped.quote_name || "Imported quote",
          event_date: mapped.event_date || null,
          event_time: mapped.event_time || null,
          guest_count: mapped.guest_count ?? null,
          venue_address: mapped.venue_address || null,
          subtotal,
          tax_amount: mapped.tax_amount != null ? Number(mapped.tax_amount) : null,
          delivery_fee: mapped.delivery_fee != null ? Number(mapped.delivery_fee) : 0,
          total_amount: total,
          total: total,
          valid_until: mapped.valid_until || null,
          status: mapped.status || "sent",
          notes: mapped.notes || null,
          import_job_id: jobId,
          imported_filename: importedFilename,
          // Quarantine: enable_comms_for_import_job clears this once
          // the operator green-lights the batch.
          imported_at: importedAtIso,
          comms_paused_until: commsPausedUntilIso,
          external_source: "import",
        };

        if (dryRun) {
          summary.quotes.inserted += 1;
          return;
        }

        const { data: inserted, error } = await supabase
          .from("quotes")
          .insert(quotePayload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);

        summary.quotes.inserted += 1;
        await supabase.from("import_rows").update({
          status: "inserted",
          target_id: (inserted as any).id,
        } as any).eq("id", r.id);
      } catch (e: any) {
        summary.quotes.errored += 1;
        if (!dryRun) {
          await supabase.from("import_rows").update({
            status: "error",
            error_message: e?.message || "Quote insert failed",
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
            // Sparse merge (Feature F) - see clients pass for why.
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

        // Fresh insert only: quarantine automated comms for 7 days
        // (lead auto-reply / nurture sequences check these columns).
        payload.imported_at = importedAtIso;
        payload.comms_paused_until = commsPausedUntilIso;

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
    // If zero, we're done - flip the job to 'completed' and stamp the
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
            clients:  addCounts(priorCommit.clients,  summary.clients),
            orders:   addCounts(priorCommit.orders,   summary.orders),
            leads:    addCounts(priorCommit.leads,    summary.leads),
            quotes:   addCounts(priorCommit.quotes,   summary.quotes),
            invoices: addCounts(priorCommit.invoices, summary.invoices),
            payments: addCounts(priorCommit.payments, summary.payments),
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
            clients:  addCounts(priorCommit.clients,  summary.clients),
            orders:   addCounts(priorCommit.orders,   summary.orders),
            leads:    addCounts(priorCommit.leads,    summary.leads),
            quotes:   addCounts(priorCommit.quotes,   summary.quotes),
            invoices: addCounts(priorCommit.invoices, summary.invoices),
            payments: addCounts(priorCommit.payments, summary.payments),
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

    // On the final batch, return the rows that failed so the modal can
    // show "which ones + why" directly from the commit response - not only
    // via a separate post-commit refetch that could silently come back
    // empty. This is what the operator actually needs ("a few errored and
    // I have no idea which").
    let erroredRows: Array<{
      id: string; sheet: string; source_row_index: number | null;
      error_message: string | null; label: string;
    }> = [];
    if (isLastBatch && !dryRun) {
      try {
        const { data: errs } = await supabase
          .from("import_rows")
          .select("id, sheet, source_row_index, error_message, mapped_data, source_data")
          .eq("job_id", jobId)
          .eq("status", "error")
          .limit(5000);
        erroredRows = ((errs || []) as any[]).map((r) => {
          const m = (r.mapped_data || {}) as Record<string, any>;
          const s = (r.source_data || {}) as Record<string, any>;
          const picked =
            m.email || m.client_name || m.contact_name || m.name ||
            m.invoice_number || m.quote_number || m.order_number ||
            s.email || s.client_name || s.name ||
            Object.values(s).find((v) => typeof v === "string" && String(v).trim()) ||
            "(no identifier)";
          return {
            id: String(r.id),
            sheet: String(r.sheet || ""),
            source_row_index: r.source_row_index ?? null,
            error_message: r.error_message || null,
            label: String(picked).trim().slice(0, 80) || "(no identifier)",
          };
        });
      } catch (e) {
        console.warn("[imports/commit] errored-rows collection failed (non-fatal):", e);
      }
    }

    // Mirror /api/onboarding/clients/bulk: surface the quarantine
    // window so the result screen's "automated emails are paused"
    // copy is backed by the response, not just assumed. Only counts
    // fresh inserts - updates/skips of existing records aren't paused.
    const pausedInserts =
      summary.clients.inserted + summary.leads.inserted +
      summary.orders.inserted + summary.quotes.inserted;

    return res.status(200).json({
      ok: true,
      summary,
      processed: rows.length,
      remaining: remainingPending,
      more: !isLastBatch,
      erroredRows,
      comms_paused_for_days: (!dryRun && pausedInserts > 0) ? COMMS_PAUSE_DAYS : 0,
      comms_paused_until: (!dryRun && pausedInserts > 0) ? commsPausedUntilIso : null,
    });
  } catch (outer: any) {
    console.error("imports/[id]/commit handler crashed:", outer);
    return res.status(500).json({ error: dbErrorMessage(outer) || "Commit failed" });
  }
}

export default withApiLogging(handler);
