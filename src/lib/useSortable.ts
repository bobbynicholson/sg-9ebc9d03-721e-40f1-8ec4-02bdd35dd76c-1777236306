/**
 * useSortable -- shared table sort hook.
 *
 * Bobby asked for sortable columns on every table across the platform.
 * This hook centralises the click-to-sort behaviour so each table
 * only needs:
 *   1. A column definition (key + accessor + optional type).
 *   2. The hook call to wrap its rows.
 *   3. The <SortHeader/> component in each <th>.
 *
 * Default sort key + direction come from the first column unless the
 * caller passes `defaultKey` / `defaultDir`. Click toggles between
 * ascending and descending; clicking a different column resets the
 * direction to ascending so the new sort always feels intuitive.
 *
 * Numeric and date types compare with subtraction; strings fall
 * through to localeCompare so SA accented characters sort sensibly.
 */
import { useMemo, useState, useCallback } from "react";

export type SortType = "string" | "number" | "date";
export type SortDir = "asc" | "desc";

export interface ColumnDef<T> {
  /** Stable key used for the sort identifier. Doesn't have to match
   *  a property name on T -- just a string the hook can compare on. */
  key: string;
  /** Pulls the comparable value out of a row. Return null/undefined for
   *  rows where the value is missing; those get sorted to the bottom. */
  accessor: (row: T) => unknown;
  /** How to compare. Defaults to "string". */
  type?: SortType;
}

export interface SortableState<T> {
  rows: T[];
  sortKey: string;
  sortDir: SortDir;
  toggle: (key: string) => void;
  setSort: (key: string, dir: SortDir) => void;
}

const NULLISH = (v: unknown) => v === null || v === undefined || v === "";

function compareValues(a: unknown, b: unknown, type: SortType): number {
  if (NULLISH(a) && NULLISH(b)) return 0;
  if (NULLISH(a)) return 1;
  if (NULLISH(b)) return -1;

  if (type === "number") {
    return Number(a) - Number(b);
  }
  if (type === "date") {
    const ta = a instanceof Date ? a.getTime() : new Date(a as any).getTime();
    const tb = b instanceof Date ? b.getTime() : new Date(b as any).getTime();
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  }
  // string fallback. Use localeCompare so unicode + diacritics behave.
  return String(a).localeCompare(String(b), "en-ZA", { numeric: true, sensitivity: "base" });
}

export function useSortable<T>(
  rows: T[],
  columns: ColumnDef<T>[],
  opts?: { defaultKey?: string; defaultDir?: SortDir },
): SortableState<T> {
  const firstKey = columns[0]?.key || "";
  const [sortKey, setSortKey] = useState<string>(opts?.defaultKey || firstKey);
  const [sortDir, setSortDir] = useState<SortDir>(opts?.defaultDir || "asc");

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const type = col.type || "string";
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = col.accessor(a);
      const bv = col.accessor(b);
      const cmp = compareValues(av, bv, type);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, columns, sortKey, sortDir]);

  const toggle = useCallback((key: string) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        // Clicking the active column flips the direction.
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      // Clicking a different column resets to ascending so the new
      // sort always feels intuitive.
      setSortDir("asc");
      return key;
    });
  }, []);

  const setSort = useCallback((key: string, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
  }, []);

  return { rows: sorted, sortKey, sortDir, toggle, setSort };
}
