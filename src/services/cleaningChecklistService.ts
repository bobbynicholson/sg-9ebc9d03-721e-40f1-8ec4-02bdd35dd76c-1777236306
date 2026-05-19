/**
 * CLN2-F - cleaning_event_checklists service.
 *
 * The formal pre-event cleanliness signal. cleaning_jobs (Wave 41,
 * PR #41) answers "is the equipment back". This service answers
 * "is the prep area ready for the chef to start". Together they
 * close the cleaning to kitchen-readiness loop the KIT2-O chip
 * was a v1 stand-in for.
 *
 * The items column is a jsonb array of {label, required, checked,
 * checked_at, checked_by}. Tenant template lives on
 * companies.cleaning_checklist_template - falls back to a 5-item
 * default when null.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from "@/integrations/supabase/client";
import { emitCleaningReady } from "@/lib/events/cleaningEvents";

export type ChecklistKind = "pre_event" | "delivery_ready";
export type ChecklistStatus = "pending" | "in_progress" | "ready";

export interface ChecklistItem {
  label: string;
  required: boolean;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
}

export interface ChecklistRow {
  id: string;
  company_id: string;
  order_id: string;
  kind: ChecklistKind;
  items: ChecklistItem[];
  status: ChecklistStatus;
  ready_at: string | null;
  created_at: string;
  updated_at: string;
}

// Default template when companies.cleaning_checklist_template is
// null. The five items Bobby specified in the CLN2-F brief. All
// required - a checklist with optional items by default would let
// the chef hit "ready" with bins still inside.
export const DEFAULT_PRE_EVENT_ITEMS: Array<{ label: string; required: boolean }> = [
  { label: "Surfaces wiped", required: true },
  { label: "Equipment washed", required: true },
  { label: "Bins out", required: true },
  { label: "Floor mopped", required: true },
  { label: "Fridge spot-checked", required: true },
];

function templateForCompany(
  template: Array<{ label: string; required?: boolean }> | null,
): ChecklistItem[] {
  const source = template && Array.isArray(template) && template.length > 0
    ? template
    : DEFAULT_PRE_EVENT_ITEMS;
  return source.map((t) => ({
    label: t.label,
    required: t.required !== false,
    checked: false,
    checked_at: null,
    checked_by: null,
  }));
}

/**
 * Look up the active checklists for a set of order ids, scoped to
 * a single kind. The kitchen chip and the dashboard listing both
 * call this - the chip wants a status count, the dashboard wants
 * the full items array.
 */
export async function listChecklistsForOrders(
  companyId: string,
  orderIds: string[],
  kind: ChecklistKind = "pre_event",
): Promise<ChecklistRow[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from("cleaning_event_checklists")
    .select("id, company_id, order_id, kind, items, status, ready_at, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("kind", kind)
    .is("deleted_at", null)
    .in("order_id", orderIds);
  if (error) {
    console.warn("[cleaningChecklistService] list failed:", error);
    return [];
  }
  return ((data || []) as any[]).map((r) => ({
    ...r,
    items: Array.isArray(r.items) ? r.items : [],
  })) as ChecklistRow[];
}

/**
 * Ensure a checklist exists for (order, kind). Returns the row
 * either way. Lazy-creation pattern: the dashboard doesn't need
 * a migration backfill - the first time a tenant opens an event,
 * the row is seeded from the tenant template (or default).
 */
export async function ensureChecklistForOrder(
  companyId: string,
  orderId: string,
  kind: ChecklistKind = "pre_event",
): Promise<ChecklistRow | null> {
  const existing = await listChecklistsForOrders(companyId, [orderId], kind);
  if (existing[0]) return existing[0];

  // Pull the tenant template once and seed.
  const { data: company } = await (supabase as any)
    .from("companies")
    .select("cleaning_checklist_template")
    .eq("id", companyId)
    .single();
  const items = templateForCompany(company?.cleaning_checklist_template ?? null);

  const { data, error } = await (supabase as any)
    .from("cleaning_event_checklists")
    .insert({
      company_id: companyId,
      order_id: orderId,
      kind,
      items,
      status: "pending",
    })
    .select("id, company_id, order_id, kind, items, status, ready_at, created_at, updated_at")
    .single();
  if (error) {
    console.warn("[cleaningChecklistService] insert failed:", error);
    return null;
  }
  return data as ChecklistRow;
}

function deriveStatus(items: ChecklistItem[]): { status: ChecklistStatus; readyAt: string | null } {
  const required = items.filter((i) => i.required);
  const requiredChecked = required.filter((i) => i.checked);
  if (required.length > 0 && requiredChecked.length === required.length) {
    return { status: "ready", readyAt: new Date().toISOString() };
  }
  const anyChecked = items.some((i) => i.checked);
  return { status: anyChecked ? "in_progress" : "pending", readyAt: null };
}

/**
 * Toggle a single item by index. Recomputes status + ready_at and
 * writes the whole items array back. Returns the new row.
 *
 * Status flips to ready and ready_at stamps the moment the last
 * required item ticks; the caller emits the window event so the
 * kitchen chip flips green without a refresh.
 */
export async function toggleChecklistItem(
  checklist: ChecklistRow,
  itemIndex: number,
  checkedBy: string | null,
): Promise<ChecklistRow | null> {
  const next = checklist.items.map((item, i) => {
    if (i !== itemIndex) return item;
    const nowChecked = !item.checked;
    return {
      ...item,
      checked: nowChecked,
      checked_at: nowChecked ? new Date().toISOString() : null,
      checked_by: nowChecked ? checkedBy : null,
    };
  });
  const { status, readyAt } = deriveStatus(next);
  const wasReady = checklist.status === "ready";

  const { data, error } = await (supabase as any)
    .from("cleaning_event_checklists")
    .update({
      items: next,
      status,
      ready_at: readyAt ?? checklist.ready_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", checklist.id)
    .select("id, company_id, order_id, kind, items, status, ready_at, created_at, updated_at")
    .single();
  if (error) {
    console.warn("[cleaningChecklistService] toggle failed:", error);
    return null;
  }
  const updated = data as ChecklistRow;
  if (status === "ready" && !wasReady) {
    emitCleaningReady({
      orderId: updated.order_id,
      checklistId: updated.id,
      kind: updated.kind,
    });
  }
  return updated;
}
