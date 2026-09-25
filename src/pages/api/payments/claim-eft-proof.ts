/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs/promises";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";

export const config = { api: { bodyParser: false } };

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const form = formidable({
    maxFiles: 1,
    maxFileSize: 8 * 1024 * 1024,
    filter: ({ mimetype }) => Boolean(mimetype && ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mimetype)),
  });
  try {
    const [fields, files] = await form.parse(req);
    const invoiceId = String(fields.invoice_id?.[0] || "");
    const publicToken = String(fields.public_token?.[0] || "");
    const claimedAmount = Number(fields.claimed_amount?.[0] || 0);
    const file = files.proof?.[0];
    if (!invoiceId || !publicToken || !file || !Number.isFinite(claimedAmount) || claimedAmount <= 0) {
      return res.status(400).json({ error: "Invoice, amount and a valid proof file are required" });
    }
    const sb = getServiceSupabase();
    const { data: invoice } = await sb.from("invoices").select("id, company_id").eq("id", invoiceId).eq("public_token", publicToken).is("deleted_at", null).maybeSingle();
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const safeName = file.originalFilename?.replace(/[^a-zA-Z0-9._-]/g, "_") || "proof";
    const path = `${invoice.company_id}/${invoice.id}/${Date.now()}-${safeName}`;
    const upload = await sb.storage.from("payment-proofs").upload(path, await fs.readFile(file.filepath), { contentType: file.mimetype || "application/octet-stream", upsert: false });
    if (upload.error) return res.status(500).json({ error: "Could not save payment proof" });
    const host = req.headers.host;
    const protocol = String(req.headers["x-forwarded-proto"] || (process.env.NODE_ENV === "development" ? "http" : "https")).split(",")[0];
    const claimResponse = await fetch(`${protocol}://${host}/api/payments/claim-eft`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice_id: invoice.id, public_token: publicToken, claimed_amount: claimedAmount, claimed_paid_at: new Date().toISOString(), notes: "Payment proof uploaded with this EFT claim." }),
    });
    const claim = await claimResponse.json().catch(() => ({}));
    if (!claimResponse.ok || !claim?.payment_id) return res.status(claimResponse.status || 400).json(claim);
    const { error } = await sb.from("payments").update({ payment_proof_path: path, payment_proof_uploaded_at: new Date().toISOString() }).eq("id", claim.payment_id);
    if (error) return res.status(500).json({ error: "Claim saved but proof could not be attached" });
    return res.status(201).json({ ok: true, payment_id: claim.payment_id });
  } catch (error: any) {
    console.error("claim-eft-proof failed", error);
    return res.status(400).json({ error: error?.message || "Could not upload proof" });
  }
}
export default withApiLogging(handler);
