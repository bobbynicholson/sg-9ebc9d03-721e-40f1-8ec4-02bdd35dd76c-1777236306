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
import { withApiLogging } from "@/lib/withApiLogging";


// Preview also iterates every row - bump the per-route timeout for
// the same reason as commit.ts.
export const maxDuration = 300;

/**
 * Does this normalised phone string look like a mobile? After
 * normalisePhoneZA, SA mobiles look like `+27[678]xxxxxxxx` and SA
 * landlines look like `+27[1-5]xxxxxxxx`. Anything not matching is
 * treated as "could be either" (returns false so it doesn't displace
 * a known mobile but isn't displaced by one either).
 */
function isMobileShape(value: string): boolean {
  if (!value) return false;
  // After normalisePhoneZA, SA numbers always start with +27.
  // Mobile prefixes after the country code: 6, 7, 8.
  const m = /^\+?27([0-9])/.exec(value);
  if (m) return m[1] === "6" || m[1] === "7" || m[1] === "8";
  // Local format that didn't get country-coded for some reason.
  const l = /^0?([0-9])/.exec(value);
  if (l) return l[1] === "6" || l[1] === "7" || l[1] === "8";
  return false;
}

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
 * Bulk-fetch existing clients + leads for a list of emails. One round
 * trip per target table instead of one per import row - drops a 3821-
 * row preview from 7600 DB calls down to 2. Returns a lower-cased
 * email -> id map per table.
 *
 * RLS scopes by company_id; the service-role client used here ignores
 * RLS but we still pin company_id on the WHERE clause.
 */
async function buildExistingEmailIndex(
  supabase: any,
  companyId: string,
  clientEmails: Set<string>,
  leadEmails: Set<string>,
): Promise<{
  clientByEmail: Map<string, string>;
  leadByEmail: Map<string, string>;
}> {
  const clientByEmail = new Map<string, string>();
  const leadByEmail = new Map<string, string>();

  if (clientEmails.size > 0) {
    // Postgres `in.()` filter, lowercased emails. Supabase returns
    // null for empty arrays so guard.
    const list = Array.from(clientEmails);
    const { data, error: error2 } = await supabase
      .from("clients")
      .select("id, email")
      .eq("company_id", companyId)
      .in("email", list)
      .is("deleted_at", null);
    if (error2) {
      console.error("[imports/[id]/preview] clients fetch failed:", error2);
    }
    for (const row of (data || []) as Array<{ id: string; email: string | null }>) {
      if (row.email) clientByEmail.set(row.email.toLowerCase().trim(), row.id);
    }
  }

  if (leadEmails.size > 0) {
    const list = Array.from(leadEmails);
    // leads has both email + client_email - match on either.
    const { data: a, error: aErr } = await supabase
      .from("leads")
      .select("id, email")
      .eq("company_id", companyId)
      .in("email", list)
      .is("deleted_at", null);
    if (aErr) {
      console.error("[imports/[id]/preview] leads fetch failed:", aErr);
    }
    for (const row of (a || []) as Array<{ id: string; email: string | null }>) {
      if (row.email) leadByEmail.set(row.email.toLowerCase().trim(), row.id);
    }
    const { data: b, error: bErr } = await supabase
      .from("leads")
      .select("id, client_email")
      .eq("company_id", companyId)
      .in("client_email", list)
      .is("deleted_at", null);
    if (bErr) {
      console.error("[imports/[id]/preview] leads fetch failed:", bErr);
    }
    for (const row of (b || []) as Array<{ id: string; client_email: string | null }>) {
      if (row.client_email && !leadByEmail.has(row.client_email.toLowerCase().trim())) {
        leadByEmail.set(row.client_email.toLowerCase().trim(), row.id);
      }
    }
  }

  return { clientByEmail, leadByEmail };
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
      console.error("[imports/[id]/preview] profiles fetch failed:", profileErr);
    }
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

    // Pull every row in the job. Cap at 11k to give a small margin
     // above the 10k operator-facing limit set in app_config.import_row_cap.
    const rows = await listImportRows(jobId, { limit: 11000 });
    if (rows.length === 0) {
      return res.status(400).json({ error: "Import has no rows to preview" });
    }

    // Cast: import_rows isn't in the auto-generated Database types yet.
    const supabase = getServiceSupabase() as any;
    const summary: PreviewSummary = {
      total: rows.length, ok: 0, warnings: 0, errors: 0, duplicates: 0, by_target_table: {},
    };

    // ── Phase 1: derive mapped_data + validation status for every row,
    // collect emails for the bulk dedup lookup. No DB writes yet. ──
    type Computed = {
      id: string;
      mapped: Record<string, any>;
      target: "clients" | "orders" | "leads" | "quotes" | "invoices" | "payments";
      status: "pending" | "skipped" | "error";
      errorMessage: string | null;
      warnings: string[];
    };
    const computed: Computed[] = [];
    const clientEmailSet = new Set<string>();
    const leadEmailSet = new Set<string>();

    for (const r of rows) {
      try {
      const sheetMapping = (job.mapping as any)[r.sheet] || {};
      const schemaMeta = sheetMapping.__schema__;
      const declared = schemaMeta?.target as string | undefined;
      // Per-row target. Starts from the sheet-level declaration but
      // is reclassified row-by-row below based on event_date for the
      // clients/leads sheets (Feature D: lead-vs-client auto-class).
      let targetTable: "clients" | "orders" | "leads" | "quotes" | "invoices" | "payments" =
        declared === "orders" ? "orders"
        : declared === "leads" ? "leads"
        : declared === "quotes" ? "quotes"
        : declared === "invoices" ? "invoices"
        : declared === "payments" ? "payments"
        : "clients";

      const mapped: Record<string, any> = {};
      const warnings: string[] = [];
      for (const [header, raw] of Object.entries(r.source_data || {})) {
        const decision = sheetMapping[header];
        if (!decision || !decision.target || decision.target === "skip" || decision.target === "__schema__") continue;
        const norm = normaliseFieldValue(decision.target, raw);
        if (norm.warnings.length > 0) {
          // Field-qualify the warning ("field: <reason>"). normaliseFieldValue
          // only names the offending VALUE (e.g. `"South Africa" is not a
          // number`); without the field name the inline editor can't tell
          // which field to surface for the fix, so the operator was stuck.
          warnings.push(...norm.warnings.map((w) => `${decision.target}: ${w}`));
        }
        if (norm.value === null || norm.value === undefined || norm.value === "") continue;

        // Phone-shaped fields get smart-routed:
        //   - explicit Mobile column   -> mobile_number
        //   - explicit Landline column -> landline_number
        //   - generic Phone column     -> mobile_number if value looks
        //                                 like a mobile, else
        //                                 landline_number; ALSO mirror
        //                                 onto `phone` so legacy code
        //                                 still works
        // Last-write-wins for non-phone fields is intentional (final
        // column with a value should win, e.g. trailing notes column).
        if (decision.target === "mobile_number") {
          mapped.mobile_number = norm.value;
          if (!mapped.phone) mapped.phone = norm.value;
          continue;
        }
        if (decision.target === "landline_number") {
          mapped.landline_number = norm.value;
          if (!mapped.phone) mapped.phone = norm.value;
          continue;
        }
        if (decision.target === "phone" || decision.target === "client_phone") {
          const isMobile = isMobileShape(String(norm.value));
          // Generic phone column: route into the typed slot but also
          // keep on `phone` for backward compat with existing reads.
          if (decision.target === "phone") {
            if (isMobile && !mapped.mobile_number) mapped.mobile_number = norm.value;
            else if (!isMobile && !mapped.landline_number) mapped.landline_number = norm.value;
            mapped.phone = norm.value;
          } else {
            // client_phone (leads). Same routing pattern.
            if (isMobile && !mapped.mobile_number) mapped.mobile_number = norm.value;
            else if (!isMobile && !mapped.landline_number) mapped.landline_number = norm.value;
            mapped.client_phone = norm.value;
            if (!mapped.phone) mapped.phone = norm.value;
          }
          continue;
        }

        mapped[decision.target] = norm.value;
      }

      // ── Feature D: lead-vs-client auto-classification ─────────
      // The same template ships rows where some are real clients
      // (past or no event date) and others are leads (event still
      // ahead). Picking the right type per row saves the operator
      // from running two imports. Skip when the sheet was forced to
      // orders / quotes / invoices / payments - those pipelines
      // are unrelated.
      if (
        targetTable !== "orders"
        && targetTable !== "quotes"
        && targetTable !== "invoices"
        && targetTable !== "payments"
      ) {
        const eventDate = mapped.event_date as string | undefined;
        if (eventDate) {
          // event_date already normalised to ISO yyyy-mm-dd by
          // normaliseFieldValue. Compare lexicographically against
          // today (also yyyy-mm-dd) - avoids timezone surprises.
          const today = new Date().toISOString().slice(0, 10);
          targetTable = eventDate > today ? "leads" : "clients";
        }
        // No event_date -> stay with whatever the sheet declared.
        // Default sheet target is "clients" so an address-book CSV
        // with no events still lands the right way.
      }

      // leads has dual columns - both `email` + `client_email` are
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
      //   orders : must have (client_name OR client_email) AND event_date.
      //            The commit pass auto-creates a stub client when
      //            no match exists, so we just need a name/email
      //            handle to label the stub with.
      //   quotes : must have quote_number AND total_amount AND
      //            (client_name OR client_email).
      //   leads  : must have contact_name AND email
      let status: "pending" | "skipped" | "error" = "pending";
      let errorMessage: string | null = null;
      if (targetTable === "clients") {
        const hasContact =
          (mapped.client_name as string)?.trim() ||
          mapped.email || mapped.phone || mapped.mobile_number || mapped.landline_number;
        if (!hasContact) {
          status = "skipped";
          errorMessage = "No client name / email / phone";
        }
      } else if (targetTable === "orders") {
        const hasClientHandle =
          (mapped.client_name as string)?.trim() || mapped.client_email;
        if (!hasClientHandle) {
          status = "error";
          errorMessage = "Order is missing a client name or email";
        } else if (!mapped.event_date) {
          status = "error";
          errorMessage = "Order is missing an event date";
        }
      } else if (targetTable === "quotes") {
        const hasClientHandle =
          (mapped.client_name as string)?.trim() || mapped.client_email;
        if (!mapped.quote_number) {
          status = "error";
          errorMessage = "Quote is missing a quote number";
        } else if (!hasClientHandle) {
          status = "error";
          errorMessage = "Quote is missing a client name or email";
        } else if (mapped.total_amount == null) {
          status = "error";
          errorMessage = "Quote is missing a total amount";
        }
      } else if (targetTable === "invoices") {
        const hasClientHandle =
          (mapped.client_name as string)?.trim() || mapped.client_email;
        if (!mapped.invoice_number) {
          status = "error";
          errorMessage = "Invoice is missing an invoice number";
        } else if (!hasClientHandle) {
          status = "error";
          errorMessage = "Invoice is missing a client name or email";
        } else if (mapped.subtotal == null && mapped.total_amount == null) {
          status = "error";
          errorMessage = "Invoice is missing a subtotal or total";
        }
      } else if (targetTable === "payments") {
        if (mapped.amount == null) {
          status = "error";
          errorMessage = "Payment is missing an amount";
        } else if (!mapped.payment_date) {
          status = "error";
          errorMessage = "Payment is missing a date";
        } else if (!mapped.invoice_number && !mapped.order_number) {
          // Allowed but warned - the linker won't tie this to anything.
          warnings.push("No invoice or order reference - payment will land unlinked");
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

      // Stash for phase 2. Collect emails for the bulk dedup index.
      computed.push({
        id: r.id,
        mapped,
        target: targetTable,
        status,
        errorMessage,
        warnings,
      });

      if (status !== "error" && (targetTable === "clients" || targetTable === "leads")) {
        const email = ((mapped.email || mapped.client_email) ?? "").toString().trim().toLowerCase();
        if (email) {
          if (targetTable === "clients") clientEmailSet.add(email);
          else leadEmailSet.add(email);
        }
      }
      } catch (rowErr: any) {
        // A single malformed row (e.g. a numeric value where the code does
        // .trim(), or other unexpected cell shape) must NOT abort the whole
        // preview with a 500 - mark just that row as a fixable error and
        // carry on so the rest still preview + commit, and the operator sees
        // exactly which row failed in the errored-rows panel.
        console.error(`[imports/preview] row ${r.id} threw:`, rowErr?.message);
        computed.push({
          id: r.id,
          mapped: {},
          target: "clients",
          status: "error",
          errorMessage: `Row could not be processed: ${rowErr?.message || "unexpected value"}`,
          warnings: [],
        });
      }
    }

    // ── Phase 2: bulk dedup lookup. Two queries total. ──
    const { clientByEmail, leadByEmail } = await buildExistingEmailIndex(
      supabase, companyId, clientEmailSet, leadEmailSet,
    );

    // ── Phase 3: parallel row updates in batches of 50. Was one
    // serial update per row; for a 3821-row import that's 3821 round
    // trips and was the timeout cause. ──
    const updates = computed.map((c) => {
      const email = ((c.mapped.email || c.mapped.client_email) ?? "").toString().trim().toLowerCase();
      let dedupMatchId: string | null = null;
      let dedupMatchTable: "clients" | "leads" | null = null;
      let dedupDecision: "skip" | "update" | "create_new" | null = null;

      if (c.status !== "error" && (c.target === "clients" || c.target === "leads") && email) {
        const lookup = c.target === "clients" ? clientByEmail : leadByEmail;
        const match = lookup.get(email);
        if (match) {
          dedupMatchId = match;
          dedupMatchTable = c.target;
          dedupDecision = "skip";
          summary.duplicates += 1;
        }
      }

      if (c.status === "error") summary.errors += 1;
      else if (c.warnings.length > 0) summary.warnings += 1;
      else summary.ok += 1;
      summary.by_target_table[c.target] = (summary.by_target_table[c.target] || 0) + 1;

      return {
        id: c.id,
        patch: {
          mapped_data: c.mapped,
          target_table: c.target,
          status: c.status,
          error_message: c.errorMessage,
          preview_warnings: c.warnings,
          dedup_match_id: dedupMatchId,
          dedup_match_table: dedupMatchTable,
          dedup_decision: dedupDecision,
        },
      };
    });

    const BATCH_SIZE = 50;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((u) =>
        supabase.from("import_rows").update(u.patch as any).eq("id", u.id),
      ));
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

export default withApiLogging(handler);
