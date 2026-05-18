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
  cleaning_event_handovers: ["expected", "in_progress", "complete", "cancelled"],
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

// Baseline allow-list for phantom-table references that pre-date
// this check. Each entry is the (file, table) pair the guard
// would otherwise flag. Adding to this list is grandfathering -
// every entry is a real bug or a planned-table-never-created
// dependency that needs investigation (tracked in A.19 of the
// audit). Goal is to drive the list to zero, NOT to suppress
// new occurrences. The check still fails for any new (file,
// table) combo not on this list.
const BASELINE_PHANTOM_TABLES = new Set([
  // A.20 #5 - invoice_line_items: Sage accounting sync references
  // a table that doesn't exist. The Sage adapter is post-launch
  // deferred per running-todo ("Sync-quote endpoints for Xero /
  // QuickBooks / Sage" - Sage scaffold needs to be cloned from
  // the existing Xero adapter). Leave grandfathered until the
  // Sage path actually ships - the sync function is dead code
  // today.
  "src/pages/api/accounting/sage/sync-invoice.ts::invoice_line_items",

  // A.20 #6 - onboarding_steps: resend domain-verify treats the
  // table as an OPTIONAL persistence target. The writer
  // explicitly swallows error code 42P01 ("relation does not
  // exist") and falls back to no-persistence. Design intent,
  // not a bug: if a tenant adds the table for per-step
  // onboarding tracking, the writer starts populating it; if
  // not, the rest of the flow degrades gracefully. Keep the
  // baseline entry as a marker that the table is intentionally
  // optional.
  "src/pages/api/admin/resend/verify-domain.ts::onboarding_steps",
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

// Live DB tables in the `public` schema as of 2026-05-18 (per
// information_schema.tables). Keep in sync with the actual DB
// when new tables land. The A.17 #2 bug (querying the non-
// existent `subscription_invoices`) shows why: an as-any cast on
// .from() lets a typo / dropped-table reference compile, the
// supabase-js {error} return shape silences the failure at
// runtime, and the bug stays invisible until a real human
// notices the affected surface always reads zero.
const KNOWN_TABLES = new Set([
  "account_deletion_requests","accounting_integrations","admin_notifications","allergens",
  "api_key_rate_limits","api_keys","app_config","audit_logs","backup_generators",
  "billing_history","blocked_contacts","blog_posts","booking_packages",
  "cancellation_requests","chat_messages","chat_sessions","cleaning_duty_logs","cleaning_event_handovers","cleaning_jobs","cleaning_machines",
  "cleaning_schedules","client_access_log","client_access_tokens","clients","cms_pages",
  "companies","company_number_settings","company_number_settings_audit","complaints",
  "currency_fluctuation_alerts","deliveries","delivery_crates","delivery_feedback",
  "delivery_route_stops","delivery_routes","dispatch_messages","driver_assignments",
  "driver_confirmations","driver_locations","driver_rest_logs","driver_shifts",
  "email_automation_log","email_notification_preferences","email_provider_settings",
  "email_settings","email_templates","embed_form_configs","embed_form_submissions",
  "embed_rate_limits","equipment","equipment_bookings","equipment_damages",
  "equipment_handovers","equipment_hire_orders","equipment_kit_items","equipment_kits",
  "equipment_maintenance","equipment_maintenance_log","equipment_shortage_flags",
  "exchange_rates","financial_depreciation","financial_predictions",
  "floor_safety_inspections","fuel_stockpile","gamification_achievements",
  "gamification_points","gps_tracking","health_certificates","import_events",
  "import_jobs","import_rows","ingredient_substitutions","insurance_policies",
  "integrations","inventory","inventory_batches","inventory_demand_outlook",
  "inventory_item_suppliers","inventory_items","inventory_transactions","invoices",
  "kitchen_duty_shifts","kitchen_handoffs","kitchen_payslips","kitchen_prep_tasks",
  "kitchen_shifts","kitchen_staff_members","kitchen_staff_shifts","kitchen_stations",
  "kitchen_task_completions","leads","lighting_tests","loadoff_verifications",
  "menu_items","notifications","onboarding_state","order_amendment_requests",
  "order_assignment_audit","order_ingredient_demand","order_items","order_status_history",
  "orders","outgoing_email_log","outgoing_email_queue","outsource_assignments",
  "outsource_providers","pat_testing","payment_gateway_credentials","payment_gateways",
  "payment_reminders","payments","pending_reviews","pest_control_logs",
  "platform_pricing_plans","profiles","public_holidays","purchase_history",
  "purchase_line_memory","purchase_receipt_items","purchase_receipts",
  "quote_acceptances","quote_change_requests","quote_followup_log","quotes",
  "recipe_ingredients","recipe_scaling_history","recipes","recurring_invoice_runs",
  "recurring_invoice_templates","regions","return_load_tracking",
  "sa_tax_deductibility_rules","safety_checks","safety_equipment","shopping_list_items",
  "shopping_lists","staff_invitations","staff_payment_ledger","staff_shift_tasks",
  "staff_work_sessions","storage_locations","storage_racks","subscriptions","suppliers",
  "support_ticket_messages","support_tickets","temperature_logs","time_clock_entries",
  "training_materials","trial_expiry_notifications","user_departments","user_saved_views",
  "vehicle_bookings","vehicle_maintenance_log","vehicles","waste_logs",
  "webhook_deliveries","webhook_subscriptions","whatsapp_templates",
  "won_then_cancelled_quotes","xero_integration_settings",
]);

function checkFile(path, src) {
  const findings = [];
  const rel = relative(ROOT, path).replace(/\\/g, "/");
  if (IGNORE_FILES.has(rel)) return findings;

  // Table-name existence check. Every `.from("LITERAL")` call site
  // on a Supabase client must reference a real public-schema table.
  // Catches typos and dropped-table references; surfaced the A.17
  // #2 bug (subscription_invoices doesn't exist) in advance of merge.
  //
  // Filters out `supabase.storage.from("BUCKET")` (storage buckets,
  // not tables) by checking the ~40 chars before the .from for a
  // `.storage` segment.
  for (const m of src.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)) {
    const before = src.slice(Math.max(0, m.index - 40), m.index);
    if (/\.storage\s*$/.test(before)) continue;
    const table = m[1];
    if (KNOWN_TABLES.has(table)) continue;
    if (BASELINE_PHANTOM_TABLES.has(`${rel}::${table}`)) continue;
    findings.push({
      file: rel,
      line: src.slice(0, m.index).split("\n").length,
      table,
      column: "(table-existence)",
      literal: table,
      allowed: "(known public.* table)",
      shape: ".from",
    });
  }

  // A.20 #3 - dynamic .from(variableName) detection was prototyped
  // here and removed after the smoke run produced 22 all-legitimate
  // matches (module-scope `const TABLE = "..."` constants in
  // paymentGatewayService, a loop over a literal table-name array
  // in the smoke test, and a config-driven {table, column} map in
  // numbering-settings). All three patterns keep the table name as
  // a near-literal that's still typo-safe at the const / array
  // definition. The check as designed was all-noise-no-signal, so
  // it's not run. If a future dynamic .from() lands that isn't a
  // const-aliased literal, add a one-off lint rule rather than a
  // codebase-wide grep.

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
