/**
 * Tier 3 chart 2 - Client retention cohort (quarterly).
 *
 * Triangular grid:
 *   Rows = client signup quarter (clients.created_at)
 *   Cols = quarters since signup (Q+0, Q+1, Q+2, ...)
 *   Cell = % of cohort that placed at least one order in that quarter
 *
 * Heavy chart - only meaningful with >12 months of history. Caller
 * should hide if `hasEnoughHistory === false`.
 *
 * Pure function: takes clients + orders, returns the cohort grid.
 */
import type { ClientLookupRow, OrderForClientLTV } from "./aggregateTopClients";

export interface CohortCell {
  cohortKey: string;       // "2025-Q2" for the row
  ageQuarters: number;     // 0, 1, 2, ...
  /** Clients in this cohort who placed an order in (cohort + ageQuarters). */
  activeClients: number;
  /** Clients in this cohort total (constant per row). */
  cohortSize: number;
  /** activeClients / cohortSize, 0..1. NaN-safe. */
  retentionRatio: number;
}

export interface CohortRow {
  cohortKey: string;
  cohortLabel: string;     // "Q2 2025"
  cohortSize: number;
  cells: CohortCell[];     // ordered by ageQuarters ascending
}

export interface RetentionCohortResult {
  rows: CohortRow[];
  /** Distinct ageQuarters columns (e.g. [0,1,2,3,4]) so the chart can
   *  draw a uniform header row. */
  ageColumns: number[];
  /** True when we have at least 4 cohort quarters with history. */
  hasEnoughHistory: boolean;
  /** Total clients spanning all cohorts (denominator sanity). */
  totalClients: number;
}

const QUARTER_OF = (d: Date | string | null | undefined): { y: number; q: number } | null => {
  if (!d) return null;
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return null;
  return { y: dt.getFullYear(), q: Math.floor(dt.getMonth() / 3) + 1 };
};

const QUARTER_KEY = (yq: { y: number; q: number }): string => `${yq.y}-Q${yq.q}`;
const QUARTER_LABEL = (yq: { y: number; q: number }): string => `Q${yq.q} ${yq.y}`;

const QUARTERS_BETWEEN = (
  from: { y: number; q: number },
  to: { y: number; q: number },
): number => (to.y - from.y) * 4 + (to.q - from.q);

export function aggregateRetentionCohort(
  clients: ClientLookupRow[],
  orders: OrderForClientLTV[],
  endAt: Date = new Date(),
): RetentionCohortResult {
  // Bucket clients into their signup quarter cohort.
  const cohortByKey = new Map<string, { label: string; clientIds: Set<string> }>();
  let totalClients = 0;
  for (const c of clients) {
    if (!c.created_at) continue;
    const yq = QUARTER_OF(c.created_at);
    if (!yq) continue;
    const key = QUARTER_KEY(yq);
    if (!cohortByKey.has(key)) {
      cohortByKey.set(key, { label: QUARTER_LABEL(yq), clientIds: new Set() });
    }
    cohortByKey.get(key)!.clientIds.add(c.id);
    totalClients += 1;
  }

  // For each client + quarter combination they ordered, mark active.
  const activeByCohortAndAge = new Map<string, Map<number, Set<string>>>();
  // Pre-build the per-cohort age map.
  for (const [key] of cohortByKey) {
    activeByCohortAndAge.set(key, new Map());
  }

  for (const o of orders) {
    if (!o.client_id || !o.event_date) continue;
    if (o.status === "cancelled") continue;
    // Find the cohort for this client.
    let clientCohortKey: string | null = null;
    let clientCohortYQ: { y: number; q: number } | null = null;
    for (const [key, data] of cohortByKey) {
      if (data.clientIds.has(o.client_id)) {
        clientCohortKey = key;
        const [yStr, qStr] = key.split("-Q");
        clientCohortYQ = { y: Number(yStr), q: Number(qStr) };
        break;
      }
    }
    if (!clientCohortKey || !clientCohortYQ) continue;
    const eventYQ = QUARTER_OF(o.event_date);
    if (!eventYQ) continue;
    const age = QUARTERS_BETWEEN(clientCohortYQ, eventYQ);
    if (age < 0) continue;
    const ageMap = activeByCohortAndAge.get(clientCohortKey)!;
    if (!ageMap.has(age)) ageMap.set(age, new Set());
    ageMap.get(age)!.add(o.client_id);
  }

  // Determine the column range. Walk from the OLDEST cohort to NOW.
  const sortedCohortKeys = Array.from(cohortByKey.keys()).sort();
  const nowYQ = (() => {
    const yq = QUARTER_OF(endAt);
    return yq || { y: endAt.getFullYear(), q: 1 };
  })();
  let maxAge = 0;
  for (const key of sortedCohortKeys) {
    const [yStr, qStr] = key.split("-Q");
    const yq = { y: Number(yStr), q: Number(qStr) };
    const age = QUARTERS_BETWEEN(yq, nowYQ);
    if (age > maxAge) maxAge = age;
  }
  const ageColumns = [];
  for (let i = 0; i <= maxAge; i++) ageColumns.push(i);

  // Build the rows.
  const rows: CohortRow[] = [];
  for (const key of sortedCohortKeys) {
    const cohort = cohortByKey.get(key)!;
    const ageMap = activeByCohortAndAge.get(key)!;
    const [yStr, qStr] = key.split("-Q");
    const yq = { y: Number(yStr), q: Number(qStr) };
    const cohortMaxAge = QUARTERS_BETWEEN(yq, nowYQ);
    const cells: CohortCell[] = [];
    for (const age of ageColumns) {
      // Cohorts can't have data past their actual age window. Mark nulls
      // by leaving cohortSize positive but retentionRatio NaN; the chart
      // distinguishes "future" cells visually.
      if (age > cohortMaxAge) {
        cells.push({
          cohortKey: key,
          ageQuarters: age,
          activeClients: 0,
          cohortSize: cohort.clientIds.size,
          retentionRatio: NaN,
        });
        continue;
      }
      const active = ageMap.get(age)?.size ?? 0;
      const ratio = cohort.clientIds.size > 0 ? active / cohort.clientIds.size : 0;
      cells.push({
        cohortKey: key,
        ageQuarters: age,
        activeClients: active,
        cohortSize: cohort.clientIds.size,
        retentionRatio: ratio,
      });
    }
    rows.push({
      cohortKey: key,
      cohortLabel: cohort.label,
      cohortSize: cohort.clientIds.size,
      cells,
    });
  }

  return {
    rows,
    ageColumns,
    hasEnoughHistory: rows.length >= 4,
    totalClients,
  };
}
