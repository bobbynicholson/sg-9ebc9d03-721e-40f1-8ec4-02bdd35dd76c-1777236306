/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/imports/[id]/rows/[rowId]/repair
 *
 * Escalates a single broken import row to Claude for repair. The
 * deterministic preview pass flagged this row with warnings or an
 * error; the operator clicked 'AI repair' on it, so we send Claude
 * the raw cells, the current mapping and the warnings, and apply
 * whatever fixes come back to the row's mapped_data.
 *
 * Tenant scoping: company_id from session, the row + parent job are
 * both checked against it.
 *
 * Cost: one Haiku call per row. The wizard surfaces this on demand
 * only, so the volume tracks how many bad rows the operator wants
 * help with, not the size of the file.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getImportJob, listImportRows, logEvent } from "@/services/importService";
import { repairRowViaAI } from "@/lib/importAi";

const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
      console.error("[imports/[id]/rows/[rowId]/repair] profiles fetch failed:", profileErr);
    }
    const role = (profile?.active_role || profile?.role || "") as string;
    if (!ALLOWED_CALLER_ROLES.has(role)) {
      return res.status(403).json({ error: "Only owners / admins can run AI repair" });
    }
    const companyId = profile?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: "AI row repair is not configured, set ANTHROPIC_API_KEY on the server.",
      });
    }

    const jobId = String(req.query.id || "");
    const rowId = String(req.query.rowId || "");
    if (!jobId || !rowId) return res.status(400).json({ error: "Missing job id or row id" });

    const job = await getImportJob(jobId, companyId);
    if (!job) return res.status(404).json({ error: "Import job not found" });

    // Pull this single row. Using the existing listImportRows + filter
    // keeps the RLS / company scope checks consistent with the rest of
    // the wizard.
    const rows = await listImportRows(jobId, { limit: 11000 });
    const row = rows.find((r) => r.id === rowId);
    if (!row) return res.status(404).json({ error: "Row not found on this job" });

    const targetTable: "clients" | "orders" =
      (row.target_table as any) === "orders" ? "orders" : "clients";

    const { result, tokens_in, tokens_out } = await repairRowViaAI({
      rawRow: (row.source_data as any) || {},
      mappedRow: (row.mapped_data as any) || {},
      warnings: row.preview_warnings || [],
      errorMessage: row.error_message,
      targetTable,
    });

    // Apply Claude's fixes on top of the existing mapped_data. Operator
    // sees the result + the rationale on the next page poll and can
    // accept (do nothing) or revert (we keep the original row in
    // source_data, so a fresh preview run resets it).
    const currentMapped = (row.mapped_data as any) || {};
    const repairedMapped: Record<string, any> = { ...currentMapped };
    for (const [k, v] of Object.entries(result.fixes || {})) {
      // Skip null fixes - the model uses null to mean "I can't fill
      // this either", which we already knew.
      if (v === null || v === undefined) continue;
      repairedMapped[k] = v;
    }

    // Re-run the same per-row validation the preview endpoint uses so
    // the row's status flips to 'pending' if the fixes resolved the
    // hard rules.
    let nextStatus: "pending" | "skipped" | "error" = "pending";
    let nextErrorMessage: string | null = null;
    if (targetTable === "clients") {
      const hasContact =
        (repairedMapped.client_name as string)?.trim() ||
        repairedMapped.email || repairedMapped.phone;
      if (!hasContact) {
        nextStatus = "skipped";
        nextErrorMessage = "No client name / email / phone";
      }
    } else if (targetTable === "orders") {
      if (!(repairedMapped.client_name as string)?.trim()) {
        nextStatus = "error";
        nextErrorMessage = "Order is missing a client name";
      } else if (!repairedMapped.event_date) {
        nextStatus = "error";
        nextErrorMessage = "Order is missing an event date";
      }
    }

    const supabase = getServiceSupabase() as any;
    await supabase
      .from("import_rows")
      .update({
        mapped_data: repairedMapped,
        status: nextStatus,
        error_message: nextErrorMessage,
        // Replace warnings with whatever Claude couldn't auto-resolve.
        // Operator sees a much shorter list focused on real follow-ups.
        preview_warnings: result.unresolved,
        // Stash the rationale on source_data.__ai_repair so the UI can
        // surface it next to the row. Doesn't affect commit.
        source_data: {
          ...((row.source_data as any) || {}),
          __ai_repair: {
            rationale: result.rationale,
            applied: Object.keys(result.fixes || {}),
            at: new Date().toISOString(),
          },
        },
      } as any)
      .eq("id", rowId);

    await logEvent(jobId, "row_repaired", {
      row_id: rowId,
      applied: Object.keys(result.fixes || {}),
      tokens_in,
      tokens_out,
    });

    return res.status(200).json({
      ok: true,
      result,
      ai: { tokens_in, tokens_out },
      mapped_data: repairedMapped,
      status: nextStatus,
      error_message: nextErrorMessage,
    });
  } catch (e: any) {
    console.error("/api/imports/[id]/rows/[rowId]/repair crashed:", e);
    return res.status(500).json({ error: e?.message || "Row repair failed" });
  }
}
