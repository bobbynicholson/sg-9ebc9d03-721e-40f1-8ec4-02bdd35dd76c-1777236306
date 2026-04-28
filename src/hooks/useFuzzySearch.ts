import { useEffect, useMemo, useState } from "react";

/**
 * useFuzzySearch -- a tiny, dependency-free fuzzy matcher for in-memory lists.
 *
 * Built for CateringMS to replace the dumb `.toLowerCase().includes(...)` filters
 * scattered across every admin / team-portal page. It is deliberately small
 * (under 100 lines of real logic) so we don't pull Fuse.js or similar.
 *
 * Scoring tiers (higher = better match, sorted descending):
 *   1000 -- exact field match (case-insensitive)
 *    800 -- field starts with the term
 *    600 -- substring match anywhere in the field
 *    400 -- token-prefix match (each query token starts a word in the field)
 *    200 -- subsequence / fuzzy match (chars appear in order, gap-tolerant)
 *      0 -- no match
 *
 * The score is summed across all listed fields, with the configured weight.
 * A field's first hit dominates so weights stay meaningful.
 *
 * Usage:
 *   const { results, loading } = useFuzzySearch(orders, term, [
 *     { key: "client_name", weight: 2 },
 *     { key: "id" },
 *     { key: "venue_address" },
 *   ]);
 *   results.map(({ item, highlights }) => ...)
 *
 * The hook also debounces the query by default (200ms) so we don't refilter
 * on every keystroke. Pass `debounceMs: 0` to opt out.
 */

export type SearchableValue = string | number | null | undefined;

export interface SearchField<T> {
  /** Either a key on T, or an accessor function returning a stringy value. */
  key: keyof T | ((item: T) => SearchableValue);
  /** Multiplier on the score for hits in this field. Default 1. */
  weight?: number;
  /** Optional label for the field, used in highlight metadata. */
  label?: string;
}

export interface FuzzyMatch<T> {
  item: T;
  score: number;
  /** Per-field highlight ranges so the UI can <mark> the matched substring. */
  highlights: Record<string, [number, number][]>;
}

export interface UseFuzzySearchOpts {
  /** ms to debounce the term. Default 200. Pass 0 to disable. */
  debounceMs?: number;
  /** If true, return all items (with score 0 / no highlights) when term is empty. Default true. */
  includeAllOnEmpty?: boolean;
  /** Cap result count. Default 100. Pass 0 to disable. */
  limit?: number;
}

const SPACE = /\s+/;

function asString(v: SearchableValue): string {
  if (v == null) return "";
  return String(v);
}

/**
 * Score a single field haystack against the lowercased term + tokens.
 * Returns [score, ranges] where ranges is the matched [start, end) pairs.
 */
function scoreField(
  haystackRaw: string,
  term: string,
  tokens: string[],
): [number, [number, number][]] {
  if (!haystackRaw) return [0, []];
  const haystack = haystackRaw.toLowerCase();

  // Tier 1 -- exact
  if (haystack === term) return [1000, [[0, haystackRaw.length]]];

  // Tier 2 -- prefix
  if (haystack.startsWith(term)) return [800, [[0, term.length]]];

  // Tier 3 -- substring
  const sub = haystack.indexOf(term);
  if (sub !== -1) return [600, [[sub, sub + term.length]]];

  // Tier 4 -- token-prefix: every query token starts a word in the haystack
  if (tokens.length > 1) {
    const ranges: [number, number][] = [];
    let allHit = true;
    for (const tok of tokens) {
      // word-boundary scan (ascii-ish; good enough for our latin data)
      let pos = -1;
      let from = 0;
      while (from <= haystack.length - tok.length) {
        const idx = haystack.indexOf(tok, from);
        if (idx === -1) break;
        const before = idx === 0 ? " " : haystack[idx - 1];
        if (!/[a-z0-9]/.test(before)) {
          pos = idx;
          break;
        }
        from = idx + 1;
      }
      if (pos === -1) {
        allHit = false;
        break;
      }
      ranges.push([pos, pos + tok.length]);
    }
    if (allHit) return [400, ranges];
  }

  // Tier 5 -- subsequence (fuzzy). Cheap Levenshtein-ish: chars in order, score
  // by density (closer-together hits score higher).
  let h = 0;
  let firstHit = -1;
  let lastHit = -1;
  const ranges: [number, number][] = [];
  for (let t = 0; t < term.length; t++) {
    const c = term[t];
    const found = haystack.indexOf(c, h);
    if (found === -1) return [0, []];
    if (firstHit === -1) firstHit = found;
    lastHit = found;
    ranges.push([found, found + 1]);
    h = found + 1;
  }
  // density: term covers (term.length / span) of the matched window
  const span = Math.max(1, lastHit - firstHit + 1);
  const density = term.length / span;
  // 100..200 based on density. Anything matched still beats no match.
  return [Math.round(100 + 100 * density), mergeRanges(ranges)];
}

/** Merge overlapping / adjacent [start, end) ranges so the UI doesn't double-mark. */
function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) return ranges;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      out.push(cur);
    }
  }
  return out;
}

/**
 * Render a piece of text with the matched ranges wrapped in <mark> spans.
 * Plain helper -- exported so callers can use it without re-implementing.
 */
export function highlightText(text: string, ranges: [number, number][] = []): Array<{ text: string; match: boolean }> {
  if (!text) return [];
  if (ranges.length === 0) return [{ text, match: false }];
  const out: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  for (const [s, e] of ranges) {
    if (s > cursor) out.push({ text: text.slice(cursor, s), match: false });
    out.push({ text: text.slice(s, e), match: true });
    cursor = e;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), match: false });
  return out;
}

/**
 * Main hook.
 */
export function useFuzzySearch<T>(
  items: T[],
  term: string,
  fields: ReadonlyArray<SearchField<T>>,
  opts: UseFuzzySearchOpts = {},
): { results: FuzzyMatch<T>[]; debouncedTerm: string } {
  const debounceMs = opts.debounceMs ?? 200;
  const includeAllOnEmpty = opts.includeAllOnEmpty ?? true;
  const limit = opts.limit ?? 100;

  // Debounce the term so we don't recompute on every keystroke. Skipping
  // the timer entirely when debounceMs is 0 keeps unit tests deterministic.
  const [debouncedTerm, setDebouncedTerm] = useState(term);
  useEffect(() => {
    if (debounceMs <= 0) {
      setDebouncedTerm(term);
      return;
    }
    const t = setTimeout(() => setDebouncedTerm(term), debounceMs);
    return () => clearTimeout(t);
  }, [term, debounceMs]);

  const results = useMemo<FuzzyMatch<T>[]>(() => {
    const cleanTerm = debouncedTerm.trim().toLowerCase();
    if (!cleanTerm) {
      if (!includeAllOnEmpty) return [];
      const all = items.map((item) => ({ item, score: 0, highlights: {} }));
      return limit > 0 ? all.slice(0, limit) : all;
    }
    const tokens = cleanTerm.split(SPACE).filter(Boolean);
    const scored: FuzzyMatch<T>[] = [];
    for (const item of items) {
      let total = 0;
      const highlights: Record<string, [number, number][]> = {};
      for (const f of fields) {
        const weight = f.weight ?? 1;
        const accessor = typeof f.key === "function" ? f.key : (it: T) => (it as any)[f.key as string];
        const raw = asString(accessor(item));
        if (!raw) continue;
        const [s, ranges] = scoreField(raw, cleanTerm, tokens);
        if (s > 0) {
          total += s * weight;
          const labelKey = f.label || (typeof f.key === "string" ? f.key : "field");
          highlights[labelKey] = ranges;
        }
      }
      if (total > 0) scored.push({ item, score: total, highlights });
    }
    scored.sort((a, b) => b.score - a.score);
    return limit > 0 ? scored.slice(0, limit) : scored;
  }, [items, debouncedTerm, fields, includeAllOnEmpty, limit]);

  return { results, debouncedTerm };
}

/** Convenience -- returns just the items, ordered by score. */
export function useFuzzyItems<T>(
  items: T[],
  term: string,
  fields: ReadonlyArray<SearchField<T>>,
  opts: UseFuzzySearchOpts = {},
): T[] {
  const { results } = useFuzzySearch(items, term, fields, opts);
  return useMemo(() => results.map((r) => r.item), [results]);
}
