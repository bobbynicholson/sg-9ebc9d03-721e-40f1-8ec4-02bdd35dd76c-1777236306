/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/imports/receipts/upload
 *
 * Accepts up to 20 receipt photos in one upload. Creates ONE
 * import_jobs row (kind='receipts'), and ONE import_rows row per
 * image. Each image is run through Claude vision; the structured
 * extraction lands on import_rows.mapped_data so the operator can
 * review + commit later.
 *
 * Tenant-scoped via session. Caller-role allowlist: super_admin,
 * company_admin, admin, owner.
 *
 * Hard caps:
 *   - 20 images per upload
 *   - 8 MB per image
 *   - JPEG, PNG, WebP only (Anthropic's accepted set)
 */
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import { promises as fs } from "fs";
import { randomUUID } from "node:crypto";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { extractReceiptViaAI } from "@/lib/importAi";
import { getReceiptScanQuota } from "@/lib/receiptScanQuota";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_FILES = 20;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Shopping staff also need to scan supplier slips as part of their
// daily workflow, not just admins onboarding for the first time.
const ALLOWED_CALLER_ROLES = new Set([
  "super_admin", "company_admin", "admin", "owner", "shopping_staff", "shopping",
]);

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
      return res.status(403).json({ error: "Only owners / admins can scan receipts" });
    }
    const companyId = profile?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: "AI receipt scanning is not configured, set ANTHROPIC_API_KEY on the server.",
      });
    }

    const form = formidable({
      maxFiles: MAX_FILES,
      maxFileSize: MAX_BYTES,
      multiples: true,
    });
    const parsed: any = await form.parse(req);
    const filesObj: any = Array.isArray(parsed) ? parsed[1] : parsed?.files;

    // formidable returns files keyed by field name. Accept either a
    // single 'file' or 'files[]' field; flatten the entries.
    const collected: any[] = [];
    for (const key of Object.keys(filesObj || {})) {
      const v = filesObj[key];
      if (!v) continue;
      if (Array.isArray(v)) collected.push(...v);
      else collected.push(v);
    }
    if (collected.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }
    if (collected.length > MAX_FILES) {
      return res.status(413).json({
        error: `Too many images, ${collected.length}. Cap is ${MAX_FILES} per upload.`,
      });
    }

    // Validate every image up-front so the operator gets a clean
    // "this one's a PDF" instead of half a job inserting before
    // we discover the bad apple.
    for (const f of collected) {
      const mime = (f?.mimetype || "").toLowerCase();
      if (!ALLOWED_MIMES.has(mime)) {
        return res.status(415).json({
          error: `Unsupported image type ${mime || "(unknown)"}. JPG, PNG and WebP only.`,
        });
      }
      if (f.size > MAX_BYTES) {
        return res.status(413).json({
          error: `Image too large, ${(f.size / 1024 / 1024).toFixed(1)} MB. Cap is ${MAX_BYTES / 1024 / 1024} MB per image.`,
        });
      }
    }

    const supabase: any = getServiceSupabase();

    // Monthly scan quota check. Per-tenant cap on AI receipt scans
    // (see /admin/platform/tech-costs for unit economics). If this
    // batch would push them over, refuse the whole batch with a
    // structured error so the UI can show "X of 60 used" -- partial
    // processing would surprise the operator.
    const quota = await getReceiptScanQuota(supabase, companyId);
    if (quota.remaining < collected.length) {
      return res.status(429).json({
        error: quota.exceeded
          ? `Monthly AI scan limit reached (${quota.used} of ${quota.limit}). Resets at the start of next calendar month.`
          : `This batch (${collected.length}) would exceed your monthly AI scan limit. ` +
            `Used ${quota.used} of ${quota.limit}; ${quota.remaining} remaining this month.`,
        quota,
      });
    }

    // Load active SARS deductibility rules once per upload so every
    // image in this batch sees the same classifier prompt. The rules
    // are global (no company_id) -- 45-ish rows, fits in one round-trip.
    const { data: rulesData } = await supabase
      .from("sa_tax_deductibility_rules")
      .select("category_code, display_name, group_label, deductibility, match_keywords")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    const taxRules = (rulesData || []) as Array<{
      category_code: string; display_name: string; group_label: string;
      deductibility: "deductible" | "partial" | "non_deductible";
      match_keywords: string[];
    }>;

    // 1. Create the parent job. We mark status='committing' for the
    //    duration of the AI extract and flip to 'previewed' after,
    //    so a stuck job is visible to the operator.
    const { data: job, error: jobErr } = await supabase
      .from("import_jobs")
      .insert({
        company_id: companyId,
        kind: "receipts",
        source_filename: `${collected.length} receipts`,
        source_row_count: collected.length,
        status: "committing",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (jobErr || !job) {
      return res.status(500).json({ error: jobErr?.message || "Could not create job" });
    }
    const jobId = (job as any).id as string;

    // 2. Run each image through the vision model. Sequential is
    //    fine for ≤ 20 images and avoids hammering the rate limit.
    let totalIn = 0, totalOut = 0;
    const results: Array<{ ok: boolean; warnings?: string[]; error?: string; supplier?: string | null; total?: number | null }> = [];

    for (let i = 0; i < collected.length; i++) {
      const f = collected[i];
      try {
        const buf = await fs.readFile(f.filepath);
        const b64 = buf.toString("base64");
        // Best-effort persist the image so the operator can inspect
        // it later. Path: imports/{company_id}/{job_id}/{uuid}.{ext}
        const ext = (f.mimetype || "").split("/")[1] || "jpg";
        const path = `${companyId}/${jobId}/${randomUUID()}.${ext}`;
        try {
          await supabase.storage.from("imports").upload(path, buf, {
            contentType: f.mimetype,
            upsert: false,
          });
        } catch { /* non-fatal */ }

        const { extraction, tokens_in, tokens_out } = await extractReceiptViaAI({
          imageBase64: b64,
          imageMime: f.mimetype,
          taxRules,
        });
        totalIn += tokens_in;
        totalOut += tokens_out;

        await supabase.from("import_rows").insert({
          job_id: jobId,
          sheet: "receipts",
          source_row_index: i + 1,
          source_data: {
            filename: f.originalFilename || `receipt-${i + 1}`,
            mime: f.mimetype,
            bytes: f.size,
            storage_path: path,
          },
          mapped_data: extraction,
          target_table: "supplier_orders",
          status: extraction.warnings?.length ? "pending" : "pending",
          preview_warnings: extraction.warnings ?? [],
        });

        results.push({
          ok: true,
          warnings: extraction.warnings,
          supplier: extraction.supplier_name,
          total: extraction.total,
        });
      } catch (e: any) {
        await supabase.from("import_rows").insert({
          job_id: jobId,
          sheet: "receipts",
          source_row_index: i + 1,
          source_data: {
            filename: f.originalFilename || `receipt-${i + 1}`,
            mime: f.mimetype,
            bytes: f.size,
          },
          status: "error",
          error_message: e?.message || "AI extract failed",
        });
        results.push({ ok: false, error: e?.message });
      }
    }

    await supabase.from("import_jobs").update({
      status: "previewed",
      summary: {
        ai_calls: collected.length,
        ai_tokens_in: totalIn,
        ai_tokens_out: totalOut,
        receipts: {
          total: collected.length,
          ok: results.filter((r) => r.ok).length,
          errored: results.filter((r) => !r.ok).length,
          combined_total: results.reduce((s, r) => s + (Number(r.total) || 0), 0),
        },
      },
    }).eq("id", jobId);

    return res.status(200).json({
      ok: true,
      jobId,
      processed: results.length,
      ai: { calls: collected.length, tokens_in: totalIn, tokens_out: totalOut },
    });
  } catch (e: any) {
    console.error("/api/imports/receipts/upload crashed:", e);
    return res.status(500).json({ error: e?.message || "Receipt upload failed" });
  }
}
