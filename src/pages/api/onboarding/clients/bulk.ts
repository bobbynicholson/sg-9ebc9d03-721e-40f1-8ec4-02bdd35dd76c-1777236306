/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/onboarding/clients/bulk
 *
 * The "easy" client-list importer. Takes a JSON array of rows the
 * caller has already parsed client-side from CSV / paste / xlsx. We
 * own the validation + insert + dedupe so the client UI doesn't have
 * to know about the clients schema.
 *
 * Body shape:
 *   { rows: Array<{ name, surname?, email, phone, notes? }> }
 *
 * Behaviour:
 *   - Tenant scoped (company_id from the session, never the body).
 *   - Caller-role allowlist: super_admin, company_admin, admin, owner.
 *   - Existing rows for this company with the same email are SKIPPED
 *     (case-insensitive) so re-running the import is safe.
 *   - Returns per-row outcome so the UI can show "imported / skipped /
 *     rejected" with reasons.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { normaliseEmail, normalisePhoneZA, normaliseFieldValue } from "@/lib/importNormalise";
import { withApiLogging } from "@/lib/withApiLogging";

// Thousands of rows per request (dedupe scan + chunked inserts) need more
// than the default function timeout.
export const maxDuration = 300;


const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

interface RowInput {
  name?: string;
  surname?: string;
  /** Business name (accounting exports keep it in its own column). */
  company_name?: string;
  email?: string;
  phone?: string;
  mobile_number?: string;
  landline_number?: string;
  notes?: string;
  client_type?: string;
  tax_number?: string;
  billing_address_line1?: string;
  billing_address_line2?: string;
  billing_city?: string;
  billing_postal_code?: string;
  payment_terms?: string;
  credit_limit?: string;
  tags?: string;
  historical_total_events?: string;
  historical_lifetime_spend?: string;
  historical_last_event_date?: string;
  historical_last_event_type?: string;
  historical_notes?: string;
}

interface RowOutcome {
  index: number;
  email: string | null;
  ok: boolean;
  reason?: string;
  status: "imported" | "skipped" | "rejected";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
    const role = (profile?.active_role || profile?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ error: "Owner or admin only" });
    }
    const companyId = profile?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account isn't linked to a company" });

    const rows = (req.body?.rows || []) as RowInput[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows[] is required" });
    }
    if (rows.length > 5000) {
      return res.status(413).json({ error: "Too many rows, cap is 5000 per upload." });
    }

    const supabase: any = getServiceSupabase();

    // Pull existing emails for this company so we can dedupe in memory
    // rather than fighting unique constraints row by row.
    // Paged: a single select is capped at 1000 rows, so with a bigger
    // client book most existing emails were invisible here, the insert
    // then hit the unique-email index and the whole import failed.
    const existingEmails = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data: page, error: pageError } = await supabase
        .from("clients")
        .select("email")
        .eq("company_id", companyId)
        .range(from, from + 999);
      if (pageError) {
        return res.status(503).json({ error: "Could not check existing clients. Please retry." });
      }
      for (const r of page || []) {
        const email = String((r as any).email || "").trim().toLowerCase();
        if (email) existingEmails.add(email);
      }
      if (!page || page.length < 1000) break;
    }

    // clients.region_id is NOT NULL with no default - resolve the tenant's
    // default region (oldest active) once so every inserted row carries it.
    // Without this the whole bulk insert 500'd and zero clients imported.
    const { data: regionRow } = await supabase
      .from("regions")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const defaultRegionId = (regionRow as any)?.id ?? null;

    const outcomes: RowOutcome[] = [];
    const toInsert: any[] = [];
    const seenInBatch = new Set<string>();
    // toInsert[n] came from rows[rowIndexOfInsert[n]].
    const rowIndexOfInsert: number[] = [];

    rows.forEach((row, i) => {
      const emailRaw = (row.email || "").trim();
      const emailRes = normaliseEmail(emailRaw);
      if (!emailRes.value) {
        outcomes.push({
          index: i,
          email: emailRaw || null,
          ok: false,
          status: "rejected",
          reason: emailRes.warnings[0] || "Email is required",
        });
        return;
      }
      const email = emailRes.value;

      const mobileRes = normalisePhoneZA(row.mobile_number || "");
      const landlineRes = normalisePhoneZA(row.landline_number || "");
      const phoneRes = normalisePhoneZA(row.phone || row.mobile_number || row.landline_number || "");

      // Combine name + surname into the single client_name column the
      // schema uses today. Keep both available in notes if useful.
      const name = String(row.name || "").trim();
      const surname = String(row.surname || "").trim();
      const person = [name, surname].filter(Boolean).join(" ").trim();
      const company = String(row.company_name || "").trim();
      // Company wins as the client name; the person becomes the contact.
      const fullName = company || person;
      const contactNote = company && person && company.toLowerCase() !== person.toLowerCase()
        ? `Contact: ${person}` : "";
      if (!fullName) {
        outcomes.push({
          index: i,
          email,
          ok: false,
          status: "rejected",
          reason: "Name is required",
        });
        return;
      }

      if (existingEmails.has(email) || seenInBatch.has(email)) {
        outcomes.push({
          index: i,
          email,
          ok: true,
          status: "skipped",
          reason: "Already on file, skipped",
        });
        return;
      }
      seenInBatch.add(email);

      const value = (key: string) => {
        const result = normaliseFieldValue(key, (row as any)[key]);
        return result.value == null || result.value === "" ? null : result.value;
      };

      toInsert.push({
        company_id: companyId,
        region_id: defaultRegionId,
        client_name: fullName,
        email,
        phone: phoneRes.value || "",
        mobile_number: mobileRes.value || null,
        landline_number: landlineRes.value || null,
        client_type: value("client_type") || (company ? "company" : "individual"),
        tax_number: value("tax_number"),
        billing_address_line1: value("billing_address_line1"),
        billing_address_line2: value("billing_address_line2"),
        billing_city: value("billing_city"),
        billing_postal_code: value("billing_postal_code"),
        payment_terms: value("payment_terms"),
        credit_limit: value("credit_limit"),
        tags: value("tags"),
        notes: [row.notes ? String(row.notes).trim() : "", contactNote].filter(Boolean).join("\n") || null,
        historical_total_events: value("historical_total_events"),
        historical_lifetime_spend: value("historical_lifetime_spend"),
        historical_last_event_date: value("historical_last_event_date"),
        historical_last_event_type: value("historical_last_event_type"),
        historical_notes: value("historical_notes"),
        is_active: true,
      });
      rowIndexOfInsert.push(i);
      outcomes.push({ index: i, email, ok: true, status: "imported" });
    });

    // Quarantine guard: every imported client gets stamped with
    // imported_at + comms_paused_until + an import_jobs row to tie
    // them to. Default pause window is 7 days; the owner can finish
    // it sooner via /admin/onboarding (calls enable_comms_for_import_job).
    // Without this, day-one of a new tenant would fire welcome
    // emails / after-sales sequences against historical data.
    let importJobId: string | null = null;
    if (toInsert.length > 0) {
      const { data: job, error: jobErr } = await supabase
        .from("import_jobs")
        .insert({
          company_id: companyId,
          source_filename: req.body?.filename || null,
          source_row_count: rows.length,
          status: "completed",
          kind: "easy_clients",
          created_by: user.id,
          completed_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (jobErr || !job) {
        return res.status(500).json({
          error: dbErrorMessage(jobErr) || "Could not register import job",
          outcomes,
        });
      }
      importJobId = job.id;

      const stampedAt = new Date().toISOString();
      const pausedUntil = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      for (const r of toInsert) {
        r.import_job_id = importJobId;
        r.imported_at = stampedAt;
        r.comms_paused_until = pausedUntil;
      }
    }

    // Insert in chunks. A chunk that fails (one bad row, or an email
    // added by someone else meanwhile) is retried row by row so the
    // good rows still land and each bad row gets its own reason.
    let insertedCount = 0;
    const markRow = (insertIndex: number, status: RowOutcome["status"], reason: string) => {
      const outcome = outcomes.find((o) => o.index === rowIndexOfInsert[insertIndex]);
      if (outcome) { outcome.status = status; outcome.ok = status !== "rejected"; outcome.reason = reason; }
    };
    for (let start = 0; start < toInsert.length; start += 500) {
      const chunk = toInsert.slice(start, start + 500);
      const { error: chunkError } = await supabase.from("clients").insert(chunk);
      if (!chunkError) { insertedCount += chunk.length; continue; }
      for (let k = 0; k < chunk.length; k += 1) {
        const { error: rowError } = await supabase.from("clients").insert(chunk[k]);
        if (!rowError) insertedCount += 1;
        else if (rowError.code === "23505") markRow(start + k, "skipped", "Already on file, skipped");
        else markRow(start + k, "rejected", dbErrorMessage(rowError) || "Could not save this client");
      }
    }

    return res.status(200).json({
      ok: true,
      total: rows.length,
      imported: insertedCount,
      skipped: outcomes.filter((o) => o.status === "skipped").length,
      rejected: outcomes.filter((o) => o.status === "rejected").length,
      // Surface the import job id so the onboarding UI can deep-link
      // to "review this batch + green-light comms" without a follow-up
      // round trip.
      import_job_id: importJobId,
      comms_paused_for_days: insertedCount > 0 ? 7 : 0,
      outcomes,
    });
  } catch (e: any) {
    console.error("/api/onboarding/clients/bulk crashed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "Client upload failed" });
  }
}

export default withApiLogging(handler);
