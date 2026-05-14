/**
 * Shared notification-display helpers for the team portals.
 *
 * Wave 24: the driver / kitchen / cleaning / shopping portals each
 * had their own ad-hoc priority + age handling, which meant a
 * stale-degradation fix landed on one portal kept the others stuck
 * showing 19-day-old "URGENT" rows. Centralising here keeps every
 * portal in lockstep.
 *
 * The DB row is never mutated by these helpers; they only affect
 * how the badge renders. Reports + audit_logs continue to see the
 * original priority.
 */
import { differenceInDays } from "date-fns";

export type DisplayPriority = "urgent" | "high" | "normal" | "low";

/**
 * Degrade the displayed priority of a notification by age.
 *   urgent / high  -> normal after 3 days
 *   normal         -> low    after 14 days
 *
 * A 19-day-old notification still wearing the "URGENT" badge trains
 * the recipient to ignore future urgents. The age-decay keeps the
 * signal honest without touching the underlying row.
 */
export function effectivePriority(
  rawPriority: string | null | undefined,
  createdAt: string | null | undefined,
): DisplayPriority {
  const raw = (rawPriority || "normal").toLowerCase();
  const normalised: DisplayPriority =
    raw === "urgent" ? "urgent" :
    raw === "high" ? "high" :
    raw === "low" ? "low" :
    "normal";
  if (!createdAt) return normalised;
  let age: number;
  try {
    age = differenceInDays(new Date(), new Date(createdAt));
  } catch {
    return normalised;
  }
  if (normalised === "urgent" || normalised === "high") {
    return age >= 3 ? "normal" : normalised;
  }
  if (normalised === "normal" && age >= 14) return "low";
  return normalised;
}

/**
 * Threshold the "Clear stale" bulk-archive button uses. Anything
 * older than this is considered ripe for a one-tap delete from the
 * recipient's inbox. 14 days matches the priority-degradation cliff
 * so a row that's been demoted to "low" is the same row that the
 * stale button will sweep up.
 */
export const STALE_NOTIFICATION_DAYS = 14;

/**
 * True when the row is older than the stale threshold. Used by the
 * portal headers to count + bulk-delete.
 */
export function isStaleNotification(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  try {
    return differenceInDays(new Date(), new Date(createdAt)) >= STALE_NOTIFICATION_DAYS;
  } catch {
    return false;
  }
}
