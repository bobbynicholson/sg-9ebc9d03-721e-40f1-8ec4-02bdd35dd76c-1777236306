import { toLocalISO } from "@/lib/localDate";
/**
 * Tier 2 chart 1 -- Seasonality heatmap.
 *
 * 12-month grid: weeks across, day-of-week down. Each cell = events
 * on that day. Toggle output between count and revenue at the call
 * site (extractor returns both per cell, the chart picks).
 *
 * Why ISO weeks: Mon-Sun. Sunday-start would break SA convention.
 *
 * Pure function: takes a list of orders with event_date + total_amount,
 * returns the 7x53 grid (a year may span 53 ISO weeks).
 */
export interface SeasonalityInput {
  status: string | null;
  total_amount: number | null;
  event_date: string | null;
}

export interface SeasonalityCell {
  /** ISO date "YYYY-MM-DD" of this cell. */
  isoDate: string;
  /** 0 = Monday, 6 = Sunday */
  dow: number;
  /** Sortable key for the column position: "YYYY-Www" */
  weekKey: string;
  count: number;
  revenue: number;
  /** True when this cell sits OUTSIDE the 12-month window
   *  (used for the leading / trailing partial weeks so they render greyed). */
  outOfWindow: boolean;
}

export interface SeasonalityResult {
  /** Cells in row-major order (dow 0..6, then week). Length = 7 * weekCount. */
  cells: SeasonalityCell[];
  /** Distinct weekKeys in display order, oldest first. */
  weekKeys: string[];
  /** Headline numbers for the chart's footer. */
  totalEvents: number;
  totalRevenue: number;
  /** Cell with the highest count (ties go to most recent). null when no data. */
  peakDay: SeasonalityCell | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const isoWeekKey = (d: Date): string => {
  // ISO week-numbering year + ISO week. Mon-Sun convention. The standard
  // trick: roll the date to the Thursday of its week, take that year,
  // count weeks from the year's first Thursday.
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7; // 0 = Mon
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(
    ((tmp.getTime() - firstThursday.getTime()) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
  );
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
};

const dowMonFirst = (d: Date): number => (d.getDay() + 6) % 7;

export function aggregateSeasonalityHeatmap(
  orders: SeasonalityInput[],
  endAt: Date = new Date(),
): SeasonalityResult {
  // Window: 12 calendar months ending at endAt's day. Anchor at the
  // Monday of the FIRST week so the grid is rectangular.
  const windowEnd = new Date(endAt.getFullYear(), endAt.getMonth(), endAt.getDate());
  windowEnd.setHours(0, 0, 0, 0);
  const windowStart = new Date(windowEnd);
  windowStart.setMonth(windowStart.getMonth() - 12);
  // Snap windowStart back to the Monday of its ISO week.
  const startDow = dowMonFirst(windowStart);
  windowStart.setDate(windowStart.getDate() - startDow);

  // Pre-build the empty grid of cells (Mon..Sun for each week in window).
  const cellsByKey = new Map<string, SeasonalityCell>();
  const weekKeysSeen: string[] = [];
  const cursor = new Date(windowStart);
  while (cursor <= windowEnd) {
    const wk = isoWeekKey(cursor);
    if (weekKeysSeen[weekKeysSeen.length - 1] !== wk) weekKeysSeen.push(wk);
    for (let i = 0; i < 7; i++) {
      const day = new Date(cursor);
      day.setDate(day.getDate() + i);
      const iso = toLocalISO(day);
      const dow = dowMonFirst(day);
      const cellKey = `${wk}|${dow}`;
      // Mark outOfWindow when the day is past windowEnd.
      const outOfWindow = day > windowEnd || day < new Date(endAt.getFullYear() - 1, endAt.getMonth(), endAt.getDate() + 1);
      if (!cellsByKey.has(cellKey)) {
        cellsByKey.set(cellKey, {
          isoDate: iso,
          dow,
          weekKey: wk,
          count: 0,
          revenue: 0,
          outOfWindow,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 7);
  }

  // Drop dupes (same week processed twice at month boundaries).
  const weekKeys = Array.from(new Set(weekKeysSeen));

  // Walk orders, slot into cells.
  let totalEvents = 0;
  let totalRevenue = 0;
  let peakDay: SeasonalityCell | null = null;
  for (const o of orders) {
    if (!o.event_date) continue;
    if (o.status === "cancelled") continue;
    const dt = new Date(o.event_date);
    if (isNaN(dt.getTime())) continue;
    if (dt < windowStart || dt > windowEnd) continue;
    const wk = isoWeekKey(dt);
    const dow = dowMonFirst(dt);
    const cellKey = `${wk}|${dow}`;
    const cell = cellsByKey.get(cellKey);
    if (!cell) continue;
    cell.count += 1;
    cell.revenue += Number(o.total_amount || 0);
    totalEvents += 1;
    totalRevenue += Number(o.total_amount || 0);
    if (!peakDay || cell.count > peakDay.count) peakDay = cell;
  }

  // Emit cells in row-major order (dow 0..6, then weeks oldest->newest)
  // so the chart can render rows = days, columns = weeks.
  const cells: SeasonalityCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (const wk of weekKeys) {
      const c = cellsByKey.get(`${wk}|${dow}`);
      if (c) cells.push(c);
    }
  }

  return { cells, weekKeys, totalEvents, totalRevenue, peakDay };
}