/* eslint-disable @typescript-eslint/no-explicit-any */
/** Client EFT claim. A valid invoice token or client ownership is required.
 * The database serializes claims per invoice; pending claims never credit
 * money. Verification and durable receipts use separate service-only RPCs.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";


async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();

    const { invoice_id, public_token, claimed_amount, claimed_paid_at, notes } = req.body || {};
    if (typeof invoice_id !== "string" || !/^[0-9a-f-]{36}$/i.test(invoice_id)) {
      return res.status(400).json({ error: "Invalid invoice" });
    }
    const token = typeof public_token === "string" ? public_token.trim() : "";
    if (token && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return res.status(400).json({ error: "Invalid payment link" });
    if (!user && !token) return res.status(401).json({ error: "Sign in or provide the invoice payment link" });
    const amount = Number(claimed_amount);
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
      return res.status(400).json({ error: "Claimed amount must be positive" });
    }
    const paidAt = typeof claimed_paid_at === "string" && claimed_paid_at.length > 0
      ? new Date(claimed_paid_at)
      : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      return res.status(400).json({ error: "Invalid payment date" });
    }
    const trimmedNotes = typeof notes === "string" ? notes.trim().slice(0, 500) : null;

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch {
      return res.status(500).json({ error: "Server not configured" });
    }

    // Resolve the invoice and confirm the caller owns it. Ownership is
    // "you have a clients row under this tenant linked to your user_id
    // and that clients row is the one referenced by the invoice." The
    // RLS on invoices already enforces this for direct reads, but we
    // re-check server-side because we're using the service role.
    let invoiceQuery = admin
      .from("invoices")
      .select("id, company_id, client_id, order_id, invoice_number, total_amount, balance_due, status, deleted_at")
      .eq("id", invoice_id);
    if (token) {
      invoiceQuery = invoiceQuery.eq("public_token", token);
    }
    const { data: invoice, error: invErr } = await invoiceQuery.maybeSingle();
    if (invErr || !invoice || invoice.deleted_at) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    if (invoice.status === "paid") {
      return res.status(409).json({ error: "Invoice is already marked paid" });
    }

    if (user && !token) {
      const { data: ownership, error: ownershipErr } = await admin
        .from("clients")
        .select("id")
        .eq("id", invoice.client_id)
        .eq("user_id", user.id)
        .eq("company_id", invoice.company_id)
        .maybeSingle();
      if (ownershipErr) console.error("[payments/claim-eft] clients fetch failed:", ownershipErr);
      if (!ownership) return res.status(403).json({ error: "Not your invoice" });
    }
    const { data: claim, error: claimError } = await admin.rpc("create_eft_payment_claim", {
      p_invoice_id: invoice.id, p_company_id: invoice.company_id, p_amount: amount,
      p_paid_at: paidAt.toISOString(), p_notes: trimmedNotes, p_proof_path: null,
    });
    if (claimError || !claim?.payment_id) return res.status(claimError?.code === "22023" ? 409 : 503)
      .json({ error: "Could not save EFT claim. Please retry." });
    return res.status(claim.deduped ? 200 : 201).json({ ok: true, ...claim });

  } catch (e: any) {
    console.error("claim-eft crashed:", e);
    return res.status(500).json({ error: "Could not save EFT claim. Please retry." });
  }
}

export default withApiLogging(handler);
