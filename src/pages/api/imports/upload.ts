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
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { promises as fs } from "fs";
import { randomUUID } from "node:crypto";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { createImportJob, setJobStatus } from "@/services/importService";
import { recogniseHeaders, buildMappingFromTemplate } from "@/lib/importTemplates";
import { withApiLogging } from "@/lib/withApiLogging";
import { parseWorkbook, type ParsedSheet } from "@/lib/importParse";


export const config = {
  api: {
    bodyParser: false, // formidable handles multipart
  },
};

// Parsing a large export and saving every row (about 9k for a full
// accounting customer list) outruns the short default function timeout,
// which surfaced as an HTML error page instead of a usable message.
export const maxDuration = 300;

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

const ALLOWED_MIMES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);


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
      return res.status(500).json({ error: dbErrorMessage(e) || "Could not save the import" });
    }

    // Auto-mapping shortcut. If every sheet's headers match a known
    // template (Clients, Leads), synthesise the mapping here and flip the
    // job to "mapped" so the wizard can skip the AI step and jump
    // straight to Preview. Anything else - including a ?template= caller
    // whose file has unfamiliar columns - goes through the AI map step,
    // so no column is silently dropped. ?automap=0 always defers to the
    // AI step (the import modal reviews every mapping with the operator).
    // ?template= still pins the early-validation target.
    const overrideTemplate = String(req.query.template || "").toLowerCase();
    let autoMappedTo: string | null = null;
    if (req.query.automap !== "0") {
      try {
        const fullMapping: Record<string, any> = {};
        let allRecognised = true;

        for (const sh of sheets) {
          const headers = sh.rows[0]
            ? Object.keys(sh.rows[0].data)
            : [];
          const def = recogniseHeaders(headers);
          if (!def || (overrideTemplate && def.type !== overrideTemplate)) {
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
    }

    // ── Feature E: early validation summary ───────────────────────
    // Walk every parsed row right now and tally the same shape
    // checks the preview pass runs. Lets the modal show a "of 4775
    // rows: 4730 OK, 32 warning, 13 error" line BEFORE preview
    // completes - so on a huge file the operator knows the shape
    // of the problem in seconds rather than minutes. Cheap because
    // it's pure regex / required-field checks, no DB.
    const validationTarget = autoMappedTo
      || (overrideTemplate === "clients" || overrideTemplate === "leads" ? overrideTemplate : null);
    const earlyValidation = quickValidateAllSheets(sheets, validationTarget as any);

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
    return res.status(500).json({ error: dbErrorMessage(outer) || "Upload failed" });
  }
}

export default withApiLogging(handler);
