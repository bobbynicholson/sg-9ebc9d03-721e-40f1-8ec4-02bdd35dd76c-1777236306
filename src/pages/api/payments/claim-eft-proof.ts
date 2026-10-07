/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs/promises";
import { getServiceSupabase } from "@/lib/supabase/service";
import { randomUUID } from "crypto";
import { withApiLogging } from "@/lib/withApiLogging";
import { getInvoicePublicAvailability } from "@/lib/invoicePublicPayment";
import { analyzeEftProof } from "@/lib/eftProofVision";
import { resolveCompanyEftDetails } from "@/lib/companyEftDetails";
import { setAiUsageContext } from "@/lib/ai/usageLog";

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
    const paidDate = String(fields.claimed_paid_at?.[0] || "").trim();
    const clientNote = String(fields.notes?.[0] || "").trim().slice(0, 500);
    const file = files.proof?.[0];
    temporaryFile = file?.filepath || null;
    if (!/^[0-9a-f-]{36}$/i.test(invoiceId) || !/^[0-9a-f-]{36}$/i.test(publicToken) || !file || !Number.isFinite(claimedAmount) || claimedAmount <= 0 || Math.abs(claimedAmount * 100 - Math.round(claimedAmount * 100)) > 0.000001) {
      return res.status(400).json({ error: "Invoice, amount and a valid proof file are required" });
    }
    let paidAt = new Date();
    if (paidDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) return res.status(400).json({ error: "Invalid transfer date" });
      paidAt = new Date(`${paidDate}T12:00:00.000Z`);
      if (!Number.isFinite(paidAt.getTime()) || paidAt.toISOString().slice(0, 10) !== paidDate || paidAt.getTime() > Date.now() + 5 * 60 * 1000) {
        return res.status(400).json({ error: "Transfer date cannot be in the future" });
      }
    }
    const sb = getServiceSupabase();
    const { data: invoice } = await sb.from("invoices")
      .select("id, company_id, order_id, currency, invoice_number, balance_due, invoice_data")
      .eq("id", invoiceId).eq("public_token", publicToken).is("deleted_at", null).maybeSingle();
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (claimedAmount - Number(invoice.balance_due || 0) > 0.01) {
      return res.status(400).json({ error: "Claimed amount cannot exceed the invoice balance" });
    }
    const publicPayment = await getInvoicePublicAvailability(sb, invoice);
    if (publicPayment.availability.online_available) {
      return res.status(409).json({ error: "EFT confirmation is unavailable while online payment is enabled" });
    }
    setAiUsageContext({ companyId: invoice.company_id });
    const { data: company } = await sb.from("companies")
      .select("company_name, bank_name, bank_account_holder, bank_account_number, bank_branch_code, bank_account_type, eft_instructions")
      .eq("id", invoice.company_id)
      .maybeSingle();
    const bankDetails = resolveCompanyEftDetails(company || {}, invoice.invoice_data?.bankDetails || {});
    if (!bankDetails.available) {
      return res.status(409).json({ error: "EFT payment is not configured for this invoice" });
    }
    const proofBytes = await fs.readFile(file.filepath);
    const safeName = file.originalFilename?.replace(/[^a-zA-Z0-9._-]/g, "_") || "proof";
    const path = `${invoice.company_id}/${invoice.id}/${randomUUID()}-${safeName}`;
    const upload = await sb.storage.from("payment-proofs").upload(path, proofBytes, { contentType: file.mimetype || "application/octet-stream", upsert: false });
    if (upload.error) return res.status(500).json({ error: "Could not save payment proof" });
    const { data: claim, error: claimError } = await (sb as any).rpc("create_eft_payment_claim", {
      p_invoice_id: invoice.id, p_company_id: invoice.company_id, p_amount: claimedAmount,
      p_paid_at: paidAt.toISOString(),
      p_notes: clientNote || "Payment proof uploaded with this EFT claim.",
      p_proof_path: path,
    });
    if (claimError || !claim?.payment_id) {
      // An explicit validation rejection is known to have rolled back. On a
      // network timeout the transaction may have committed; keep its proof.
      if (claimError?.code === "22023") await sb.storage.from("payment-proofs").remove([path]);
      return res.status(claimError?.code === "22023" ? 409 : 503).json({ error: "Could not attach proof to EFT claim. Please retry." });
    }
    const assessment = await analyzeEftProof({
      imageBase64: proofBytes.toString("base64"),
      imageMime: file.mimetype || "application/octet-stream",
      invoiceNumber: invoice.invoice_number,
      amount: claimedAmount,
      currency: publicPayment.currency,
      recipient: bankDetails.holder || company?.company_name || undefined,
    });
    const { error: assessmentError } = await sb.from("payments")
      .update({ payment_proof_ai_assessment: assessment, payment_proof_ai_analyzed_at: assessment.status === "not_analyzed" ? null : new Date().toISOString() })
      .eq("id", claim.payment_id)
      .eq("company_id", invoice.company_id);
    if (assessmentError) console.error("[claim-eft-proof] could not store proof screening:", assessmentError);
    return res.status(claim.deduped ? 200 : 201).json({ ok: true, ...claim });

  } catch (error: any) {
    console.error("claim-eft-proof failed", error);
    return res.status(400).json({ error: error?.message || "Could not upload proof" });
  } finally {
    if (temporaryFile) await fs.unlink(temporaryFile).catch(() => undefined);
  }
}
export default withApiLogging(handler);
