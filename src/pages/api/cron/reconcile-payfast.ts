/**
 * GET / POST /api/cron/reconcile-payfast
 *
 * Webhook polling fallback for missed PayFast IPNs. PayFast retries
 * IPN aggressively (we dedup on pf_payment_id, see
 * webhooks/payment-confirmation.ts), but a sustained outage on our
 * webhook endpoint can drop notifications entirely. PayFast doesn't
 * re-deliver after a long enough gap, so a paid-but-not-recorded
 * order can sit indefinitely.
 *
 * This worker walks the PayFast Query API for the last N days for
 * every active tenant with PayFast configured, finds successful
 * payments whose pf_payment_id isn't in our payments table, and
 * replays them through the existing record_order_payment /
 * record_invoice_payment RPCs. The RPCs are idempotent on
 * gateway_transaction_id so a duplicate replay is a no-op.
 *
 * Schedule via Vercel cron at 06:00 SAST (04:00 UTC) so it runs
 * once per day after PayFast settlement. Auth via cron_secret OR
 * super_admin session. [P1-40]
 *
 * Note: PayFast's Query API is documented but rarely used. We hit
 * the per-merchant transaction history endpoint with a date range
 * and the merchant's signature. Per-merchant credentials live on
 * payment_gateways rows.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";


const LOOKBACK_DAYS = 7;
const CRON_NAME = "reconcile-payfast";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();

  // Find every tenant with an active PayFast configuration.
  const { data: gateways, error: gwErr } = await sb
    .from("payment_gateways")
    .select("company_id, provider_credentials")
    .eq("provider", "payfast")
    .eq("is_active", true);

  if (gwErr) {
    console.error("[reconcile-payfast] gateway lookup failed:", gwErr);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: gwErr.message });
    return res.status(500).json({ error: gwErr.message });
  }

  const reconciled: Array<{
    company_id: string;
    payments_recovered: number;
    errors: string[];
  }> = [];

  for (const gw of (gateways as any[]) || []) {
    const result = await reconcileTenant(sb, gw.company_id, gw.provider_credentials);
    reconciled.push({ company_id: gw.company_id, ...result });
  }

  const totalRecovered = reconciled.reduce((s, r) => s + r.payments_recovered, 0);
  const totalErrors = reconciled.reduce((s, r) => s + r.errors.length, 0);
  await recordCronHeartbeat(sb, CRON_NAME, totalErrors > 0 ? "error" : "ok", {
    source: auth.source,
    lookback_days: LOOKBACK_DAYS,
    tenants_checked: reconciled.length,
    payments_recovered: totalRecovered,
    errors_count: totalErrors,
  });
  return res.status(200).json({
    ok: true,
    lookback_days: LOOKBACK_DAYS,
    tenants_checked: reconciled.length,
    payments_recovered: totalRecovered,
    detail: reconciled,
  });
}

interface PayFastTransaction {
  pf_payment_id: string;
  m_payment_id: string;
  amount_gross: string | number;
  payment_status: string;
  custom_str1?: string;
  custom_str2?: string;
  custom_str3?: string;
  custom_str4?: string;
}

async function reconcileTenant(
  sb: any,
  companyId: string,
  credentials: any,
): Promise<{ payments_recovered: number; errors: string[] }> {
  const errors: string[] = [];

  if (!credentials?.merchant_id || !credentials?.merchant_key) {
    return { payments_recovered: 0, errors: ["payfast credentials missing"] };
  }

  // Step 1: query PayFast for successful transactions in the lookback
  // window. Skipped here because the PayFast Query API surface
  // changes between sandbox / live and per-merchant-tier; the
  // implementation lives in payfastService for testability.
  let transactions: PayFastTransaction[] = [];
  try {
    const { fetchRecentPayFastTransactions } = await import("@/lib/payfastService");
    transactions = await (fetchRecentPayFastTransactions as any)(
      credentials,
      LOOKBACK_DAYS,
    );
  } catch (e: any) {
    errors.push(`payfast query failed: ${e?.message || e}`);
    return { payments_recovered: 0, errors };
  }

  if (!transactions || transactions.length === 0) {
    return { payments_recovered: 0, errors };
  }

  // Step 2: filter to ones we don't have in payments yet.
  const completed = transactions.filter((t) => t.payment_status === "COMPLETE");
  const pfPaymentIds = completed.map((t) => t.pf_payment_id).filter(Boolean);
  if (pfPaymentIds.length === 0) {
    return { payments_recovered: 0, errors };
  }

  const { data: existing } = await sb
    .from("payments")
    .select("gateway_transaction_id, transaction_id")
    .in("gateway_transaction_id", pfPaymentIds);
  const knownIds = new Set<string>();
  for (const row of (existing as any[]) || []) {
    if (row.gateway_transaction_id) knownIds.add(row.gateway_transaction_id);
    if (row.transaction_id) knownIds.add(row.transaction_id);
  }

  const missing = completed.filter((t) => !knownIds.has(t.pf_payment_id));

  // Step 3: replay each missing one through the appropriate atomic
  // RPC. The RPCs are idempotent on gateway_transaction_id so even
  // if the IPN arrives later it'll no-op.
  let recovered = 0;
  for (const t of missing) {
    try {
      const isInvoice = t.custom_str4 === "invoice" || t.custom_str2 === "invoice";
      if (isInvoice && t.custom_str1) {
        const { error: rpcErr } = await sb.rpc("record_invoice_payment", {
          p_invoice_id: t.custom_str1,
          p_amount: parseFloat(String(t.amount_gross)),
          p_payment_method: "payfast",
          p_transaction_id: t.pf_payment_id,
          p_company_id: companyId,
          p_currency: "ZAR",
          p_gateway_provider: "payfast",
        });
        if (rpcErr) {
          errors.push(`invoice replay ${t.pf_payment_id}: ${rpcErr.message}`);
          continue;
        }
      } else if (t.custom_str1) {
        const { error: rpcErr } = await sb.rpc("record_order_payment", {
          p_order_id: t.custom_str1,
          p_amount: parseFloat(String(t.amount_gross)),
          p_payment_method: "payfast",
          p_transaction_id: t.pf_payment_id,
          p_company_id: companyId,
          p_currency: "ZAR",
          p_payment_type: t.custom_str2 || null,
          p_gateway_provider: "payfast",
        });
        if (rpcErr) {
          errors.push(`order replay ${t.pf_payment_id}: ${rpcErr.message}`);
          continue;
        }
      } else {
        errors.push(`replay ${t.pf_payment_id}: no order/invoice id in custom_str1`);
        continue;
      }
      recovered += 1;

      // Audit-log every recovered payment so the operator has a
      // queryable trail of what the cron caught.
      await sb.from("audit_logs").insert({
        company_id: companyId,
        action: "payfast_ipn_recovered",
        entity_type: t.custom_str4 === "invoice" || t.custom_str2 === "invoice" ? "invoice" : "order",
        entity_id: t.custom_str1,
        details: {
          pf_payment_id: t.pf_payment_id,
          amount: t.amount_gross,
          payment_type: t.custom_str2 || null,
        },
      });
    } catch (e: any) {
      errors.push(`replay crashed ${t.pf_payment_id}: ${e?.message || e}`);
    }
  }

  return { payments_recovered: recovered, errors };
}

export default withApiLogging(handler);
