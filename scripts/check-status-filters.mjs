#!/usr/bin/env node
/**
 * Static-analysis guard for stale Supabase status filters.
 *
 * The 2026-05-18 audit sessions found 8 production bugs that
 * traced back to `.eq("status", "LITERAL")` / `.in("status",
 * ["LITERAL", ...])` / `.update({status: "LITERAL"})` calls where
 * the literal had drifted out of the DB CHECK / enum (the queue
 * vocabulary moved from 'pending' to 'queued', subscription_status
 * dropped 'trialing', billing_history.status never accepted
 * 'succeeded', etc). The supabase-js {error} return shape
 * silently swallowed every one.
 *
 * The eslint rule in eslint.config.mjs (PR #61) catches `as any`
 * on the write side. This script catches the literal-string
 * filter side. The two together cover the full read/write surface
 * for the known foot-gun.
 *
 * Add new tables to STATUS_VOCAB as schemas evolve. The map is
 * the source of truth that the script enforces against the
 * codebase - keep it in sync with the actual CHECK / enum.
 *
 * Run: node scripts/check-status-filters.mjs
 * Exits 1 on any mismatch (so CI can gate merges).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

// Table -> allowed `status` literal values.
// Pulled from the live DB's information_schema + pg_enum as of
// 2026-05-18. Keep in sync with the actual CHECK / enum.
const STATUS_VOCAB = {
  outgoing_email_queue: ["queued", "in_progress", "paused", "sent", "failed", "cancelled"],
  driver_assignments: [
    "assigned", "accepted", "en_route", "picked_up", "at_venue",
    "delivered", "completed", "cancelled", "rejected",
  ],
  order_amendment_requests: [
    "pending", "approved", "rejected", "auto_rejected_late", "cancelled_by_client",
  ],
  subscriptions: ["trial", "active", "past_due", "cancelled", "suspended"],
  kitchen_shifts: ["scheduled", "active", "completed", "missed", "cancelled"],
  outsource_assignments: [
    "requested", "accepted", "declined", "en_route", "on_site", "completed", "cancelled",
  ],
  billing_history: ["pending", "completed", "failed", "refunded"],
  cleaning_jobs: ["queued", "in_progress", "complete", "cancelled"],
  kitchen_prep_tasks: ["pending", "in_progress", "done", "skipped"],
};

// `companies.subscription_status` is the enum-typed column we
// already trimmed to ['trial','active','past_due','cancelled',
// 'suspended']. TS catches drift here at compile time so we don't
// need a runtime check; listed for completeness.
const ENUM_TYPED_STATUS_COLUMNS = {
  companies: { subscription_status: ["trial", "active", "past_due", "cancelled", "suspended"] },
};

// File-level allow-list. When a file legitimately uses a value
// outside the vocab (e.g. a mapping function that takes external
// vocabulary and translates to the DB vocab), add it here. The
// equipmentTrackingService maps UI-level vocab to DB vocab inside
// a function; the input statuses are not DB writes.
const IGNORE_FILES = new Set([
  "src/services/equipmentTrackingService.ts",
]);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full, acc);
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Find the most recent `.from("TABLE")` call before `pos` in
 * `src`, within `lookback` chars. Returns the table name or null.
 *
 * The chain is usually:
 *   supabase.from("orders").select("...").eq("status", "X")
 * so the .from() literal appears earlier in the same chain. We
 * scan backwards from the .eq position; works for most patterns.
 */
function findTableBefore(src, pos, lookback = 800) {
  const start = Math.max(0, pos - lookback);
  const slice = src.slice(start, pos);
  const fromMatches = [...slice.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)];
  if (fromMatches.length === 0) return null;
  return fromMatches[fromMatches.length - 1][1];
}

function checkFile(path, src) {
  const findings = [];
  const rel = relative(ROOT, path).replace(/\\/g, "/");
  if (IGNORE_FILES.has(rel)) return findings;

  // Pattern 1: .eq("status", "LITERAL")
  for (const m of src.matchAll(/\.eq\(\s*["'`]status["'`]\s*,\s*["'`]([a-z_]+)["'`]/g)) {
    const literal = m[1];
    const table = findTableBefore(src, m.index);
    if (table && STATUS_VOCAB[table] && !STATUS_VOCAB[table].includes(literal)) {
      findings.push({
        file: rel,
        line: src.slice(0, m.index).split("\n").length,
        table,
        column: "status",
        literal,
        allowed: STATUS_VOCAB[table],
        shape: ".eq",
      });
    }
  }

  // Pattern 2: .in("status", ["LITERAL", "LITERAL", ...])
  for (const m of src.matchAll(/\.in\(\s*["'`]status["'`]\s*,\s*\[([^\]]+)\]/g)) {
    const arr = m[1];
    const literals = [...arr.matchAll(/["'`]([a-z_]+)["'`]/g)].map((l) => l[1]);
    const table = findTableBefore(src, m.index);
    if (!table || !STATUS_VOCAB[table]) continue;
    for (const literal of literals) {
      if (!STATUS_VOCAB[table].includes(literal)) {
        findings.push({
          file: rel,
          line: src.slice(0, m.index).split("\n").length,
          table,
          column: "status",
          literal,
          allowed: STATUS_VOCAB[table],
          shape: ".in",
        });
      }
    }
  }

  // Pattern 3: status: "LITERAL" inside .update({...}) / .insert({...}).
  // Walk every `status: "X"` occurrence and check the preceding
  // ~300 chars for a .update / .insert / .upsert opener AND the
  // preceding ~800 chars for the .from("TABLE") call.
  for (const m of src.matchAll(/status\s*:\s*["'`]([a-z_]+)["'`]/g)) {
    const literal = m[1];
    const lookback300 = src.slice(Math.max(0, m.index - 300), m.index);
    if (!/\.(?:update|insert|upsert)\s*\(/.test(lookback300)) continue;
    const table = findTableBefore(src, m.index);
    if (table && STATUS_VOCAB[table] && !STATUS_VOCAB[table].includes(literal)) {
      findings.push({
        file: rel,
        line: src.slice(0, m.index).split("\n").length,
        table,
        column: "status",
        literal,
        allowed: STATUS_VOCAB[table],
        shape: ".update/.insert/.upsert payload",
      });
    }
  }

  return findings;
}

function main() {
  const files = walk(SRC);
  const all = [];
  for (const path of files) {
    const src = readFileSync(path, "utf-8");
    all.push(...checkFile(path, src));
  }

  if (all.length === 0) {
    console.log("check-status-filters: clean (0 stale literal-status filters)");
    process.exit(0);
  }

  console.error(`check-status-filters: found ${all.length} stale status filter(s)`);
  for (const f of all) {
    console.error(
      `  ${f.file}:${f.line}  ${f.table}.${f.column} ${f.shape}  literal=${JSON.stringify(f.literal)}  allowed=${JSON.stringify(f.allowed)}`,
    );
  }
  console.error("");
  console.error("Fix the literal to match the table's CHECK / enum, or add the file to IGNORE_FILES if the value is intentionally not a DB write (e.g. a UI-vocab mapping function).");
  process.exit(1);
}

main();
