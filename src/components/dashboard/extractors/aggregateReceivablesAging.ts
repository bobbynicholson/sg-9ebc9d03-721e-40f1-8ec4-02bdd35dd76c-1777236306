/**
 * Tier 5 chart 2 - Receivables aging.
 *
 * Buckets unpaid invoice balances by how many days past due they are:
 *   not_due   = due_date >= today
 *   d_0_30    = 1..30 days late
 *   d_31_60   = 31..60 days late
 *   d_61_90   = 61..90 days late
 *   d_90_plus = 91+ days late
 *
 * Pure function: takes invoices array as input. Excludes invoices with
 * status='paid' or balance_due <= 0. "Today" is parameterised so tests
 * are deterministic; the wrapper passes new Date() in production.
 */

export interface InvoiceForAging {
  id: string;
  status: string | null;
  due_date: string | null;
  balance_due: number | string | null;
  total_amount: number | string | null;
  client_id?: string | null;
}

export type AgingBucketKey = "not_due" | "d_0_30" | "d_31_60" | "d_61_90" | "d_90_plus";

export interface AgingBucket {
  key: AgingBucketKey;
  label: string;
  shortLabel: string;
  count: number;
  /** Sum of balance_due in this bucket. */
  balance: number;
}

export interface ReceivablesAgingResult {
  buckets: AgingBucket[];
  totalOutstanding: number;
  totalInvoices: number;
  /** Just the overdue chunk, regardless of bucket. */
  overdueBalance: number;
  overdueCount: number;
  /** Largest overdue invoice - shown in the legend for quick context. */
  worstSingle: { balance: number; daysOverdue: number } | null;
}

const BUCKET_DEFS: Array<{ key: AgingBucketKey; label: string; shortLabel: string; from: number; to: number | null }> = [
  { key: "not_due",   label: "Not yet due",  shortLabel: "Not due", from: -Infinity, to: 0   },
  { key: "d_0_30",    label: "1 to 30 days", shortLabel: "1-30",    from: 1,         to: 30  },
  { key: "d_31_60",   label: "31 to 60 days",shortLabel: "31-60",   from: 31,        to: 60  },
  { key: "d_61_90",   label: "61 to 90 days",shortLabel: "61-90",   from: 61,        to: 90  },
  { key: "d_90_plus", label: "Over 90 days", shortLabel: "90+",     from: 91,        to: null },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// Only genuinely-open invoices count toward receivables. Use a POSITIVE
// allowlist (matches InvoiceAgingCard + outstanding-balances) instead of a
// terminal-status blocklist: the old blocklist checked "void"/"cancelled",
// spellings that don't exist in the schema (real terminals are paid,
// voided, written_off), so written-off/voided/draft balances leaked into
// the total and disagreed with every other surface.
const OPEN_STATUSES = new Set(["sent", "partially_paid", "overdue"]);

const daysBetween = (from: Date, to: Date): number => {
  // Floor to UTC midnight on both sides so DST shifts don't smear the
  // bucket boundaries.
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / DAY_MS);
};

export function aggregateReceivablesAging(
  invoices: InvoiceForAging[],
  today: Date = new Date(),
): ReceivablesAgingResult {
  const buckets: AgingBucket[] = BUCKET_DEFS.map((b) => ({
    key: b.key, label: b.label, shortLabel: b.shortLabel, count: 0, balance: 0,
  }));

  let totalOutstanding = 0;
  let totalInvoices = 0;
  let overdueBalance = 0;
  let overdueCount = 0;
  let worstSingle: { balance: number; daysOverdue: number } | null = null;

  for (const inv of invoices) {
    if (!OPEN_STATUSES.has(String(inv.status || ""))) continue;
    if (!inv.due_date) continue;
    const balance = Number(inv.balance_due) || 0;
    if (balance <= 0) continue;

    const due = new Date(inv.due_date);
    if (isNaN(due.getTime())) continue;

    const daysOverdue = daysBetween(due, today);

    let assigned = false;
    for (let i = 0; i < BUCKET_DEFS.length; i++) {
      const def = BUCKET_DEFS[i];
      const inLower = daysOverdue >= def.from;
      const inUpper = def.to === null ? true : daysOverdue <= def.to;
      if (inLower && inUpper) {
        buckets[i].count += 1;
        buckets[i].balance += balance;
        assigned = true;
        break;
      }
    }
    if (!assigned) continue;

    totalInvoices += 1;
    totalOutstanding += balance;
    if (daysOverdue >= 1) {
      overdueBalance += balance;
      overdueCount += 1;
      if (!worstSingle || balance > worstSingle.balance) {
        worstSingle = { balance, daysOverdue };
      }
    }
  }

  return { buckets, totalOutstanding, totalInvoices, overdueBalance, overdueCount, worstSingle };
}
