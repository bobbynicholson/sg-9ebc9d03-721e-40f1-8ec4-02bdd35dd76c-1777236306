/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs/promises";
import { getServiceSupabase } from "@/lib/supabase/service";
import { randomUUID } from "crypto";
import { withApiLogging } from "@/lib/withApiLogging";

export const config = { api: { bodyParser: false } };

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const form = formidable({
    maxFiles: 1,
    maxFileSize: 8 * 1024 * 1024,
    filter: ({ mimetype }) => Boolean(mimetype && ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mimetype)),
  });
  let temporaryFile: string | null = null;
  try {
    const [fields, files] = await form.parse(req);
    const invoiceId = String(fields.invoice_id?.[0] || "").trim();
    const publicToken = String(fields.public_token?.[0] || "").trim();
    const claimedAmount = Number(fields.claimed_amount?.[0] || 0);
    const file = files.proof?.[0];
    temporaryFile = file?.filepath || null;
    if (!/^[0-9a-f-]{36}$/i.test(invoiceId) || !/^[0-9a-f-]{36}$/i.test(publicToken) || !file || !Number.isFinite(claimedAmount) || claimedAmount <= 0 || Math.abs(claimedAmount * 100 - Math.round(claimedAmount * 100)) > 0.000001) {
      return res.status(400).json({ error: "Invoice, amount and a valid proof file are required" });
    }
    const sb = getServiceSupabase();
    const { data: invoice } = await sb.from("invoices").select("id, company_id").eq("id", invoiceId).eq("public_token", publicToken).is("deleted_at", null).maybeSingle();
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const safeName = file.originalFilename?.replace(/[^a-zA-Z0-9._-]/g, "_") || "proof";
    const path = `${invoice.company_id}/${invoice.id}/${randomUUID()}-${safeName}`;
    const upload = await sb.storage.from("payment-proofs").upload(path, await fs.readFile(file.filepath), { contentType: file.mimetype || "application/octet-stream", upsert: false });
    if (upload.error) return res.status(500).json({ error: "Could not save payment proof" });
    const { data: claim, error: claimError } = await (sb as any).rpc("create_eft_payment_claim", {
      p_invoice_id: invoice.id, p_company_id: invoice.company_id, p_amount: claimedAmount,
      p_paid_at: new Date().toISOString(), p_notes: "Payment proof uploaded with this EFT claim.", p_proof_path: path,
    });
    if (claimError || !claim?.payment_id) {
      // An explicit validation rejection is known to have rolled back. On a
      // network timeout the transaction may have committed; keep its proof.
      if (claimError?.code === "22023") await sb.storage.from("payment-proofs").remove([path]);
      return res.status(claimError?.code === "22023" ? 409 : 503).json({ error: "Could not attach proof to EFT claim. Please retry." });
    }
    return res.status(claim.deduped ? 200 : 201).json({ ok: true, ...claim });

  } catch (error: any) {
    console.error("claim-eft-proof failed", error);
    return res.status(400).json({ error: error?.message || "Could not upload proof" });
  } finally {
    if (temporaryFile) await fs.unlink(temporaryFile).catch(() => undefined);
  }
}
export default withApiLogging(handler);
