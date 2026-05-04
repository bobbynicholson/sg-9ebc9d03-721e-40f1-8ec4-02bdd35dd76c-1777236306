/**
 * Tier 6 chart 2 -- Inter-branch capacity grid.
 *
 * Pivots upcoming order volume into a branches x weeks heatmap so the
 * operator can spot "JHB is overbooked next month while CPT has slack
 * -- shift a kitchen team or push CPT marketing".
 *
 * Window: 8 ISO weeks starting from the current week (today inclusive).
 * Cells: order count for that branch in that week. Status filter
 * narrows to active orders only (excludes cancelled).
 *
 * Pure function: takes orders + the branch list. Orders without a
 * region_id, or that fall outside the window, are skipped.
 */
import type { RevenueByMonthInput } from "./aggregateRevenueByMonth";
import type { CancelledOrder } from "./aggregateCancellationReasons";
import type { BranchOption } from "./aggregateBranchSpider";

export interface BranchCapacityCell {
  branchId: string;
  weekIdx: number;          // 0 = current week, increments outwards
  count: number;
  /** Composite intensity 0..1 used to drive the cell colour (count vs busiest cell). */
  intensity: number;
}

export interface BranchCapacityWeek {
  idx: number;
  /** Short label, e.g. "May 6" -- the Monday of that ISO week */
  label: string;
  /** Tooltip-friendly long label, e.g. "Week of 6 May 2026" */
  longLabel: string;
}

export interface BranchCapacityGridResult {
  weeks: BranchCapacityWeek[];
  branches: BranchOption[];
  cells: BranchCapacityCell[];
  /** Grand total of orders represented in the grid. */
  totalOrders: number;
  /** Highest-count cell -- used for ramping. */
  maxCellCount: number;
  /** Pre-computed busiest branch + slowest branch, for the summary line. */
  busiestBranchId: string | null;
  slowestBranchId: string | null;
  isEmpty: boolean;
}

const WEEKS_AHEAD = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfISOWeek = (d: Date): Date => {
  // Monday-anchored. JS getDay() returns 0=Sun..6=Sat -- shift to ISO.
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay();
  const diff = (day + 6) % 7; // days since Monday
  r.setDate(r.getDate() - diff);
  return r;
};

const formatShort = (d: Date): string =>
  d.toLocaleDateString("en-ZA", { month: "short", day: "numeric" });

const formatLong = (d: Date): string =>
  `Week of ${d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}`;

export function aggregateBranchCapacityGrid(
  branches: BranchOption[],
  orders: RevenueByMonthInput[],
  today: Date = new Date(),
): BranchCapacityGridResult {
  if (branches.length === 0) {
    return {
      weeks: [], branches: [], cells: [],
      totalOrders: 0, maxCellCount: 0,
      busiestBranchId: null, slowestBranchId: null,
      isEmpty: true,
    };
  }

  // Build the 8-week window starting at this week's Monday.
  const weekStart0 = startOfISOWeek(today);
  const weeks: BranchCapacityWeek[] = [];
  for (let i = 0; i < WEEKS_AHEAD; i++) {
    const start = new Date(weekStart0.getTime() + i * 7 * DAY_MS);
    weeks.push({
      idx: i,
      label: formatShort(start),
      longLabel: formatLong(start),
    });
  }

  // Bucket: branchId -> weekIdx -> count
  const counts = new Map<string, Map<number, number>>();
  for (const b of branches) counts.set(b.id, new Map());

  const lastWeekEnd = new Date(weekStart0.getTime() + WEEKS_AHEAD * 7 * DAY_MS);

  let totalOrders = 0;
  for (const o of orders as CancelledOrder[]) {
    const rid = o.region_id;
    if (!rid || !counts.has(rid)) continue;
    if (o.status === "cancelled" || o.cancelled_at) continue;
    if (!o.event_date) continue;
    const d = new Date(o.event_date);
    if (isNaN(d.getTime())) continue;
    if (d < weekStart0 || d >= lastWeekEnd) continue;
    const idx = Math.floor((d.getTime() - weekStart0.getTime()) / (7 * DAY_MS));
    if (idx < 0 || idx >= WEEKS_AHEAD) continue;
    const m = counts.get(rid)!;
    m.set(idx, (m.get(idx) || 0) + 1);
    totalOrders += 1;
  }

  // Flatten into cells + find max for intensity.
  let maxCellCount = 0;
  const cells: BranchCapacityCell[] = [];
  for (const b of branches) {
    const m = counts.get(b.id)!;
    for (let i = 0; i < WEEKS_AHEAD; i++) {
      const c = m.get(i) || 0;
      if (c > maxCellCount) maxCellCount = c;
      cells.push({ branchId: b.id, weekIdx: i, count: c, intensity: 0 });
    }
  }
  // Compute intensity now that maxCellCount is known.
  if (maxCellCount > 0) {
    for (const cell of cells) cell.intensity = cell.count / maxCellCount;
  }

  // Branch totals -> busiest / slowest.
  const branchTotals = branches.map((b) => {
    const m = counts.get(b.id)!;
    let total = 0;
    for (const c of m.values()) total += c;
    return { id: b.id, total };
  });
  let busiestBranchId: string | null = null;
  let slowestBranchId: string | null = null;
  if (totalOrders > 0) {
    const busiest = branchTotals.slice().sort((a, b) => b.total - a.total)[0];
    const slowest = branchTotals.slice().sort((a, b) => a.total - b.total)[0];
    busiestBranchId = busiest && busiest.total > 0 ? busiest.id : null;
    slowestBranchId = slowest ? slowest.id : null;
    if (busiestBranchId === slowestBranchId) slowestBranchId = null;
  }

  return {
    weeks,
    branches,
    cells,
    totalOrders,
    maxCellCount,
    busiestBranchId,
    slowestBranchId,
    isEmpty: totalOrders === 0,
  };
}
