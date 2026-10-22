import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { documentImportAccess, documentImportCatalogue, documentImportError } from "@/server/documentImport";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const access = await documentImportAccess(req, res); if (!access) return;
  if (!z.string().uuid().safeParse(req.query.id).success) return res.status(400).json({ error: "Invalid import." });
  const { db, companyId } = access;
  try {
    const { data: job, error } = await db.from("import_jobs").select("id, source_filename, summary, created_at").eq("id", req.query.id).eq("company_id", companyId).single();
    if (error || !job?.summary?.document_import) return res.status(404).json({ error: "Import not found." });
    const [documents, regions, company, catalogue] = await Promise.all([
      db.from("document_import_files").select("*").eq("job_id", job.id).eq("company_id", companyId).order("created_at").order("id"),
      db.from("regions").select("id, name").eq("company_id", companyId).order("name"),
      db.from("companies").select("currency, pricing_includes_vat").eq("id", companyId).single(),
      documentImportCatalogue(db, companyId),
    ]);
    if (documents.error) throw documents.error;
    if (regions.error) throw regions.error;
    if (company.error) throw company.error;
    return res.json({ job, documents: documents.data, regions: regions.data, currency: company.data.currency || "ZAR", pricingIncludesVat: company.data.pricing_includes_vat === true, catalogue });
  } catch (error) { return res.status(500).json({ error: documentImportError(error) }); }
}
