/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Import service -- thin typed wrapper over the import_jobs /
 * import_rows / import_events tables.
 *
 * Used from API routes, never from the browser. The browser hits
 * /api/imports/* endpoints which use this module via the service-role
 * Supabase client (so RLS doesn't block trusted server-side writes).
 *
 * Lifecycle map:
 *   uploaded   -- file landed + parsed to import_rows, awaiting AI map
 *   mapped     -- AI returned a header->target mapping, team confirmed
 *   previewed  -- mapping applied + normalised, summary rendered
 *   committing -- inserts running
 *   completed  -- inserts done
 *   failed     -- aborted
 *   rolled_back -- previously completed, now reversed
 */
import { getServiceSupabase } from "@/lib/supabase/service";

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
  const supabase = getServiceSupabase();

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
  const supabase = getServiceSupabase();
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
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("listImportJobs failed", error);
    return [];
  }
  return (data || []) as ImportJob[];
}

export async function listImportRows(
  jobId: string,
  opts: { sheet?: string; status?: string; limit?: number } = {},
): Promise<ImportRow[]> {
  const supabase = getServiceSupabase();
  let q = supabase
    .from("import_rows")
    .select("*")
    .eq("job_id", jobId)
    .order("source_row_index", { ascending: true });
  if (opts.sheet) q = q.eq("sheet", opts.sheet);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) {
    console.warn("listImportRows failed", error);
    return [];
  }
  return (data || []) as ImportRow[];
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
  const supabase = getServiceSupabase();
  const update: any = { status, ...patch };
  if (status === "completed" && !patch.completed_at) update.completed_at = new Date().toISOString();
  if (status === "failed" && !patch.failed_at) update.failed_at = new Date().toISOString();
  const { error } = await supabase.from("import_jobs").update(update).eq("id", jobId);
  if (error) throw new Error(`Could not update import job status: ${error.message}`);
  await logEvent(jobId, status, patch);
}

export async function logEvent(jobId: string, eventType: string, payload: any): Promise<void> {
  const supabase = getServiceSupabase();
  await supabase.from("import_events").insert({
    job_id: jobId,
    event_type: eventType,
    payload,
  } as any);
}

export interface RollbackResult {
  clientsDeleted: number;
  ordersDeleted: number;
}

/**
 * Reverse a completed import: delete every clients + orders row that
 * was stamped with this import_job_id, then mark the job as
 * rolled_back. Reservations of equipment / past orders linked to
 * those clients survive only if the FK is ON DELETE SET NULL --
 * orders.client_id is, so we don't accidentally cascade further.
 */
export async function rollbackImportJob(
  jobId: string,
  companyId: string,
): Promise<RollbackResult> {
  const supabase = getServiceSupabase();

  // Verify ownership before mutating anything.
  const job = await getImportJob(jobId, companyId);
  if (!job) throw new Error("Import job not found");
  if (job.status === "rolled_back") return { clientsDeleted: 0, ordersDeleted: 0 };
  if (job.status !== "completed") {
    throw new Error(`Cannot roll back a job in status '${job.status}' -- only 'completed'`);
  }

  // Orders first (they FK clients); clients second.
  const { count: ordersDeleted } = await supabase
    .from("orders")
    .delete({ count: "exact" })
    .eq("import_job_id", jobId)
    .eq("company_id", companyId);
  const { count: clientsDeleted } = await supabase
    .from("clients")
    .delete({ count: "exact" })
    .eq("import_job_id", jobId)
    .eq("company_id", companyId);

  await setJobStatus(jobId, "rolled_back", {
    summary: {
      ...(job.summary || {}),
      rolled_back_at: new Date().toISOString(),
      rolled_back_clients: clientsDeleted ?? 0,
      rolled_back_orders: ordersDeleted ?? 0,
    },
  });

  return {
    clientsDeleted: clientsDeleted ?? 0,
    ordersDeleted: ordersDeleted ?? 0,
  };
}
