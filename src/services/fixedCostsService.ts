/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Fixed costs service. CRUD over the fixed_costs table added in
 * migration 20260518790000.
 *
 * Drives the cashflow forecast's recurring-costs bucket (PR-E) and
 * /admin/fixed-costs. A daily cron (out of scope for PR-D) advances
 * next_due_date once it crosses; the page surfaces a "Next due:
 * 2026-06-01" badge per row.
 */
import { supabase } from "@/integrations/supabase/client";

export type Cadence = "weekly" | "monthly" | "quarterly" | "annual";

export interface FixedCost {
  id: string;
  company_id: string;
  label: string;
  amount_cents: number;
  cadence: Cadence;
  next_due_date: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
}

export interface CreateFixedCostInput {
  company_id: string;
  label: string;
  amount_cents: number;
  cadence: Cadence;
  next_due_date: string;
  notes?: string | null;
  created_by?: string | null;
}

async function list(companyId: string, opts?: { activeOnly?: boolean }): Promise<FixedCost[]> {
  let q = (supabase as any)
    .from("fixed_costs")
    .select("*")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("next_due_date", { ascending: true });
  if (opts?.activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) {
    console.error("[fixedCostsService.list] failed:", error);
    return [];
  }
  return (data || []) as FixedCost[];
}

async function create(input: CreateFixedCostInput): Promise<FixedCost | null> {
  const { data, error } = await (supabase as any)
    .from("fixed_costs")
    .insert([{ ...input, active: true }])
    .select()
    .single();
  if (error) {
    console.error("[fixedCostsService.create] failed:", error);
    return null;
  }
  return data as FixedCost;
}

async function update(
  id: string,
  patch: Partial<Pick<FixedCost, "label" | "amount_cents" | "cadence" | "next_due_date" | "active" | "notes">>,
): Promise<FixedCost | null> {
  const { data, error } = await (supabase as any)
    .from("fixed_costs")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("[fixedCostsService.update] failed:", error);
    return null;
  }
  return data as FixedCost;
}

async function softDelete(id: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from("fixed_costs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[fixedCostsService.softDelete] failed:", error);
    return false;
  }
  return true;
}

/**
 * For each active fixed_cost, return every occurrence inside
 * [today, today + horizonDays]. Walks next_due_date forward by the
 * cadence so weekly costs hit ~13 times in a 90-day window, monthly
 * ~3 times, quarterly ~1, annual ~0-1. Used by the cashflow forecast
 * series (PR-E).
 */
function expandOccurrences(
  rows: FixedCost[],
  horizonDays: number,
): Array<{ id: string; label: string; date: string; amount_cents: number }> {
  const out: Array<{ id: string; label: string; date: string; amount_cents: number }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  for (const r of rows) {
    if (!r.active) continue;
    const cur = new Date(r.next_due_date);
    if (isNaN(cur.getTime())) continue;
    while (cur <= horizon) {
      if (cur >= today) {
        out.push({
          id: `${r.id}-${cur.toISOString().slice(0, 10)}`,
          label: r.label,
          date: cur.toISOString().slice(0, 10),
          amount_cents: r.amount_cents,
        });
      }
      // Advance by cadence in-place. UTC math is fine for date-only.
      if (r.cadence === "weekly") cur.setDate(cur.getDate() + 7);
      else if (r.cadence === "monthly") cur.setMonth(cur.getMonth() + 1);
      else if (r.cadence === "quarterly") cur.setMonth(cur.getMonth() + 3);
      else if (r.cadence === "annual") cur.setFullYear(cur.getFullYear() + 1);
      else break; // unknown cadence - bail to avoid infinite loop
    }
  }
  return out;
}

export const fixedCostsService = {
  list,
  create,
  update,
  softDelete,
  expandOccurrences,
};
