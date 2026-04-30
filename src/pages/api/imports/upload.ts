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
import { createImportJob } from "@/services/importService";

export const config = {
  api: {
    bodyParser: false, // formidable handles multipart
  },
};

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
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

function parseWorkbook(buffer: Buffer, filename: string): ParsedSheet[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  const sheets: ParsedSheet[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    // header: 1 returns rows as arrays so we can build a clean
    // header-keyed dict ourselves. Avoids SheetJS auto-coercion
    // that loses leading zeros in IDs.
    const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: false, blankrows: false });
    if (aoa.length === 0) continue;
    const headers = (aoa[0] as any[]).map((h) => String(h ?? "").trim());
    if (headers.every((h) => !h)) continue; // empty header row
    const rows: ParsedSheet["rows"] = [];
    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i] as any[];
      // Skip rows that are entirely empty -- common at the end of
      // sheets that someone deleted contents but not the row.
      if (r.every((v) => v == null || String(v).trim() === "")) continue;
      const data: Record<string, any> = {};
      headers.forEach((h, idx) => {
        if (!h) return;
        const v = r[idx];
        data[h] = v == null ? null : typeof v === "string" ? v.trim() : v;
      });
      rows.push({ rowIndex: i + 1, data });
    }
    sheets.push({ name: sheetName, rows });
  }
  // CSVs come back as a single sheet -- if SheetJS decided to call
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ── Auth ────────────────────────────────────────────────────────
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
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
      return res.status(400).json({ error: "No file provided -- expected field 'file'" });
    }
    const mime = (fileEntry.mimetype || "").toLowerCase();
    if (mime && !ALLOWED_MIMES.has(mime)) {
      return res.status(415).json({
        error: `Unsupported file type ${mime}. Send a .csv, .xls or .xlsx file.`,
      });
    }
    if (fileEntry.size > MAX_BYTES) {
      return res.status(413).json({
        error: `File too large -- ${(fileEntry.size / 1024 / 1024).toFixed(1)} MB. Cap is 5 MB.`,
      });
    }

    // ── Parse workbook ─────────────────────────────────────────────
    const buffer = await fs.readFile(fileEntry.filepath);
    let sheets: ParsedSheet[];
    try {
      sheets = parseWorkbook(buffer, fileEntry.originalFilename || "upload");
    } catch (e: any) {
      return res.status(400).json({
        error: `Could not parse file -- ${e?.message || "unknown error"}. Make sure the first row contains column headers.`,
      });
    }
    const totalRows = sheets.reduce((s, sh) => s + sh.rows.length, 0);
    if (totalRows === 0) {
      return res.status(400).json({ error: "No data rows found in the file." });
    }
    if (totalRows > MAX_ROWS) {
      return res.status(413).json({
        error: `Too many rows -- ${totalRows.toLocaleString("en-ZA")}. Cap is ${MAX_ROWS.toLocaleString("en-ZA")} per import. Split the file and run multiple imports.`,
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

    return res.status(200).json({
      ok: true,
      jobId,
      summary: {
        sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length })),
        totalRows,
        bytes: fileEntry.size,
      },
    });
  } catch (outer: any) {
    console.error("imports/upload handler crashed:", outer);
    return res.status(500).json({ error: outer?.message || "Upload failed" });
  }
}
