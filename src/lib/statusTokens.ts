/**
 * Single source of truth for status colour vocabulary across the app.
 * Used by orders, leads, quotes, invoices, payments, kitchen tasks, drivers,
 * client-facing order pages. Any divergence in the existing copies (5 found
 * in the audit) should be migrated to this map.
 *
 * Colour rules:
 * - amber  = pending / awaiting action / preparing
 * - blue   = confirmed / scheduled / in transit
 * - brand  = ready / done / paid / success
 * - brand  = delivered / completed
 * - rose   = cancelled / failed / overdue
 * - slate  = neutral / archived
 */

export type StatusTone =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "in_transit"
  | "delivered"
  | "completed"
  | "cancelled"
  | "rejected"
  | "draft"
  | "paid"
  | "overdue"
  | "failed";

export const STATUS_TONES: Record<StatusTone, string> = {
  pending:    "bg-amber-100 text-amber-800 border-amber-200",
  draft:      "bg-amber-100 text-amber-800 border-amber-200",
  confirmed:  "bg-blue-100 text-blue-800 border-blue-200",
  preparing:  "bg-amber-100 text-amber-800 border-amber-200",
  ready:      "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
  paid:       "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
  in_transit: "bg-blue-100 text-blue-800 border-blue-200",
  delivered:  "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
  completed:  "bg-slate-100 text-slate-800 border-slate-200",
  cancelled:  "bg-rose-100 text-rose-700 border-rose-200",
  rejected:   "bg-rose-100 text-rose-700 border-rose-200",
  overdue:    "bg-rose-100 text-rose-700 border-rose-200",
  failed:     "bg-rose-100 text-rose-700 border-rose-200",
};

export const STATUS_LABELS: Record<StatusTone, string> = {
  pending:    "Pending",
  draft:      "Draft",
  confirmed:  "Confirmed",
  preparing:  "Preparing",
  ready:      "Ready",
  paid:       "Paid",
  in_transit: "On the way",
  delivered:  "Delivered",
  completed:  "Completed",
  cancelled:  "Cancelled",
  rejected:   "Rejected",
  overdue:    "Overdue",
  failed:     "Failed",
};

/**
 * Safe lookup - returns slate fallback for any unknown status string so a
 * stale value from the DB never crashes a badge render.
 */
export function statusTone(status: string | null | undefined): string {
  if (!status) return STATUS_TONES.completed;
  return (STATUS_TONES as Record<string, string>)[status] ?? STATUS_TONES.completed;
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return (STATUS_LABELS as Record<string, string>)[status] ?? status;
}
