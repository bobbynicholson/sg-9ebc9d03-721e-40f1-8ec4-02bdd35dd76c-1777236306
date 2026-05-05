/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/imports/[id]/preview
 *
 * Apply the confirmed mapping to every source row, run the
 * deterministic field normalisers, and return a per-row preview the
 * wizard renders for human review before commit.
 *
 * Tenant scoping: company_id from session, RLS on import_jobs,
 * import_rows. No cross-tenant possibility.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  getImportJob, listImportRows, setJobStatus, logEvent,
} from "@/services/importService";
import { normaliseFieldValue } from "@/lib/importNormalise";

const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

interface PreviewSummary {
  total: number;
  ok: number;
  warnings: number;
  errors: number;
  duplicates: number;
  by_target_table: Record<string, number>;
}

/**
 * Look up an existing clients / leads row that this import row would
 * collide with at commit time. Email is the canonical key. Returns
 * null when there's no match (fresh row).
 */
async function findDuplicate(
  supabase: any,
  companyId: string,
  targetTable: "clients" | "leads",
  mapped: Record<string, any>,
): Promise<{ id: string; table: "clients" | "leads" } | null> {
  const email = (mapped.email || mapped.client_email || "").toString().trim();
  if (!email) return null;

  if (targetTable === "clients") {
    const { data } = await supabase
      .from("clients")
      .select("id")
      .eq("company_id", companyId)
      .ilike("email", email)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    return data ? { id: (data as any).id, table: "clients" } : null;
  }

  if (targetTable === "leads") {
    const { data } = await supabase
      .from("leads")
      .select("id")
      .eq("company_id", companyId)
      .or(`email.ilike.${email},client_email.ilike.${email}`)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    return data ? { id: (data as any).id, table: "leads" } : null;
  }

  return null;
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

    const job = await getImportJob(jobId, companyId);
    if (!job) return res.status(404).json({ error: "Import job not found" });
    if (!job.mapping) {
      return res.status(409).json({ error: "Mapping has not been generated yet, run the map step first" });
    }

    const rows = await listImportRows(jobId, { limit: 5000 });
    if (rows.length === 0) {
      return res.status(400).json({ error: "Import has no rows to preview" });
    }

    // Cast: import_rows isn't in the auto-generated Database types yet.
    const supabase = getServiceSupabase() as any;
    const summary: PreviewSummary = {
      total: rows.length, ok: 0, warnings: 0, errors: 0, duplicates: 0, by_target_table: {},
    };

    // Update each import_rows row in place with mapped_data + status +
    // warnings. Done one by one for clarity; 5k rows is small enough.
    for (const r of rows) {
      const sheetMapping = (job.mapping as any)[r.sheet] || {};
      const schemaMeta = sheetMapping.__schema__;
      const declared = schemaMeta?.target as string | undefined;
      const targetTable: "clients" | "orders" | "leads" =
        declared === "orders" ? "orders"
        : declared === "leads" ? "leads"
        : "clients";

      const mapped: Record<string, any> = {};
      const warnings: string[] = [];
      for (const [header, raw] of Object.entries(r.source_data || {})) {
        const decision = sheetMapping[header];
        if (!decision || !decision.target || decision.target === "skip" || decision.target === "__schema__") continue;
        const norm = normaliseFieldValue(decision.target, raw);
        if (norm.warnings.length > 0) warnings.push(...norm.warnings);
        if (norm.value !== null && norm.value !== undefined && norm.value !== "") {
          mapped[decision.target] = norm.value;
        }
      }

      // leads has dual columns -- both `email` + `client_email` are
      // NOT NULL, same for `contact_name` + `client_name`. Templates
      // collect one field; mirror to the other before insert so the
      // commit step doesn't fail on the constraint.
      if (targetTable === "leads") {
        if (mapped.client_email && !mapped.email) mapped.email = mapped.client_email;
        if (mapped.email && !mapped.client_email) mapped.client_email = mapped.email;
        if (mapped.contact_name && !mapped.client_name) mapped.client_name = mapped.contact_name;
        if (mapped.client_name && !mapped.contact_name) mapped.contact_name = mapped.client_name;
      }

      // Per-row validation. Hard rules:
      //   clients: must have at least client_name OR email OR phone
      //   orders : must have client_name and event_date
      //   leads  : must have contact_name AND email
      let status: "pending" | "skipped" | "error" = "pending";
      let errorMessage: string | null = null;
      if (targetTable === "clients") {
        const hasContact =
          (mapped.client_name as string)?.trim() ||
          mapped.email || mapped.phone;
        if (!hasContact) {
          status = "skipped";
          errorMessage = "No client name / email / phone";
        }
      } else if (targetTable === "orders") {
        if (!(mapped.client_name as string)?.trim()) {
          status = "error";
          errorMessage = "Order is missing a client name";
        } else if (!mapped.event_date) {
          status = "error";
          errorMessage = "Order is missing an event date";
        }
      } else if (targetTable === "leads") {
        if (!(mapped.contact_name as string)?.trim()) {
          status = "error";
          errorMessage = "Lead is missing a contact name";
        } else if (!mapped.email) {
          status = "error";
          errorMessage = "Lead is missing an email";
        }
      }

      // Inline dedup. Only relevant for clients + leads (orders dedup
      // by client + date and is decided at commit time). When a match
      // exists we stamp it on the row with a default decision of
      // 'skip' -- the wizard then exposes the choice to the operator.
      let dedupMatchId: string | null = null;
      let dedupMatchTable: "clients" | "leads" | null = null;
      let dedupDecision: "skip" | "update" | "create_new" | null = null;
      if (status !== "error" && (targetTable === "clients" || targetTable === "leads")) {
        const match = await findDuplicate(supabase, companyId, targetTable, mapped);
        if (match) {
          dedupMatchId = match.id;
          dedupMatchTable = match.table;
          dedupDecision = "skip";
          summary.duplicates += 1;
        }
      }

      if (status === "error") summary.errors += 1;
      else if (warnings.length > 0) summary.warnings += 1;
      else summary.ok += 1;
      summary.by_target_table[targetTable] = (summary.by_target_table[targetTable] || 0) + 1;

      await supabase
        .from("import_rows")
        .update({
          mapped_data: mapped,
          target_table: targetTable,
          status,
          error_message: errorMessage,
          preview_warnings: warnings,
          dedup_match_id: dedupMatchId,
          dedup_match_table: dedupMatchTable,
          dedup_decision: dedupDecision,
        } as any)
        .eq("id", r.id);
    }

    await setJobStatus(jobId, "previewed", {
      summary: {
        ...(job.summary || {}),
        preview: summary,
      },
    });
    await logEvent(jobId, "previewed", summary);

    return res.status(200).json({ ok: true, summary });
  } catch (outer: any) {
    console.error("imports/[id]/preview handler crashed:", outer);
    return res.status(500).json({ error: outer?.message || "Preview failed" });
  }
}
