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
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { normaliseEmail, normalisePhoneZA } from "@/lib/importNormalise";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

interface RowInput {
  name?: string;
  surname?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

interface RowOutcome {
  index: number;
  email: string | null;
  ok: boolean;
  reason?: string;
  status: "imported" | "skipped" | "rejected";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    const { data: existing } = await supabase
      .from("clients")
      .select("email")
      .eq("company_id", companyId);
    const existingEmails = new Set<string>(
      (existing || []).map((r: any) => String(r.email || "").toLowerCase()).filter(Boolean),
    );

    const outcomes: RowOutcome[] = [];
    const toInsert: any[] = [];
    const seenInBatch = new Set<string>();

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

      const phoneRes = normalisePhoneZA(row.phone || "");
      if (!phoneRes.value) {
        outcomes.push({
          index: i,
          email,
          ok: false,
          status: "rejected",
          reason: phoneRes.warnings[0] || "Phone number is required",
        });
        return;
      }

      // Combine name + surname into the single client_name column the
      // schema uses today. Keep both available in notes if useful.
      const name = String(row.name || "").trim();
      const surname = String(row.surname || "").trim();
      const fullName = [name, surname].filter(Boolean).join(" ").trim();
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

      toInsert.push({
        company_id: companyId,
        client_name: fullName,
        email,
        phone: phoneRes.value,
        notes: row.notes ? String(row.notes).trim() : null,
        is_active: true,
      });
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
          error: jobErr?.message || "Could not register import job",
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

    let insertedCount = 0;
    if (toInsert.length > 0) {
      const { data: inserted, error: insertErr } = await supabase
        .from("clients")
        .insert(toInsert)
        .select("id");
      if (insertErr) {
        return res.status(500).json({
          error: insertErr.message || "Could not insert clients",
          outcomes,
        });
      }
      insertedCount = (inserted || []).length;
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
    return res.status(500).json({ error: e?.message || "Client upload failed" });
  }
}
