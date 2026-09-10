/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * GET  /api/admin/numbering-settings
 *  -> returns the calling tenant's three settings rows (invoice, quote,
 *     order). Auto-creates defaults via the same backfill logic.
 *
 * POST /api/admin/numbering-settings
 *  -> body: { document_type, prefix, padding, include_year,
 *             year_separator, resets_yearly, next_number,
 *             effective_from, notes, reason }
 *
 * Owner / company_admin / admin only. Validates that next_number
 * cannot regress past the highest existing parsed sequence on the
 * relevant table - so an operator can't accidentally re-issue an
 * already-used number.
 *
 * Writes a before/after diff to company_number_settings_audit.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const DOC_TYPES = ["invoice", "quote", "order"] as const;
type DocType = (typeof DOC_TYPES)[number];

const DOC_TABLE: Record<DocType, { table: string; column: string }> = {
  invoice: { table: "invoices", column: "invoice_number" },
  quote: { table: "quotes", column: "quote_number" },
  order: { table: "orders", column: "order_number" },
};

function parseTrailingSeq(numStr: string | null): number {
  if (!numStr) return 0;
  const m = numStr.match(/(\d+)$/);
  if (!m) return 0;
  const big = Number(m[1]);
  if (!Number.isFinite(big)) return 0;
  if (big < 1 || big > 2147483646) return 0;
  return big;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ error: "Owner or admin only" });
    }
    const companyId = (profile as any)?.company_id as string | null;
    if (!companyId && role !== "super_admin") {
      return res.status(400).json({ error: "Profile has no company_id" });
    }

    const admin = getServiceSupabase();

    if (req.method === "GET") {
      const targetCompany = (req.query.company_id as string | undefined) || companyId;
      if (!targetCompany) return res.status(400).json({ error: "company_id missing" });
      if (role !== "super_admin" && targetCompany !== companyId) {
        return res.status(403).json({ error: "Cannot read another company's settings" });
      }

      // Ensure rows exist for all three doc types. Calling the consume
      // RPC would advance the counter - instead, read what's there
      // and fill any missing rows with sane defaults.
      const { data: existing, error: existingErr } = await admin
        .from("company_number_settings")
        .select("*")
        .eq("company_id", targetCompany);
      if (existingErr) {
        console.error("[admin/numbering-settings] company_number_settings fetch failed:", existingErr);
      }
      const haveTypes = new Set((existing || []).map((r: any) => r.document_type));
      const toInsert = DOC_TYPES.filter((t) => !haveTypes.has(t)).map((t) => ({
        company_id: targetCompany,
        document_type: t,
        prefix: t === "invoice" ? "INV-" : t === "quote" ? "QUO-" : "ORD-",
        padding: 6,
        next_number: 1,
      }));
      if (toInsert.length > 0) {
        await admin.from("company_number_settings").insert(toInsert);
      }
      const { data: settings, error: settingsErr } = await admin
        .from("company_number_settings")
        .select("*")
        .eq("company_id", targetCompany)
        .order("document_type");
      if (settingsErr) {
        console.error("[admin/numbering-settings] company_number_settings fetch failed:", settingsErr);
      }

      // Pull the highest-issued seq per doc type so the UI can show
      // "you've already issued up to ..." hints.
      const stats: Record<string, { highest: number; sample: string | null }> = {};
      for (const t of DOC_TYPES) {
        const { table, column } = DOC_TABLE[t];
        const { data: rows, error: rowsErr } = await admin
          .from(table)
          .select(column)
          .eq("company_id", targetCompany)
          .not(column, "is", null);
        if (rowsErr) {
          console.error("[admin/numbering-settings] supabase op failed:", rowsErr);
        }
        let highest = 0;
        let sample: string | null = null;
        for (const r of rows || []) {
          const v = (r as any)[column] as string | null;
          const n = parseTrailingSeq(v);
          if (n > highest) {
            highest = n;
            sample = v;
          }
        }
        stats[t] = { highest, sample };
      }

      return res.status(200).json({ settings: settings || [], stats });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const docType = String(body.document_type || "") as DocType;
      if (!DOC_TYPES.includes(docType)) {
        return res.status(400).json({ error: "Invalid document_type" });
      }

      const targetCompany = (body.company_id as string | undefined) || companyId;
      if (!targetCompany) return res.status(400).json({ error: "company_id missing" });
      if (role !== "super_admin" && targetCompany !== companyId) {
        return res.status(403).json({ error: "Cannot modify another company's settings" });
      }

      // Coerce + validate inputs.
      const prefix = String(body.prefix ?? "").slice(0, 16);
      if (!/^[A-Za-z0-9 _\-/.]*$/.test(prefix)) {
        return res.status(400).json({ error: "Prefix may only contain letters, digits, spaces, hyphens, slashes, dots or underscores." });
      }

      const padding = Math.max(3, Math.min(10, parseInt(body.padding, 10) || 6));
      const includeYear = Boolean(body.include_year);
      const yearSeparator = body.year_separator === "/" ? "/" : "-";
      const resetsYearly = Boolean(body.resets_yearly) && includeYear;
      const nextNumber = Math.max(1, parseInt(body.next_number, 10) || 1);
      const effectiveFrom = body.effective_from
        ? String(body.effective_from).slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const notes = body.notes ? String(body.notes).slice(0, 500) : null;
      const reason = body.reason ? String(body.reason).slice(0, 500) : null;

      // Validate next_number doesn't regress past existing data.
      const { table, column } = DOC_TABLE[docType];
      const { data: rows } = await admin
        .from(table)
        .select(column)
        .eq("company_id", targetCompany)
        .not(column, "is", null);
      let highest = 0;
      let highestSample: string | null = null;
      for (const r of rows || []) {
        const v = (r as any)[column] as string | null;
        const n = parseTrailingSeq(v);
        if (n > highest) {
          highest = n;
          highestSample = v;
        }
      }
      if (nextNumber <= highest) {
        return res.status(422).json({
          error: `You've already issued up to ${highestSample || `#${highest}`}. Next must be at least ${highest + 1}.`,
          highest,
          highestSample,
        });
      }

      // Read current row for diffing.
      const { data: before } = await admin
        .from("company_number_settings")
        .select("*")
        .eq("company_id", targetCompany)
        .eq("document_type", docType)
        .maybeSingle();

      const upsertRow = {
        company_id: targetCompany,
        document_type: docType,
        prefix,
        padding,
        include_year: includeYear,
        year_separator: yearSeparator,
        resets_yearly: resetsYearly,
        next_number: nextNumber,
        effective_from: effectiveFrom,
        notes,
        updated_at: new Date().toISOString(),
        updated_by_user_id: user.id,
      };

      const { data: after, error: upsertErr } = await admin
        .from("company_number_settings")
        .upsert(upsertRow, { onConflict: "company_id,document_type" })
        .select("*")
        .single();

      if (upsertErr) {
        console.error("[numbering-settings] upsert failed:", upsertErr);
        return res.status(500).json({ error: dbErrorMessage(upsertErr) });
      }

      // Audit log. Service role bypasses RLS so this writes regardless
      // of insert-policy state.
      await admin.from("company_number_settings_audit").insert({
        company_id: targetCompany,
        document_type: docType,
        changed_by_user_id: user.id,
        before: before || null,
        after: after || null,
        reason,
      });

      return res.status(200).json({ ok: true, after });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("[numbering-settings] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Server error" });
  }
}

export default withApiLogging(handler);
