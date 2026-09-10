/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase as browserSupabase } from "@/integrations/supabase/client";

/**
 * Single chokepoint for writes to `invoices.status`.
 *
 * Mirrors the Phase 2 `setOrderPaymentStatus` pattern (see
 * docs/money-flow.md) for the invoice state machine. Phase 4 audit
 * flagged that there was no central writer for `invoices.status` -
 * four separate code paths wrote it (invoice generation, payment
 * trigger, admin send button, overdue cron) and there was no
 * transition allowlist to catch drift.
 *
 * This module is the path going forward. Existing call sites can be
 * migrated incrementally; new code MUST go through `setInvoiceStatus`.
 *
 * Postgres `invoice_status` enum members:
 *   draft, sent, paid, partially_paid, overdue, written_off, voided
 *
 * Allowed transitions reflect the lifecycle:
 *   draft           -> sent | voided
 *   sent            -> partially_paid | paid | overdue | voided | written_off
 *   partially_paid  -> paid | partially_paid | sent | overdue | voided | written_off
 *   paid            -> partially_paid | voided | written_off
 *   overdue         -> partially_paid | paid | voided | written_off
 *   written_off     -> (terminal)
 *   voided          -> (terminal)
 *
 * `partially_paid -> sent` is allowed because the payment trigger can
 * reverse a flip when payments get refunded/deleted. `paid ->
 * partially_paid` likewise.
 */

export const CANONICAL_INVOICE_STATUSES = new Set<string>([
  "draft",
  "sent",
  "paid",
  "partially_paid",
  "overdue",
  "written_off",
  "voided",
]);

const ALLOWED_INVOICE_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft:          ["sent", "voided"],
  sent:           ["partially_paid", "paid", "overdue", "voided", "written_off"],
  partially_paid: ["paid", "partially_paid", "sent", "overdue", "voided", "written_off"],
  paid:           ["partially_paid", "voided", "written_off"],
  overdue:        ["partially_paid", "paid", "voided", "written_off"],
  written_off:    [],
  voided:         [],
};

export interface SetInvoiceStatusOpts {
  /** Free-text reason logged to audit_logs (when company_id resolves). */
  reason?: string;
  /** Override supabase client. Default: browser anon. */
  client?: any;
  /** User id for audit attribution. */
  actorUserId?: string | null;
}

export interface SetInvoiceStatusResult {
  success: boolean;
  /** True when the write was skipped because the row was already at newStatus. */
  idempotent?: boolean;
  /** When success=false, a human-readable reason. */
  error?: string;
}

export async function setInvoiceStatus(
  invoiceId: string,
  newStatus: string,
  opts: SetInvoiceStatusOpts = {},
): Promise<SetInvoiceStatusResult> {
  if (!invoiceId) return { success: false, error: "invoiceId required" };
  if (!CANONICAL_INVOICE_STATUSES.has(newStatus)) {
    return {
      success: false,
      error: `Invalid invoices.status value '${newStatus}'. Allowed: ${[...CANONICAL_INVOICE_STATUSES].join(", ")}.`,
    };
  }

  const client: any = opts.client || browserSupabase;

  const { data: current, error: readErr } = await client
    .from("invoices")
    .select("id, company_id, status, invoice_number")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readErr) {
    return { success: false, error: `Lookup failed: ${readErr.message}` };
  }
  if (!current) {
    return { success: false, error: "invoice_not_found" };
  }

  const currentStatus = String((current as any).status || "draft");

  if (currentStatus === newStatus) {
    return { success: true, idempotent: true };
  }

  const allowed = ALLOWED_INVOICE_STATUS_TRANSITIONS[currentStatus];
  if (allowed && !allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Invalid invoice status transition ${currentStatus} -> ${newStatus}. Allowed next steps: ${allowed.length ? allowed.join(", ") : "(terminal state)"}.`,
    };
  }

  const { error: updErr } = await client
    .from("invoices")
    .update({ status: newStatus as any, updated_at: new Date().toISOString() })
    .eq("id", invoiceId);

  if (updErr) {
    return { success: false, error: updErr.message };
  }

  // Best-effort audit row. Same shape as setOrderPaymentStatus.
  try {
    await client.from("audit_logs").insert({
      company_id: (current as any).company_id || null,
      user_id: opts.actorUserId ?? null,
      action: `invoice_status_${newStatus}`,
      entity_type: "invoice",
      entity_id: invoiceId,
      details: {
        invoice_number: (current as any).invoice_number || null,
        from_status: currentStatus,
        to_status: newStatus,
        reason: opts.reason || null,
      },
    });
  } catch (auditErr) {
    console.warn("[setInvoiceStatus] audit insert failed (non-blocking):", auditErr);
  }

  return { success: true };
}
