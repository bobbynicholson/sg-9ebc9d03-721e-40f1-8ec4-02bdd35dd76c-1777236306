/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/imports/[id]/rows/[rowId]/edit
 *
 * Manual override path. Operator clicks "Fix" on a flagged row in
 * the preview wizard, types corrections in a dialog, hits save -- we
 * apply those corrections to the row's mapped_data, re-run the
 * deterministic per-field normaliser, re-run per-row validation, and
 * flip the status back to 'pending' if the fix resolves the issue.
 *
 * Sibling of the AI repair endpoint (./repair.ts) -- same data
 * shape and validation rules, just a different fix source. The
 * normalise + validate logic is intentionally duplicated here rather
 * than extracted to keep the endpoint self-contained; the rules are
 * a single screenful and stable.
 *
 * Tenant scoping: company_id from session, the row + parent job
 * are both checked against it.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getImportJob, listImportRows, logEvent } from "@/services/importService";
import { normaliseFieldValue } from "@/lib/importNormalise";

const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

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
      return res.status(403).json({ error: "Only owners / admins can edit import rows" });
    }
    const companyId = profile?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    const jobId = String(req.query.id || "");
    const rowId = String(req.query.rowId || "");
    if (!jobId || !rowId) return res.status(400).json({ error: "Missing job id or row id" });

    const overrides = (req.body && typeof req.body === "object" ? (req.body as any).overrides : null) || {};
    if (typeof overrides !== "object" || Array.isArray(overrides)) {
      return res.status(400).json({ error: "Body must include an `overrides` object." });
    }

    const job = await getImportJob(jobId, companyId);
    if (!job) return res.status(404).json({ error: "Import job not found" });

    const rows = await listImportRows(jobId, { limit: 11000 });
    const row = rows.find((r) => r.id === rowId);
    if (!row) return res.status(404).json({ error: "Row not found on this job" });

    const targetTable: "clients" | "orders" | "leads" =
      (row.target_table as any) === "orders" ? "orders"
      : (row.target_table as any) === "leads" ? "leads"
      : "clients";

    // Apply the overrides through the same normaliser the preview
    // pass uses so a "082 555 1234" typed in the fix dialog ends up
    // as "+27825551234" -- the operator sees consistent shapes
    // either side of the fix.
    const currentMapped = (row.mapped_data as any) || {};
    const nextMapped: Record<string, any> = { ...currentMapped };
    const fieldWarnings: string[] = [];
    for (const [key, raw] of Object.entries(overrides)) {
      if (raw === null || raw === undefined || raw === "") {
        delete nextMapped[key];
        continue;
      }
      const norm = normaliseFieldValue(key, raw);
      if (norm.warnings.length > 0) fieldWarnings.push(...norm.warnings);
      if (norm.value !== null && norm.value !== undefined && norm.value !== "") {
        nextMapped[key] = norm.value;
      }
    }

    // Re-run per-row validation, mirroring preview.ts.
    let nextStatus: "pending" | "skipped" | "error" = "pending";
    let nextErrorMessage: string | null = null;
    if (targetTable === "clients") {
      const hasContact =
        (nextMapped.client_name as string)?.trim() ||
        nextMapped.email || nextMapped.phone || nextMapped.mobile_number || nextMapped.landline_number;
      if (!hasContact) {
        nextStatus = "skipped";
        nextErrorMessage = "No client name / email / phone";
      }
    } else if (targetTable === "orders") {
      if (!(nextMapped.client_name as string)?.trim()) {
        nextStatus = "error";
        nextErrorMessage = "Order is missing a client name";
      } else if (!nextMapped.event_date) {
        nextStatus = "error";
        nextErrorMessage = "Order is missing an event date";
      }
    } else if (targetTable === "leads") {
      if (!(nextMapped.contact_name as string)?.trim()) {
        nextStatus = "error";
        nextErrorMessage = "Lead is missing a contact name";
      } else if (!nextMapped.email) {
        nextStatus = "error";
        nextErrorMessage = "Lead is missing an email";
      }
    }

    const supabase = getServiceSupabase() as any;
    await supabase
      .from("import_rows")
      .update({
        mapped_data: nextMapped,
        status: nextStatus,
        error_message: nextErrorMessage,
        // Replace any prior warnings with whatever this edit produced.
        preview_warnings: fieldWarnings,
        // Stash a small audit trail on source_data so the UI can show
        // "edited at 12:34 by you" without needing a separate table.
        source_data: {
          ...((row.source_data as any) || {}),
          __manual_edit: {
            applied: Object.keys(overrides),
            by: user.id,
            at: new Date().toISOString(),
          },
        },
      } as any)
      .eq("id", rowId);

    await logEvent(jobId, "row_edited", {
      row_id: rowId,
      applied: Object.keys(overrides),
    });

    return res.status(200).json({
      ok: true,
      mapped_data: nextMapped,
      status: nextStatus,
      error_message: nextErrorMessage,
      warnings: fieldWarnings,
    });
  } catch (e: any) {
    console.error("/api/imports/[id]/rows/[rowId]/edit crashed:", e);
    return res.status(500).json({ error: e?.message || "Row edit failed" });
  }
}
