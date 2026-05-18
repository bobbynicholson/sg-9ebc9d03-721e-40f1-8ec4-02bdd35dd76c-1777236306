/**
 * Wave 28.2 - store-credit balance reader.
 *
 * No new wallet table - credit lives in the existing payments table
 * with payment_type='credit_issue' (positive) and 'credit_redeem'
 * (positive amount, deducted on read). This keeps every money movement
 * for a client in one auditable timeline and avoids a parallel ledger.
 *
 * Balance = SUM(credit_issue) - SUM(credit_redeem) for the client_id.
 *
 * The Supabase Database types haven't been regenerated since payment_type
 * was widened beyond the ENUM, so we cast to any to keep the call site
 * clean.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ClientCreditBalance {
  /** Total credit issued (positive). */
  issued: number;
  /** Total credit already spent (positive). */
  redeemed: number;
  /** issued - redeemed. Never negative - coerced to 0 if data drift. */
  available: number;
  /** Most recent issue/redeem date, ISO - null if no movements. */
  lastMovementAt: string | null;
}

const EMPTY: ClientCreditBalance = {
  issued: 0,
  redeemed: 0,
  available: 0,
  lastMovementAt: null,
};

/**
 * Read the credit balance for a single client. The companyId scope is
 * required so a client who exists in multiple tenants doesn't leak
 * credit across them.
 */
export async function getClientCreditBalance(
  supabase: SupabaseClient,
  args: { companyId: string; clientId: string },
): Promise<ClientCreditBalance> {
  if (!args.clientId || !args.companyId) return EMPTY;

  const { data, error } = await (supabase as any)
    .from("payments")
    .select("payment_type, amount, created_at")
    .eq("company_id", args.companyId)
    .eq("client_id", args.clientId)
    .in("payment_type", ["credit_issue", "credit_redeem"]);

  if (error) {
    console.warn("[getClientCreditBalance] read failed:", error);
    return EMPTY;
  }

  let issued = 0;
  let redeemed = 0;
  let lastMovementAt: string | null = null;

  for (const row of (data || []) as Array<{
    payment_type: string;
    amount: number | null;
    created_at: string | null;
  }>) {
    const amt = Number(row.amount) || 0;
    if (row.payment_type === "credit_issue") issued += amt;
    else if (row.payment_type === "credit_redeem") redeemed += amt;
    if (row.created_at && (!lastMovementAt || row.created_at > lastMovementAt)) {
      lastMovementAt = row.created_at;
    }
  }

  return {
    issued: Math.round(issued * 100) / 100,
    redeemed: Math.round(redeemed * 100) / 100,
    available: Math.max(0, Math.round((issued - redeemed) * 100) / 100),
    lastMovementAt,
  };
}
