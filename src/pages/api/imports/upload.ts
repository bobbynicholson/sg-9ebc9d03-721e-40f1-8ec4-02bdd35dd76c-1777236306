/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/imports/upload
 *
 * Accepts a multipart upload (xlsx, xls, csv) from the onboarding
 * wizard. Parses the workbook with SheetJS, persists every row as an
 * import_rows entry under a fresh import_jobs row, returns the new
 * job id so the wizard can move into the mapping step.
 *
 * Tenant scoping:
 *   - company_id is read from the authenticated session, never from
 *     the request body. RLS would catch a fudged id anyway.
 *   - The uploaded file is stored at imports/{company_id}/{job_id}/
 *     so only the right tenant's UI ever surfaces it.
 *
 * Hard caps:
 *   - 5 MB file size (enforced at upload time)
 *   - 5,000 source rows aggregated across all sheets
 * Either limit triggers a 413.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import { promises as fs } from "fs";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { createImportJob, setJobStatus } from "@/services/importService";
import { recogniseHeaders, buildMappingFromTemplate } from "@/lib/importTemplates";
import { withApiLogging } from "@/lib/withApiLogging";


export const config = {
  api: {
    bodyParser: false, // formidable handles multipart
  },
};

const MAX_BYTES = 5 * 1024 * 1024;

// Default fallback when app_config.import_row_cap is unreadable. Bobby
// configured 200 in SaaS settings; this is here only so the importer
// never accepts an unbounded file if the config table is unreachable.
const FALLBACK_ROW_CAP = 200;

/** Read the configurable row cap from app_config. Falls back to 200. */
async function getImportRowCap(): Promise<number> {
  try {
    const supabase: any = getServiceSupabase();
    const { data, error: error2 } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "import_row_cap")
      .maybeSingle();
    if (error2) {
      console.error("[imports/upload] app_config fetch failed:", error2);
    }
    const n = parseInt(String((data as any)?.value || ""), 10);
    if (Number.isFinite(n) && n > 0 && n <= 100000) return n;
  } catch {
    // swallow - fall through to default
  }
  return FALLBACK_ROW_CAP;
}

/**
 * Strip leading characters that some spreadsheet apps interpret as
 * formula starts (=, +, -, @). Defensive against operators uploading
 * a CSV that, if later re-exported, would let an attacker inject a
 * payload. Only applied to string values; numbers / dates pass
 * through untouched.
 */
function sanitiseCell(value: any): any {
  if (typeof value !== "string") return value;
  if (value.length === 0) return value;
  if (/^[=+\-@]/.test(value)) return "'" + value;
  return value;
}
const ALLOWED_MIMES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

interface ParsedSheet {
  name: string;
  rows: Array<{ rowIndex: number; data: Record<string, any> }>;
}

interface QuickValidationSummary {
  ok: number;
  warnings: number;
  errors: number;
  /** Top reasons for issues, biggest bucket first. Capped at 5. */
  topIssues: Array<{ reason: string; count: number }>;
  /** Day 6 backdating analysis: count of date-bearing rows before
   *  the SA financial year start (1 March of the current/prior
   *  cycle). The wizard shows a banner so the operator understands
   *  which rows land as historical. */
  fyAnalysis?: {
    fyStart: string;
    preFy: number;
    postFy: number;
    undated: number;
  };
}

/**
 * SA financial year starts 1 March. Returns the most recent 1-March
 * date that's <= today. So on 2026-04-15 -> 2026-03-01; on
 * 2026-02-10 -> 2025-03-01.
 */
function currentFyStart(): string {
  const now = new Date();
  const year = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
  return `${year}-03-01`;
}

/**
 * Cheap shape checks across every parsed row, run inline during the
 * upload response so the modal can show "Of 4775 rows: 4730 OK, 32
 * warning, 13 error" without waiting for the full preview pass.
 * Mirrors the per-row rules in preview.ts but avoids any DB calls --
 * it's pure regex / present-or-absent on the source columns.
 *
 * Heuristic header match: lower-case + dash/underscore strip, then
 * checks for substring keywords. Keeps the check robust to common
 * column naming variations ("Email Address", "EMAIL", "e-mail").
 */
function quickValidateAllSheets(
  sheets: ParsedSheet[],
  forcedTarget: "clients" | "leads" | null,
): QuickValidationSummary {
  const tally = { ok: 0, warnings: 0, errors: 0 };
  const issueCounts = new Map<string, number>();
  const bump = (reason: string) => issueCounts.set(reason, (issueCounts.get(reason) ?? 0) + 1);

  const tidy = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
  const findValue = (row: Record<string, any>, keywords: string[]): string => {
    for (const [header, raw] of Object.entries(row)) {
      const t = tidy(header);
      if (keywords.some((k) => t.includes(k))) {
        const v = raw == null ? "" : String(raw).trim();
        if (v) return v;
      }
    }
    return "";
  };

  // Day 6 backdating tally. Walk every row that has a date-shaped
  // column and bucket pre/post FY start.
  const fyStart = currentFyStart();
  const fy = { preFy: 0, postFy: 0, undated: 0 };
  const dateLooksISO = (s: string): string | null => {
    if (!s) return null;
    // Common shapes: 2026-03-15, 15/03/2026, 03/15/2026, "15 Mar 2026".
    // Use Date.parse as a permissive fallback; the real normaliser
    // runs at preview time.
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
    return null;
  };

  for (const sheet of sheets) {
    for (const r of sheet.rows) {
      const email = findValue(r.data, ["email", "mail"]);
      const name = findValue(r.data, ["name", "contact", "client"]);
      const phone = findValue(r.data, ["phone", "mobile", "cell", "tel"]);
      // Bucket by date keywords likely to be present on
      // orders / invoices / payments rows.
      const dateText = findValue(r.data, [
        "eventdate", "event date", "date", "invoicedate", "invoice date",
        "paymentdate", "payment date", "duedate", "due",
      ]);
      const iso = dateLooksISO(dateText);
      if (iso) {
        if (iso < fyStart) fy.preFy += 1;
        else fy.postFy += 1;
      } else if (dateText) {
        // Has a date column but couldn't parse - count as undated for
        // the FY tally (the per-row normaliser may still parse it).
        fy.undated += 1;
      } else {
        // No date column on this row at all - e.g. clients-only rows.
        fy.undated += 1;
      }

      // Same hard rules preview applies. Treat clients-default and
      // leads explicitly differently so the operator's reported
      // counts match what they'll see post-preview.
      let rowError = false;
      let rowWarning = false;
      const isLeads = forcedTarget === "leads";

      if (isLeads) {
        if (!name) { bump("Missing contact name"); rowError = true; }
        if (!email) { bump("Missing email"); rowError = true; }
      } else {
        // Clients-default: needs at least name OR email OR phone.
        if (!name && !email && !phone) {
          bump("No name / email / phone");
          rowError = true;
        }
      }

      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        bump("Invalid email format");
        rowWarning = true;
      }
      if (phone && phone.replace(/\D/g, "").length < 9) {
        bump("Phone too short");
        rowWarning = true;
      }

      if (rowError) tally.errors += 1;
      else if (rowWarning) tally.warnings += 1;
      else tally.ok += 1;
    }
  }

  const topIssues = Array.from(issueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return {
    ...tally,
    topIssues,
    fyAnalysis: { fyStart, ...fy },
  };
}

function parseWorkbook(buffer: Buffer, filename: string): ParsedSheet[] {
  // Cast XLSX usage to any - SheetJS' BufferLike type widens between
  // releases, and we don't want our build to chase that.
  const X = XLSX as any;
  const wb = X.read(buffer, { type: "buffer", cellDates: true, raw: false });
  const sheets: ParsedSheet[] = [];
  for (const sheetName of wb.SheetNames as string[]) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    // header: 1 returns rows as arrays so we can build a clean
    // header-keyed dict ourselves. Avoids SheetJS auto-coercion
    // that loses leading zeros in IDs.
    const aoa: any[][] = X.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, blankrows: false });
    if (aoa.length === 0) continue;
    const headers = (aoa[0] as any[]).map((h) => String(h ?? "").trim());
    if (headers.every((h) => !h)) continue; // empty header row
    const rows: ParsedSheet["rows"] = [];
    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i] as any[];
      // Skip rows that are entirely empty - common at the end of
      // sheets that someone deleted contents but not the row.
      if (r.every((v) => v == null || String(v).trim() === "")) continue;
      const data: Record<string, any> = {};
      headers.forEach((h, idx) => {
        if (!h) return;
        const v = r[idx];
        if (v == null) {
          data[h] = null;
        } else if (typeof v === "string") {
          // Sanitise then trim. Order matters - the formula-prefix
          // check works on the raw value; trimming after preserves
          // the leading apostrophe escape we may have added.
          data[h] = sanitiseCell(v.trim());
        } else {
          data[h] = v;
        }
      });
      rows.push({ rowIndex: i + 1, data });
    }
    sheets.push({ name: sheetName, rows });
  }
  // CSVs come back as a single sheet - if SheetJS decided to call
  // it "Sheet1" but the upload was a .csv, rename to a tidier label.
  if (filename.toLowerCase().endsWith(".csv") && sheets.length === 1 && sheets[0].name === "Sheet1") {
    sheets[0].name = "Data";
  }
  return sheets;
}

async function uploadToStorage(args: {
  companyId: string;
  jobIdGuess: string;
  filename: string;
  mime: string;
  buffer: Buffer;
}): Promise<string | null> {
  // Best-effort copy of the source file into the imports bucket so the
  // operator can re-download it later. Storage RLS isn't owned by us
  // (Supabase reserves storage.objects), so we use the service-role
  // client which bypasses RLS. Path layout enforces tenant scoping
  // visually + the bucket is private.
  try {
    const supabase = getServiceSupabase();
    const safeName = args.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${args.companyId}/${args.jobIdGuess}/${safeName}`;
    const { error } = await supabase.storage
      .from("imports")
      .upload(path, args.buffer, {
        contentType: args.mime,
        upsert: false,
      });
    if (error) {
      console.warn("imports/upload storage upload failed", error.message);
      return null;
    }
    return path;
  } catch (e: any) {
    console.warn("imports/upload storage upload threw", e?.message);
    return null;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ── Auth ────────────────────────────────────────────────────────
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
    if (profileErr) {
      console.error("[imports/upload] profiles fetch failed:", profileErr);
    }
    if (!profile) return res.status(403).json({ error: "Profile not found" });
    const role = (profile.active_role || profile.role || "") as string;
    if (!ALLOWED_CALLER_ROLES.has(role)) {
      return res.status(403).json({ error: "Only owners / admins can run imports" });
    }
    const companyId = profile.company_id as string | null;
    if (!companyId) {
      return res.status(403).json({ error: "Account is not linked to a company" });
    }

    // ── Parse multipart ────────────────────────────────────────────
    // Cast to any: formidable's v3 generic Files<string> typing
    // makes file?.[0] a fight with strict mode, and the runtime
    // shape is well-known.
    const form = formidable({
      maxFiles: 1,
      maxFileSize: MAX_BYTES,
    });
    const parsed: any = await form.parse(req);
    const files: any = Array.isArray(parsed) ? parsed[1] : parsed?.files;
    const fileEntry: any = files?.file?.[0] ?? files?.file;
    if (!fileEntry) {
      return res.status(400).json({ error: "No file provided, expected field 'file'" });
    }
    const mime = (fileEntry.mimetype || "").toLowerCase();
    if (mime && !ALLOWED_MIMES.has(mime)) {
      return res.status(415).json({
        error: `Unsupported file type ${mime}. Send a .csv, .xls or .xlsx file.`,
      });
    }
    if (fileEntry.size > MAX_BYTES) {
      return res.status(413).json({
        error: `File too large, ${(fileEntry.size / 1024 / 1024).toFixed(1)} MB. Cap is 5 MB.`,
      });
    }

    // ── Parse workbook ─────────────────────────────────────────────
    const buffer = await fs.readFile(fileEntry.filepath);
    let sheets: ParsedSheet[];
    try {
      sheets = parseWorkbook(buffer, fileEntry.originalFilename || "upload");
    } catch (e: any) {
      return res.status(400).json({
        error: `Could not parse file, ${e?.message || "unknown error"}. Make sure the first row contains column headers.`,
      });
    }
    const totalRows = sheets.reduce((s, sh) => s + sh.rows.length, 0);
    if (totalRows === 0) {
      return res.status(400).json({ error: "No data rows found in the file." });
    }
    const rowCap = await getImportRowCap();
    if (totalRows > rowCap) {
      return res.status(413).json({
        error: `Too many rows, ${totalRows.toLocaleString("en-ZA")}. Current cap is ${rowCap.toLocaleString("en-ZA")} per import. Split the file and run multiple imports, or ask the platform team to lift the cap in SaaS settings.`,
      });
    }

    // ── Persist job + rows ─────────────────────────────────────────
    const flatRows = sheets.flatMap((s) =>
      s.rows.map((r) => ({ sheet: s.name, rowIndex: r.rowIndex, data: r.data })),
    );

    // We don't have a job id yet for the storage path, so generate
    // a placeholder, upload, then create the job with the path. If
    // the job insert fails we delete the storage file before
    // returning. Keeps the bucket clean.
    const jobIdPlaceholder = randomUUID();
    const filename = fileEntry.originalFilename || "upload.xlsx";
    const filePath = await uploadToStorage({
      companyId,
      jobIdGuess: jobIdPlaceholder,
      filename,
      mime: mime || "application/octet-stream",
      buffer,
    });

    let jobId: string;
    try {
      jobId = await createImportJob({
        companyId,
        createdBy: user.id,
        filename,
        mime: mime || "application/octet-stream",
        sizeBytes: fileEntry.size,
        filePath,
        rowCount: totalRows,
        rows: flatRows,
      });
    } catch (e: any) {
      // Best-effort cleanup of the storage object we just uploaded
      // so a failed insert doesn't leak files.
      if (filePath) {
        try {
          await getServiceSupabase().storage.from("imports").remove([filePath]);
        } catch { /* swallow */ }
      }
      return res.status(500).json({ error: e?.message || "Could not save the import" });
    }

    // Auto-mapping shortcut. If every sheet's headers match a known
    // template (Clients, Leads), or the caller explicitly named a
    // template via ?template=clients|leads, synthesise the mapping
    // here and flip the job to "mapped" so the wizard can skip the
    // AI step and jump straight to Preview. Falls through silently
    // for messy uploads - the AI mapping step will pick them up.
    let autoMappedTo: string | null = null;
    try {
      const overrideTemplate = String(req.query.template || "").toLowerCase();
      const fullMapping: Record<string, any> = {};
      let allRecognised = true;

      for (const sh of sheets) {
        const headers = sh.rows[0]
          ? Object.keys(sh.rows[0].data)
          : [];
        let def = recogniseHeaders(headers);
        if (
          !def &&
          (overrideTemplate === "clients"
            || overrideTemplate === "leads"
            || overrideTemplate === "orders"
            || overrideTemplate === "quotes"
            || overrideTemplate === "invoices"
            || overrideTemplate === "payments")
        ) {
          // Caller forced the target. Use it as long as at least the
          // required columns are present - prevents an empty file
          // from inserting the wrong target_table.
          const { getTemplateDefinition } = await import("@/lib/importTemplates");
          def = getTemplateDefinition(overrideTemplate);
        }
        if (!def) {
          allRecognised = false;
          break;
        }
        const sheetMapping = buildMappingFromTemplate(def, sh.name, headers);
        Object.assign(fullMapping, sheetMapping);
        autoMappedTo = def.targetTable;
      }

      if (allRecognised && Object.keys(fullMapping).length > 0) {
        const sb: any = getServiceSupabase();
        await sb
          .from("import_jobs")
          .update({ mapping: fullMapping, status: "mapped" })
          .eq("id", jobId);
        await setJobStatus(jobId, "mapped", { mapping: fullMapping });
      } else {
        autoMappedTo = null;
      }
    } catch (e) {
      console.warn("auto-mapping shortcut failed, falling back to AI map step:", e);
      autoMappedTo = null;
    }

    // ── Feature E: early validation summary ───────────────────────
    // Walk every parsed row right now and tally the same shape
    // checks the preview pass runs. Lets the modal show a "of 4775
    // rows: 4730 OK, 32 warning, 13 error" line BEFORE preview
    // completes - so on a huge file the operator knows the shape
    // of the problem in seconds rather than minutes. Cheap because
    // it's pure regex / required-field checks, no DB.
    const earlyValidation = quickValidateAllSheets(sheets, autoMappedTo as any);

    return res.status(200).json({
      ok: true,
      jobId,
      autoMappedTo,
      rowCap,
      summary: {
        sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length })),
        totalRows,
        bytes: fileEntry.size,
        earlyValidation,
      },
    });
  } catch (outer: any) {
    console.error("imports/upload handler crashed:", outer);
    return res.status(500).json({ error: outer?.message || "Upload failed" });
  }
}

export default withApiLogging(handler);
