import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "node:crypto";
import { z } from "zod";
import { extractionSchema, reviewSchema, reviewDraftSchema, validateDocumentReview, DOCUMENT_IMPORT_LIMITS } from "@/lib/documentImport";
import { documentImportAccess, documentImportCatalogue, documentImportError } from "@/server/documentImport";
import { setAiUsageContext } from "@/lib/ai/usageLog";

export const maxDuration = 300;
export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["POST", "GET"].includes(req.method || "")) return res.status(405).end();
  const access = await documentImportAccess(req, res); if (!access) return;
  const { db, companyId, userId } = access;
  if (![req.query.id, req.query.documentId].every((id) => z.string().uuid().safeParse(id).success)) return res.status(400).json({ error: "Invalid document." });
  const { data: doc, error } = await db.from("document_import_files").select("*").eq("id", req.query.documentId).eq("job_id", req.query.id).eq("company_id", companyId).single();
  if (error || !doc) return res.status(404).json({ error: "Document not found." });
  try {
    if (req.method === "GET") {
      const signed = await db.storage.from("booking-imports").createSignedUrl(doc.storage_path, 300);
      if (signed.error) throw signed.error;
      if (req.query.open === "1") return res.redirect(302, signed.data.signedUrl);
      return res.json({ url: signed.data.signedUrl });
    }
    const action = req.body?.action;
    if (action === "upload") {
      if (!["uploaded", "error"].includes(doc.status)) return res.status(409).json({ error: "This document has already been read. Start a new import for a different PDF." });
      const upload = await db.storage.from("booking-imports").createSignedUploadUrl(doc.storage_path, { upsert: true });
      if (upload.error) throw upload.error;
      return res.json({ path: doc.storage_path, token: upload.data.token });
    }
    if (action === "extract") {
      if (doc.status === "committed") return res.json({ document: doc });
      if (doc.extraction && req.body.retry !== true) return res.json({ document: doc });
      if (doc.status === "extracting" && Date.now() - new Date(doc.updated_at).getTime() < 6 * 60_000) return res.status(409).json({ error: "This PDF is being read. Wait a moment and refresh." });
      const { data: claimed, error: claimError } = await db.from("document_import_files").update({ status: "extracting", error_message: null, version: doc.version + 1, updated_at: new Date().toISOString() }).eq("id", doc.id).eq("company_id", companyId).eq("version", doc.version).select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return res.status(409).json({ error: "This document changed. Refresh before continuing." });
      try {
        const downloaded = await db.storage.from("booking-imports").download(doc.storage_path);
        if (downloaded.error || !downloaded.data) throw new Error("The PDF has not finished uploading. Select the same file again to retry its upload.");
        if (downloaded.data.size > DOCUMENT_IMPORT_LIMITS.bytes) throw new Error("This PDF exceeds 20 MB.");
        const buffer = Buffer.from(await downloaded.data.arrayBuffer());
        if (createHash("sha256").update(buffer).digest("hex") !== doc.source_hash) throw new Error("The uploaded PDF differs from the selected file. Start a new import with the original PDF.");
        const duplicate = await db.from("document_import_files").select("id, target_id, target_table").eq("company_id", companyId).eq("source_hash", doc.source_hash).eq("status", "committed").limit(1).maybeSingle();
        if (duplicate.error) throw duplicate.error;
        if (duplicate.data) {
          await db.from("document_import_files").update({ status: "duplicate", target_table: duplicate.data.target_table, duplicate_of: duplicate.data.id, target_id: duplicate.data.target_id, updated_at: new Date().toISOString() }).eq("id", doc.id).eq("company_id", companyId);
          return res.json({ duplicate: true });
        }
        setAiUsageContext({ companyId, userId });
        const { extractBookingDocument } = await import("@/server/extractBookingDocument");
        const result = await extractBookingDocument(buffer, doc.target_table);
        const saved = await db.from("document_import_files").update({ status: "review", extraction: result.extraction, page_count: result.pages, model: result.model, used_vision: result.usedVision, error_message: null, updated_at: new Date().toISOString() }).eq("id", doc.id).eq("company_id", companyId).eq("version", doc.version + 1).select("*").single();
        if (saved.error) throw saved.error;
        return res.json({ document: saved.data });
      } catch (error) {
        await db.from("document_import_files").update({ status: "error", error_message: documentImportError(error), updated_at: new Date().toISOString() }).eq("id", doc.id).eq("company_id", companyId).eq("version", doc.version + 1);
        throw error;
      }
    }
    if (action !== "save" && action !== "commit") return res.status(400).json({ error: "Unknown action." });
    if (doc.status === "committed") return res.json({ targetId: doc.target_id, alreadySaved: true });
    if (doc.status !== "review" || !extractionSchema.safeParse(doc.extraction).success) return res.status(409).json({ error: "Read this PDF before reviewing it." });
    if (Number(req.body.version) !== doc.version) return res.status(409).json({ error: "Someone updated this document. Refresh before saving." });
    const parsed = (action === "save" ? reviewDraftSchema : reviewSchema).safeParse(req.body.review);
    if (!parsed.success) return res.status(400).json({ error: "Complete the review and confirm that you checked this document." });
    if (action === "save") {
      const saved = await db.from("document_import_files").update({ reviewed_data: parsed.data, version: doc.version + 1, updated_at: new Date().toISOString() }).eq("id", doc.id).eq("company_id", companyId).eq("version", doc.version).select("*").maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data) return res.status(409).json({ error: "This document changed. Refresh before saving." });
      return res.json({ document: saved.data });
    }
    const [company, region, catalogue] = await Promise.all([
      db.from("companies").select("currency, pricing_includes_vat").eq("id", companyId).single(),
      db.from("regions").select("id").eq("company_id", companyId).eq("id", parsed.data.region_id).maybeSingle(),
      documentImportCatalogue(db, companyId),
    ]);
    if (company.error) throw company.error;
    if (region.error) throw region.error;
    if (!region.data) return res.status(400).json({ error: "Choose a branch belonging to your company." });
    const review = parsed.data;
    const validation = validateDocumentReview(review, doc.target_table, company.data.currency || "ZAR", catalogue, company.data.pricing_includes_vat === true);
    if (validation.errors.length) return res.status(400).json({ error: "Check the highlighted details before saving.", errors: validation.errors });
    // Unknown facts have a human-selected destination; do not discard them.
    for (const fact of review.unmatched) {
      const destination = doc.target_table === "quotes" ? "notes" : fact.destination;
      review.fields[destination] = [review.fields[destination], `${fact.label}: ${fact.value}`].filter(Boolean).join("\n");
    }
    const committed = await db.rpc("commit_booking_document_import", { p_document_id: doc.id, p_company_id: companyId, p_actor_id: userId, p_version: doc.version, p_review: review, p_readiness: validation.followUps });
    if (committed.error) throw committed.error;
    return res.json({ ...committed.data, followUps: validation.followUps });
  } catch (error) {
    const message = documentImportError(error);
    return res.status((error as any)?.code === "23505" || (error as any)?.code === "40001" ? 409 : 500).json({ error: message });
  }
}
