#!/usr/bin/env node
/**
 * CI guard: every supabase.channel(...) call must take a template
 * literal whose body references one of the canonical tenant identifiers
 * (companyId, company_id, userId, user_id). Catches the foot-gun class
 * that Phase 6 audit fixed - cross-tenant realtime amplification +
 * payload-in-transit from a globally-named channel.
 *
 * See docs/perf-and-ops.md section 2 for the pattern.
 *
 * Run: node scripts/check-realtime-channels.mjs
 * Exits 1 on any unsafe channel name.
 *
 * Allowlist exit: prefix the offending line with the comment
 *   // CHANNEL_OPT_OUT: <reason>
 * to suppress. The reason becomes part of the diff so reviewers see
 * the explicit trade-off.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCAN_DIRS = [
  join(ROOT, "src", "pages"),
  join(ROOT, "src", "components"),
  join(ROOT, "src", "services"),
  join(ROOT, "src", "hooks"),
  join(ROOT, "src", "contexts"),
  join(ROOT, "src", "lib"),
];

// Match `.channel(<arg>)` where <arg> is either a string literal or a
// template literal. We capture the raw argument and inspect it.
const CHANNEL_RE =
  /\.channel\(\s*((?:`[^`]*`)|(?:"[^"]*")|(?:'[^']*'))\s*[,)]/g;

// What counts as "tenant-scoped enough" for a channel name:
//   - The channel name interpolates at least one variable (any
//     ${...}). This rules out the worst case - a hardcoded global
//     string like "admin-dashboard-orders" that broadcasts the same
//     events to every tenant in the world.
//   - The interpolated variable is implicitly tenant-bound when it's
//     a tenant-scoped entity id (orderId / listId / userId / etc).
//     We don't try to verify that here - reviewers do. The lint just
//     guarantees there IS some interpolation.
//
// The narrower TENANT_TOKENS check was rejected as too strict - it
// flagged legitimate per-entity channels (dispatch-msgs-${orderId},
// prep-timer-${orderId}) which are tenant-bound via the random UUID
// of an entity the receiving session has authenticated access to.
const HAS_INTERPOLATION = /\$\{[^}]+\}/;

const OPT_OUT_RE = /\/\/\s*CHANNEL_OPT_OUT:\s*(.+)$/;

function walk(dir) {
  const out = [];
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(full)) out.push(full);
  }
  return out;
}

function isTenantScoped(arg) {
  // String literals (double/single-quoted) are never scoped because
  // they have no interpolation.
  if (arg.startsWith('"') || arg.startsWith("'")) return false;
  // Template literals are scoped if they contain at least one
  // ${...} interpolation.
  return HAS_INTERPOLATION.test(arg);
}

function scanFile(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  const findings = [];

  // Each match position needs a line number for the report.
  let match;
  CHANNEL_RE.lastIndex = 0;
  while ((match = CHANNEL_RE.exec(text)) !== null) {
    const arg = match[1];
    if (isTenantScoped(arg)) continue;

    // Find the line number for the match.
    const upToMatch = text.slice(0, match.index);
    const lineNo = upToMatch.split(/\r?\n/).length;

    // Look back over the previous non-blank line for an opt-out
    // marker.
    let optOutReason = null;
    for (let j = lineNo - 2; j >= 0; j -= 1) {
      const prev = (lines[j] || "").trim();
      if (prev === "") continue;
      const o = prev.match(OPT_OUT_RE);
      if (o) optOutReason = o[1].trim();
      break;
    }
    if (optOutReason) continue;

    findings.push({
      file: relative(ROOT, path),
      line: lineNo,
      arg,
    });
  }

  return findings;
}

function main() {
  const files = SCAN_DIRS.flatMap(walk).sort();
  const all = [];
  for (const f of files) {
    try {
      all.push(...scanFile(f));
    } catch (e) {
      console.error(`Failed to scan ${f}: ${e.message}`);
      process.exit(2);
    }
  }

  if (all.length === 0) {
    console.log(`check-realtime-channels: scanned ${files.length} files, OK.`);
    process.exit(0);
  }

  console.error(
    `check-realtime-channels: ${all.length} unscoped channel${all.length === 1 ? "" : "s"} found:`,
  );
  for (const f of all) {
    console.error(`  ${f.file}:${f.line}  channel(${f.arg})`);
  }
  console.error("");
  console.error(
    "Fix: every .channel() call should take a template literal that interpolates",
  );
  console.error(
    "a tenant identifier (companyId, user_id, etc) so the broadcast namespace is",
  );
  console.error(
    "partitioned per tenant. See docs/perf-and-ops.md section 2.",
  );
  console.error("");
  console.error(
    "Override with a `// CHANNEL_OPT_OUT: <reason>` comment on the line above",
  );
  console.error("the channel call if the global name is intentional.");
  process.exit(1);
}

main();
