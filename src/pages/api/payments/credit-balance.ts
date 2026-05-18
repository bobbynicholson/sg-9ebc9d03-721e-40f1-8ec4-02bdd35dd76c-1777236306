/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/payments/credit-balance
 *
 * Wave 29.2: tells the PaymentModal how much store credit the client
 * holds for the catering company that issued the invoice. The modal
 * uses this to render the "Apply your R485 store credit" toggle.
 *
 * Same auth gate as /api/payments/create-session: signed-in client OR
 * a magic-link visitor with a matching public_token. Tenant-scoped
 * via the invoice row - credit lives per (company_id, client_id) so
 * a client of two tenants never sees their other tenant's balance.
 *
 * Body:  { invoice_id: string, public_token?: string }
 * Reply: { ok: true, available: number, invoiceBalanceDue: number,
 *          maxApplicable: number }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getClientCreditBalance } from "@/services/cancellation/clientCreditBalance";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();

    const body = (req.body || {}) as any;
    const invoice_id = body.invoice_id as string | undefined;
    const public_token = typeof body.public_token === "string"
      ? body.public_token.trim()
      : "";

    if (typeof invoice_id !== "string" || !/^[0-9a-f-]{36}$/i.test(invoice_id)) {
      return res.status(400).json({ error: "Invalid invoice" });
    }
    if (!user && !public_token) {
      return res.status(401).json({ error: "Sign in or use the pay link" });
    }

    const admin = getServiceSupabase();
    const { data: invoice } = await admin
      .from("invoices")
      .select("id, company_id, client_id, balance_due, deleted_at, public_token")
      .eq("id", invoice_id)
      .maybeSingle();
    if (!invoice || (invoice as any).deleted_at) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Ownership gate - same shape as create-session.
    let allowed = false;
    if (
      public_token &&
      (invoice as any).public_token &&
      public_token === (invoice as any).public_token
    ) {
      allowed = true;
    } else if (user) {
      const { data: row } = await admin
        .from("clients")
        .select("id")
        .eq("id", (invoice as any).client_id)
        .eq("user_id", user.id)
        .eq("company_id", (invoice as any).company_id)
        .maybeSingle();
      if (row) allowed = true;
    }
    if (!allowed) {
      return res.status(403).json({ error: "Not your invoice" });
    }

    const balance = await getClientCreditBalance(admin as any, {
      companyId: (invoice as any).company_id,
      clientId: (invoice as any).client_id,
    });
    const balanceDue = Number((invoice as any).balance_due) || 0;

    return res.status(200).json({
      ok: true,
      available: balance.available,
      invoiceBalanceDue: balanceDue,
      maxApplicable: Math.min(balance.available, balanceDue),
    });
  } catch (e: any) {
    console.error("/api/payments/credit-balance crashed:", e);
    return res.status(500).json({ error: e?.message || "Lookup failed" });
  }
}
