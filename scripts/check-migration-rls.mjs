#!/usr/bin/env node
/**
 * CI guard: every public-schema CREATE TABLE in supabase/migrations
 * must be paired with an ENABLE ROW LEVEL SECURITY in the same file.
 *
 * Why: the Phase 1 audit (docs/security-posture.md) found a class of
 * future-foot-guns where a table lands on prod with RLS off and stays
 * off until someone notices via the Supabase advisor. By the time it's
 * noticed there's already real data in it. Catching it in CI before
 * the migration merges is cheaper than retrofitting policies later.
 *
 * Opt-out: prefix the CREATE TABLE line with the comment
 *   -- RLS_OPT_OUT: <reason>
 * The reason becomes part of the diff so reviewers see the explicit
 * trade-off.
 *
 * Run: node scripts/check-migration-rls.mjs
 * Exit 1 if any new table lacks RLS without an opt-out.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

// Match `CREATE TABLE [IF NOT EXISTS] [public.]<name>`. Capture the
// table name (group 1). Case-insensitive. Whitespace tolerant.
const CREATE_TABLE_RE =
  /^[ \t]*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/im;

// Opt-out marker. Must sit on the line immediately before the
// CREATE TABLE so reviewers see the reason in the diff hunk.
const OPT_OUT_RE = /--\s*RLS_OPT_OUT:\s*(.+)$/i;

// Match `ALTER TABLE [public.]<name> ENABLE ROW LEVEL SECURITY`.
const ENABLE_RLS_RE =
  /ALTER\s+TABLE\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;

// Tables we never want to enforce on - PostGIS, supabase-managed
// extensions, etc. Keys are exact table names.
const ALWAYS_EXEMPT = new Set([
  "spatial_ref_sys",
]);

// Migrations whose filename starts before this cutoff are
// grandfathered. The Phase 1 audit verified that every existing
// public table has RLS enabled (see docs/security-posture.md
// section 1.1) - many were enabled in later migrations like the
// wave45_perf_*_rls files, not the one that created them. The
// guard exists to stop new tables landing without RLS; historical
// migrations are out of scope.
//
// Bump this to today's date whenever you do a fresh full audit.
const BASELINE_VERSION = "20260521";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".sql")) out.push(full);
  }
  return out;
}

function scanFile(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  const findings = [];

  // Collect CREATE TABLE occurrences with their preceding-line opt-out marker.
  const created = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(CREATE_TABLE_RE);
    if (!m) continue;
    const tableName = m[1];
    if (ALWAYS_EXEMPT.has(tableName)) continue;

    let optOutReason = null;
    // Look back over up to 3 prior non-blank lines for the opt-out marker.
    let scanned = 0;
    for (let j = i - 1; j >= 0 && scanned < 3; j -= 1) {
      const prev = lines[j].trim();
      if (prev === "") continue;
      scanned += 1;
      const o = prev.match(OPT_OUT_RE);
      if (o) {
        optOutReason = o[1].trim();
        break;
      }
    }
    created.push({ tableName, line: i + 1, optOutReason });
  }

  if (created.length === 0) return findings;

  // Collect every table that gets RLS enabled in the same file.
  const enabled = new Set();
  let em;
  while ((em = ENABLE_RLS_RE.exec(text)) !== null) {
    enabled.add(em[1]);
  }

  for (const c of created) {
    if (c.optOutReason) continue;
    if (enabled.has(c.tableName)) continue;
    findings.push({
      file: relative(ROOT, path),
      line: c.line,
      table: c.tableName,
    });
  }

  return findings;
}

function main() {
  if (!statSync(MIGRATIONS_DIR, { throwIfNoEntry: false })) {
    console.error(`Migrations dir not found: ${MIGRATIONS_DIR}`);
    process.exit(0);
  }
  const files = walk(MIGRATIONS_DIR).sort();
  const all = [];
  let scannedCount = 0;
  for (const f of files) {
    // Grandfather migrations created before the baseline version. The
    // filename leads with a 14-digit timestamp e.g. 20260521090000_*.sql -
    // compare the YYYYMMDD prefix against BASELINE_VERSION.
    const base = f.split(/[\\/]/).pop() || "";
    const ts = base.slice(0, 8);
    if (ts && ts < BASELINE_VERSION) continue;
    scannedCount += 1;
    try {
      all.push(...scanFile(f));
    } catch (e) {
      console.error(`Failed to scan ${f}: ${e.message}`);
      process.exit(2);
    }
  }

  if (all.length === 0) {
    console.log(
      `check-migration-rls: scanned ${scannedCount} post-baseline migration${scannedCount === 1 ? "" : "s"} (baseline ${BASELINE_VERSION}), OK.`,
    );
    process.exit(0);
  }

  console.error(
    `check-migration-rls: ${all.length} table${all.length === 1 ? "" : "s"} created without RLS:`,
  );
  for (const f of all) {
    console.error(`  ${f.file}:${f.line}  table ${f.table}`);
  }
  console.error("");
  console.error(
    "Fix: add `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;` in the same migration,",
  );
  console.error(
    "or opt out with a `-- RLS_OPT_OUT: <reason>` comment on the line above the CREATE TABLE.",
  );
  process.exit(1);
}

main();
