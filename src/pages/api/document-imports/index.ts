import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DOCUMENT_IMPORT_LIMITS } from "@/lib/documentImport";
import { documentImportAccess, documentImportError } from "@/server/documentImport";

const batchSchema = z.object({ target: z.enum(["quotes", "orders"]), files: z.array(z.object({
  name: z.string().min(1).max(250).refine((v) => v.toLowerCase().endsWith(".pdf"), "Choose PDF files."),
  size: z.number().int().positive().max(DOCUMENT_IMPORT_LIMITS.bytes), sha256: z.string().regex(/^[a-f0-9]{64}$/),
})).min(1).max(DOCUMENT_IMPORT_LIMITS.files) });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST"].includes(req.method || "")) return res.status(405).end();
  const access = await documentImportAccess(req, res); if (!access) return;
  const { db, companyId, userId } = access;
  try {
    if (req.method === "GET") {
      const { data, error } = await db.from("import_jobs").select("id, source_filename, created_at, summary").eq("company_id", companyId).contains("summary", { document_import: true }).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return res.json({ jobs: data });
    }
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose 1-50 PDFs, up to 20 MB each." });
    if (parsed.data.files.reduce((n, f) => n + f.size, 0) > 200 * 1024 * 1024) return res.status(413).json({ error: "Choose up to 200 MB per batch." });
    const recent = await db.from("document_import_files").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
    if (recent.error) throw recent.error;
    if ((recent.count || 0) + parsed.data.files.length > 200) return res.status(429).json({ error: "The PDF import limit is 200 documents per company in 24 hours. Resume existing imports or try again tomorrow." });
    const jobId = randomUUID();
    const { error } = await db.from("import_jobs").insert({ id: jobId, company_id: companyId, created_by: userId, status: "uploaded", source_filename: parsed.data.files.length === 1 ? parsed.data.files[0].name : `${parsed.data.files.length} PDF documents`, source_row_count: parsed.data.files.length, summary: { document_import: true, target: parsed.data.target } });
    if (error) throw error;
    const docs = parsed.data.files.map((file) => {
      const id = randomUUID();
      return { id, job_id: jobId, company_id: companyId, target_table: parsed.data.target, filename: file.name, size_bytes: file.size, source_hash: file.sha256, storage_path: `${companyId}/${jobId}/${id}.pdf` };
    });
    const { error: filesError } = await db.from("document_import_files").insert(docs);
    if (filesError) { await db.from("import_jobs").delete().eq("id", jobId).eq("company_id", companyId); throw filesError; }
    const uploads = [];
    for (const doc of docs) {
      const { data, error: signError } = await db.storage.from("booking-imports").createSignedUploadUrl(doc.storage_path);
      if (signError) throw signError;
      uploads.push({ id: doc.id, path: doc.storage_path, token: data.token });
    }
    return res.json({ jobId, uploads });
  } catch (error) { return res.status(500).json({ error: documentImportError(error) }); }
}
