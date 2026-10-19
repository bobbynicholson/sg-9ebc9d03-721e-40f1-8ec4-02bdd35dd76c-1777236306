/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Import service - thin typed wrapper over the import_jobs /
 * import_rows / import_events tables.
 *
 * Used from API routes, never from the browser. The browser hits
 * /api/imports/* endpoints which use this module via the service-role
 * Supabase client (so RLS doesn't block trusted server-side writes).
 *
 * Lifecycle map:
 *   uploaded   - file landed + parsed to import_rows, awaiting AI map
 *   mapped     - AI returned a header->target mapping, team confirmed
 *   previewed  - mapping applied + normalised, summary rendered
 *   committing - inserts running
 *   completed  - inserts done
 *   failed     - aborted
 *   rolled_back - previously completed, now reversed
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { importLog } from "@/lib/importLog";

// Cast helper: the auto-generated Database types don't yet include
// import_jobs / import_rows / import_events (just landed in
// migrations). Without the cast TS chases the union forever ->
// "Type instantiation is excessively deep". Regenerate types via
// `supabase gen types` to drop this.
function sb() {
  return getServiceSupabase() as any;
}

export type ImportStatus =
  | "uploaded"
  | "mapped"
  | "previewed"
  | "committing"
  | "completed"
  | "failed"
  | "rolled_back";

export interface ImportJob {
  id: string;
  company_id: string;
  source_filename: string | null;
  source_file_path: string | null;
  source_mime: string | null;
  source_size_bytes: number | null;
  source_row_count: number | null;
  status: ImportStatus;
  mapping: any | null;
  summary: any | null;
  ai_call_cap: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  failed_at: string | null;
  failed_reason: string | null;
}

export interface ImportRow {
  id: string;
  job_id: string;
  sheet: string;
  source_row_index: number | null;
  source_data: any;
  mapped_data: any | null;
  target_table: string | null;
  target_id: string | null;
  status: "pending" | "inserted" | "updated" | "skipped" | "error";
  error_message: string | null;
  preview_warnings: string[] | null;
  created_at: string;
}

interface CreateJobInput {
  companyId: string;
  createdBy: string | null;
  filename: string;
  mime: string;
  sizeBytes: number;
  filePath: string | null;
  rowCount: number;
  rows: Array<{ sheet: string; rowIndex: number; data: Record<string, any> }>;
}

/**
 * Create a fresh import job + persist every parsed source row in a
 * single batch. Returns the job id so the caller can hand it to the
 * mapping step.
 */
export async function createImportJob(input: CreateJobInput): Promise<string> {
  const supabase = sb();

  const { data: job, error: jobErr } = await supabase
    .from("import_jobs")
    .insert({
      company_id: input.companyId,
      source_filename: input.filename,
      source_mime: input.mime,
      source_size_bytes: input.sizeBytes,
      source_file_path: input.filePath,
      source_row_count: input.rowCount,
      status: "uploaded",
      created_by: input.createdBy,
    } as any)
    .select("id")
    .single();
  if (jobErr || !job) {
    throw new Error(`Could not create import job: ${jobErr?.message}`);
  }
  const jobId = (job as any).id as string;

  // Bulk insert source rows. We chunk at 500 to stay clear of any
  // Postgres parameter limit on the JSONB payload size.
  const CHUNK = 500;
  for (let i = 0; i < input.rows.length; i += CHUNK) {
    const slice = input.rows.slice(i, i + CHUNK).map((r) => ({
      job_id: jobId,
      sheet: r.sheet,
      source_row_index: r.rowIndex,
      source_data: r.data,
      status: "pending" as const,
    }));
    if (slice.length > 0) {
      const { error: rowsErr } = await supabase.from("import_rows").insert(slice as any);
      if (rowsErr) {
        // Roll back the job we just created so we don't leave a
        // half-loaded artifact.
        await supabase.from("import_jobs").delete().eq("id", jobId);
        throw new Error(`Could not persist import rows: ${rowsErr.message}`);
      }
    }
  }

  await logEvent(jobId, "uploaded", {
    filename: input.filename,
    rows: input.rowCount,
    bytes: input.sizeBytes,
  });

  return jobId;
}

export async function getImportJob(jobId: string, companyId: string): Promise<ImportJob | null> {
  const supabase = sb();
  const { data, error } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) {
    console.warn("getImportJob failed", error);
    return null;
  }
  return data as ImportJob | null;
}

export async function listImportJobs(companyId: string, limit = 25): Promise<ImportJob[]> {
  const supabase = sb();
  const { data, error } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    // Throw instead of swallowing into []. A silent empty return made a
    // DB failure indistinguishable from "no imports yet" on the history
    // page. The /api/imports handler catches this, returns 500 with the
    // message, and the page renders its error card with Retry.
    console.error("listImportJobs failed", error);
    throw new Error(`Could not load import jobs: ${error.message || "database error"}`);
  }
  return (data || []) as ImportJob[];
}

/**
 * List import rows for a job. Pages through Supabase via .range() so a
 * 3.8k-row import doesn't get silently truncated - PostgREST caps a
 * single SELECT at 1000 rows by default regardless of .limit(N), which
 * was burning the back ~75% of every big import (status stayed
 * 'pending', mapped_data stayed null).
 *
 * Pulls 1000 at a time until the requested limit (or no more rows).
 */
export async function listImportRows(
  jobId: string,
  opts: { sheet?: string; status?: string; limit?: number } = {},
): Promise<ImportRow[]> {
  const supabase = sb();
  const PAGE = 1000;
  const cap = opts.limit ?? Infinity;
  const out: ImportRow[] = [];
  let from = 0;

  while (out.length < cap) {
    const remaining = cap - out.length;
    const to = from + Math.min(PAGE, remaining) - 1;
    let q = supabase
      .from("import_rows")
      .select("*")
      .eq("job_id", jobId)
      .order("source_row_index", { ascending: true })
      .range(from, to);
    if (opts.sheet) q = q.eq("sheet", opts.sheet);
    if (opts.status) q = q.eq("status", opts.status);
    const { data, error } = await q;
    if (error) {
      console.warn("listImportRows failed", error);
      return out;
    }
    const batch = (data || []) as ImportRow[];
    out.push(...batch);
    if (batch.length < PAGE) break; // no more rows
    from += PAGE;
  }

  return out;
}

export async function setJobStatus(
  jobId: string,
  status: ImportStatus,
  patch: Partial<{
    mapping: any;
    summary: any;
    failed_reason: string | null;
    completed_at: string | null;
    failed_at: string | null;
  }> = {},
): Promise<void> {
  const supabase = sb();
  const update: any = { status, ...patch };
  if (status === "completed" && !patch.completed_at) update.completed_at = new Date().toISOString();
  if (status === "failed" && !patch.failed_at) update.failed_at = new Date().toISOString();
  const { error } = await supabase.from("import_jobs").update(update).eq("id", jobId);
  if (error) throw new Error(`Could not update import job status: ${error.message}`);
  await logEvent(jobId, status, patch);
}

export async function logEvent(jobId: string, eventType: string, payload: any): Promise<void> {
  const supabase = sb();
  await supabase.from("import_events").insert({
    job_id: jobId,
    event_type: eventType,
    payload,
  } as any);
}

export interface RollbackResult {
  clientsDeleted: number;
  ordersDeleted: number;
  leadsDeleted: number;
  quotesDeleted: number;
  /** Imported quotes kept because the team has worked on them since. */
  quotesKept: number;
}

export interface ImportedQuoteCandidate {
  id: string;
  sent_at: string | null;
  accepted_at: string | null;
  converted_to_order_id: string | null;
}

/**
 * Which imported quotes a rollback may delete. A quote the team has
 * worked on since the import - sent from the app, accepted, or turned
 * into an order - is real business work now and is kept, the same way
 * converted leads are kept.
 */
export function splitImportedQuotesForRollback(
  candidates: ImportedQuoteCandidate[],
  quoteIdsWithOrders: Set<string>,
): { remove: string[]; keep: string[] } {
  const remove: string[] = [];
  const keep: string[] = [];
  for (const q of candidates) {
    const workedOn = !!q.sent_at || !!q.accepted_at || !!q.converted_to_order_id || quoteIdsWithOrders.has(q.id);
    (workedOn ? keep : remove).push(q.id);
  }
  return { remove, keep };
}

/**
 * Reverse a completed import: delete every clients + orders + leads +
 * quotes row that was stamped with this import_job_id, then mark the
 * job as rolled_back. Quotes worked on since the import are kept (see
 * splitImportedQuotesForRollback). Equipment reservations and past orders linked to those
 * clients survive only if the FK is ON DELETE SET NULL.
 *
 * Leads that have already been converted to a client
 * (converted_to_client_id IS NOT NULL) are deliberately spared --
 * the operator promoted them, the lead tied to the import is
 * effectively a real customer now and a rollback shouldn't wipe
 * downstream business work. The skipped count surfaces in the
 * summary so the operator knows.
 */
export async function rollbackImportJob(
  jobId: string,
  companyId: string,
): Promise<RollbackResult> {
  const supabase = sb();

  // Verify ownership before mutating anything.
  const job = await getImportJob(jobId, companyId);
  if (!job) throw new Error("Import job not found");
  if (job.status === "rolled_back") {
    return { clientsDeleted: 0, ordersDeleted: 0, leadsDeleted: 0, quotesDeleted: 0, quotesKept: 0 };
  }
  if (job.status !== "completed") {
    throw new Error(`Cannot roll back a job in status '${job.status}', only 'completed'`);
  }
  importLog.info(jobId, "rollback.start", "Rollback started", { companyId });

  // Orders first (they FK clients); quotes next (they FK clients too);
  // clients last.
  const { count: ordersDeleted } = await supabase
    .from("orders")
    .delete({ count: "exact" })
    .eq("import_job_id", jobId)
    .eq("company_id", companyId);
  importLog.info(jobId, "rollback.orders", "Imported orders removed", { removed: ordersDeleted ?? 0 });

  // Quotes: keep the ones worked on since the import.
  let quotesDeleted = 0;
  let quotesKept = 0;
  const { data: quoteCandidates, error: quoteCandidatesErr } = await supabase
    .from("quotes")
    .select("id, sent_at, accepted_at, converted_to_order_id")
    .eq("import_job_id", jobId)
    .eq("company_id", companyId);
  if (quoteCandidatesErr) {
    console.error("[importService] quotes lookup failed:", quoteCandidatesErr);
    importLog.error(jobId, "rollback.quotes", "Could not list imported quotes; none removed", { error: quoteCandidatesErr.message });
  }
  const candidates = (quoteCandidates || []) as ImportedQuoteCandidate[];
  if (candidates.length > 0) {
    const { data: linkedOrders, error: linkedOrdersErr } = await supabase
      .from("orders")
      .select("quote_id")
      .in("quote_id", candidates.map((q) => q.id));
    if (linkedOrdersErr) {
      // Can't tell which quotes became orders - keep them all.
      importLog.error(jobId, "rollback.quotes", "Could not check for orders made from these quotes; none removed", { error: linkedOrdersErr.message });
      quotesKept = candidates.length;
    } else {
      const withOrders = new Set(((linkedOrders || []) as any[]).map((o) => String(o.quote_id)));
      const { remove, keep } = splitImportedQuotesForRollback(candidates, withOrders);
      quotesKept = keep.length;
      if (keep.length > 0) {
        importLog.info(jobId, "rollback.quotes", "Kept quotes worked on since the import", { kept: keep });
      }
      if (remove.length > 0) {
        const { count, error } = await supabase
          .from("quotes")
          .delete({ count: "exact" })
          .in("id", remove)
          .eq("company_id", companyId);
        if (error) {
          importLog.error(jobId, "rollback.quotes", "Could not remove imported quotes", { tried: remove.length, error: error.message });
        } else {
          quotesDeleted = count ?? 0;
        }
      }
      importLog.info(jobId, "rollback.quotes", "Imported quotes removed", { removed: quotesDeleted, kept: quotesKept });
    }
  }

  const { count: clientsDeleted } = await supabase
    .from("clients")
    .delete({ count: "exact" })
    .eq("import_job_id", jobId)
    .eq("company_id", companyId);

  // Leads: skip ones already converted to clients.
  let leadsDeleted = 0;
  let leadsSkipped = 0;
  const { data: leadCandidates, error: leadCandidatesErr } = await supabase
    .from("leads")
    .select("id, converted_to_client_id")
    .eq("import_job_id", jobId)
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if (leadCandidatesErr) console.error("[importService] leads lookup failed:", leadCandidatesErr);
  for (const l of (leadCandidates || []) as any[]) {
    if (l.converted_to_client_id) {
      leadsSkipped += 1;
      continue;
    }
    const { error } = await supabase.from("leads").delete().eq("id", l.id);
    if (!error) leadsDeleted += 1;
  }

  await setJobStatus(jobId, "rolled_back", {
    summary: {
      ...(job.summary || {}),
      rolled_back_at: new Date().toISOString(),
      rolled_back_clients: clientsDeleted ?? 0,
      rolled_back_orders: ordersDeleted ?? 0,
      rolled_back_leads: leadsDeleted,
      rolled_back_leads_skipped_converted: leadsSkipped,
      rolled_back_quotes: quotesDeleted,
      rolled_back_quotes_kept: quotesKept,
    },
  });
  importLog.info(jobId, "rollback.done", "Rollback finished", {
    clients: clientsDeleted ?? 0, orders: ordersDeleted ?? 0, leads: leadsDeleted, leadsKept: leadsSkipped,
    quotes: quotesDeleted, quotesKept,
  });

  return {
    clientsDeleted: clientsDeleted ?? 0,
    ordersDeleted: ordersDeleted ?? 0,
    leadsDeleted,
    quotesDeleted,
    quotesKept,
  };
}
