/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Fixed costs service. CRUD over the fixed_costs table added in
 * migration 20260518790000.
 *
 * Drives the cashflow forecast's recurring-costs bucket (PR-E) and
 * /admin/fixed-costs. The daily cron at /api/cron/advance-fixed-
 * cost-next-due (shipped FXC-B, 2026-05-23) walks any past
 * next_due_date forward by cadence. The page also computes the
 * next-future-occurrence client-side as a backstop so the operator
 * never sees a stale date even if the cron misses a run.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseLocalDay, toLocalISO } from "@/lib/localDate";

export type Cadence = "weekly" | "monthly" | "quarterly" | "annual";

// FXC-B: category enum is mirrored from the CHECK constraint in
// migration 20260523180000_fixed_costs_category_audit. Adding a new
// category means updating both spots.
export type FixedCostCategory =
  | "rent"
  | "telecoms"
  | "vehicle"
  | "insurance"
  | "software"
  | "banking"
  | "utilities"
  | "payroll_software"
  | "professional_services"
  | "other";

export const FIXED_COST_CATEGORIES: Array<{ value: FixedCostCategory; label: string }> = [
  { value: "rent", label: "Rent / premises" },
  { value: "telecoms", label: "Telecoms / internet" },
  { value: "vehicle", label: "Vehicle (lease, fuel cards)" },
  { value: "insurance", label: "Insurance" },
  { value: "software", label: "Software subscriptions" },
  { value: "banking", label: "Banking fees" },
  { value: "utilities", label: "Utilities" },
  { value: "payroll_software", label: "Payroll software" },
  { value: "professional_services", label: "Professional services" },
  { value: "other", label: "Other" },
];

export interface FixedCost {
  id: string;
  company_id: string;
  label: string;
  amount_cents: number;
  cadence: Cadence;
  next_due_date: string;
  active: boolean;
  notes: string | null;
  category: FixedCostCategory | null;
  previous_amount_cents: number | null;
  last_amount_change_at: string | null;
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
  category?: FixedCostCategory | null;
  created_by?: string | null;
}

async function list(companyId: string, opts?: { activeOnly?: boolean; throwOnError?: boolean }): Promise<FixedCost[]> {
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
    // Callers that render an error state (the fixed-costs page) opt
    // in; the forecast keeps the old silent-empty contract.
    if (opts?.throwOnError) throw error;
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
  patch: Partial<Pick<FixedCost, "label" | "amount_cents" | "cadence" | "next_due_date" | "active" | "notes" | "category">>,
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
  // Audit fix (2026-07-02): all day maths in LOCAL components, no UTC
  // round-trips. `new Date("YYYY-MM-DD")` parses as UTC midnight and
  // toISOString().slice(0,10) converts back through UTC, so for any
  // browser away from UTC (SA is UTC+2) occurrences on the window
  // boundary shifted a day: fixedCostsNext30 on the financial and
  // cashflow dashboards dropped or double-counted a due date. Same
  // parseLocalDay / toLocalISO pattern as /admin/fixed-costs.
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Local-component addition (not ms maths) so a DST jump inside the
  // window can't land the horizon at 23:00 the previous day.
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + horizonDays);
  for (const r of rows) {
    if (!r.active) continue;
    const cur = parseLocalDay(r.next_due_date);
    if (!cur) continue;
    while (cur <= horizon) {
      if (cur >= today) {
        const day = toLocalISO(cur);
        out.push({
          id: `${r.id}-${day}`,
          label: r.label,
          date: day,
          amount_cents: r.amount_cents,
        });
      }
      // Advance by cadence in-place, in local components.
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
