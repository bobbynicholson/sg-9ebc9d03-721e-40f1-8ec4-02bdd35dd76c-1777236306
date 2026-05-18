/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Supplier payables service. CRUD over the supplier_payables table
 * added in migration 20260518780000. Drives the /admin/payables
 * page + the cashflow forecast's payables bucket (PR-E).
 *
 * Owner / company_admin / admin role only - the page is gated
 * upstream via ProtectedRoute. supabase RLS still enforces tenant
 * isolation regardless.
 *
 * Status lifecycle:
 *   pending  - invoice received, not yet paid (default)
 *   paid     - settled. paid_at + paid_by stamped
 *   disputed - in active dispute with the supplier
 *   written_off - waiver / lost
 */
import { supabase } from "@/integrations/supabase/client";

export type PayableStatus = "pending" | "paid" | "disputed" | "written_off";

export interface SupplierPayable {
  id: string;
  company_id: string;
  supplier_id: string | null;
  amount_cents: number;
  due_date: string;
  invoice_ref: string | null;
  notes: string | null;
  status: PayableStatus;
  paid_at: string | null;
  paid_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  /** Optional join shape - populated when select() pulls supplier name. */
  supplier?: { supplier_name: string | null } | null;
}

export interface CreatePayableInput {
  company_id: string;
  supplier_id?: string | null;
  amount_cents: number;
  due_date: string;
  invoice_ref?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

async function list(
  companyId: string,
  opts?: { status?: PayableStatus | "all"; horizonDays?: number },
): Promise<SupplierPayable[]> {
  let query = (supabase as any)
    .from("supplier_payables")
    .select("*, supplier:supplier_id(supplier_name)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("due_date", { ascending: true });
  if (opts?.status && opts.status !== "all") query = query.eq("status", opts.status);
  if (opts?.horizonDays && opts.horizonDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + opts.horizonDays);
    query = query.lte("due_date", cutoff.toISOString().slice(0, 10));
  }
  const { data, error } = await query;
  if (error) {
    console.error("[supplierPayablesService.list] failed:", error);
    return [];
  }
  return (data || []) as SupplierPayable[];
}

async function create(input: CreatePayableInput): Promise<SupplierPayable | null> {
  const { data, error } = await (supabase as any)
    .from("supplier_payables")
    .insert([{ ...input, status: "pending" }])
    .select("*, supplier:supplier_id(supplier_name)")
    .single();
  if (error) {
    console.error("[supplierPayablesService.create] failed:", error);
    return null;
  }
  return data as SupplierPayable;
}

async function update(
  id: string,
  patch: Partial<Pick<SupplierPayable, "amount_cents" | "due_date" | "invoice_ref" | "notes" | "supplier_id">>,
): Promise<SupplierPayable | null> {
  const { data, error } = await (supabase as any)
    .from("supplier_payables")
    .update(patch)
    .eq("id", id)
    .select("*, supplier:supplier_id(supplier_name)")
    .single();
  if (error) {
    console.error("[supplierPayablesService.update] failed:", error);
    return null;
  }
  return data as SupplierPayable;
}

async function markPaid(id: string, userId: string | null): Promise<SupplierPayable | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await (supabase as any)
    .from("supplier_payables")
    .update({ status: "paid", paid_at: nowIso, paid_by: userId })
    .eq("id", id)
    .select("*, supplier:supplier_id(supplier_name)")
    .single();
  if (error) {
    console.error("[supplierPayablesService.markPaid] failed:", error);
    return null;
  }
  // Audit trail - mirrors the cash_on_hand edit pattern from PR #75.
  try {
    await (supabase as any).from("audit_logs").insert({
      action: "financial.supplier_payable.paid",
      entity_type: "supplier_payable",
      entity_id: id,
      company_id: (data as any)?.company_id,
      user_id: userId,
      details: {
        amount_cents: (data as any)?.amount_cents,
        supplier_id: (data as any)?.supplier_id,
        invoice_ref: (data as any)?.invoice_ref,
      },
    });
  } catch (e) {
    console.warn("[supplierPayablesService.markPaid] audit log insert failed:", e);
  }
  return data as SupplierPayable;
}

async function softDelete(id: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from("supplier_payables")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[supplierPayablesService.softDelete] failed:", error);
    return false;
  }
  return true;
}

export const supplierPayablesService = {
  list,
  create,
  update,
  markPaid,
  softDelete,
};
