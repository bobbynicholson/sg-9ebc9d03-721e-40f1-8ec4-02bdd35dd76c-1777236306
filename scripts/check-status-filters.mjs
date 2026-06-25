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
  // TIGHTEN I.73: pruned dead values (auto_rejected_late,
  // cancelled_by_client, superseded). DB CHECK now refuses them.
  order_amendment_requests: ["pending", "approved", "rejected"],
  subscriptions: ["trial", "active", "past_due", "cancelled", "suspended"],
  kitchen_shifts: ["scheduled", "active", "completed", "missed", "cancelled"],
  order_driver_interest: ["interested", "withdrawn"],
  outsource_assignments: [
    "requested", "accepted", "declined", "en_route", "on_site", "completed", "cancelled",
  ],
  supplier_payables: ["pending", "paid", "disputed", "written_off"],
  billing_history: ["pending", "completed", "failed", "refunded"],
  cleaning_jobs: ["queued", "in_progress", "complete", "cancelled"],
  cleaning_event_checklists: ["pending", "in_progress", "ready"],
  kitchen_prep_tasks: ["pending", "in_progress", "done", "skipped"],
  // REG-E (regions enum-drift fix): the orders / quotes / leads /
  // invoices status columns are enum-typed and TypeScript catches
  // drift at compile time UNLESS the call site uses `(supabase as any)`
  // to bypass the generated types - which the regions page did. The
  // lint now enforces the enum membership at static-analysis time so
  // a future "declined" / "revised" / similar typo can't ship.
  //
  // Values pulled from pg_enum on 2026-05-23. Keep in sync with the
  // actual DB enum when new labels land.
  orders: [
    "pending", "confirmed", "preparing", "ready", "in_transit",
    "delivered", "completed", "cancelled", "paused",
  ],
  quotes: ["draft", "sent", "accepted", "rejected", "expired"],
  leads: [
    "new", "contacted", "qualified", "quoted", "negotiating",
    "won", "lost", "manual_add",
  ],
  invoices: [
    "draft", "sent", "paid", "partially_paid", "overdue",
    "written_off", "voided",
  ],
};

// REG-E baseline: enum-drift bugs that pre-date the orders/quotes/
// leads/invoices vocab extension. Each is a real silent-failure
// candidate but lives outside this PR's blast radius (money-flow
// paths, payment verification, client portal). Tracked as follow-up
// tasks - DO NOT extend this list; new violations must be fixed.
// REG-E + ENUM-T (enum-drift triage): post-triage there are no
// baselined drift entries. Each previously-baselined hit was either
// fixed for real in this branch or confirmed to be a false positive
// caused by an over-greedy regex (payment_status matching the
// status: pattern; valid invoice_status members the pre-update
// vocab didn't know about). Re-introducing a baseline entry should
// require a comment explaining why the bug can't be fixed inline.
const REG_E_BASELINE = new Set([]);

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
  "cancellation_requests","chat_messages","chat_sessions","cleaning_duty_logs","cleaning_event_checklists","cleaning_event_handovers","cleaning_jobs","cleaning_machines",
  "cleaning_schedules","client_access_log","client_access_tokens","clients","cms_pages",
  "companies","company_number_settings","company_number_settings_audit","complaints",
  "currency_fluctuation_alerts","deliveries","delivery_crates","delivery_feedback",
  "delivery_route_stops","delivery_routes","dispatch_messages","driver_assignments",
  "driver_confirmations","driver_locations","driver_payouts","driver_rest_logs","driver_shifts",
  "email_automation_log","email_delivery_events","email_notification_preferences","email_provider_settings",
  "email_settings","email_templates","embed_form_configs","embed_form_submissions",
  "embed_rate_limits","equipment","equipment_bookings","equipment_damages",
  "equipment_handovers","equipment_hire_orders","equipment_kit_items","equipment_kits",
  "equipment_maintenance","equipment_maintenance_log","equipment_shortage_flags",
  // ODOC H.13: real public.* tables the prior vocab snapshot missed.
  // equipment_shortages = order-level shortage flag (the table the
  // ODOC timeline reads to surface "do we need to hire in?"). Not
  // to be confused with equipment_shortage_flags (notification fan-
  // out table) which was already in the vocab.
  "equipment_shortages",
  // event_attendance = waiter check-in / phase stamps written by
  // /team-portal/waiter chips. The ODOC timeline reads its
  // service_started_at / service_ended_at / equipment_returned_at
  // columns to fire the service-lane steps.
  "event_attendance",
  // order_attachments = per-order file uploads added in H.x.
  "order_attachments",
  "exchange_rates","financial_depreciation","financial_predictions","fixed_costs",
  "floor_safety_inspections","fuel_stockpile","gamification_achievements",
  "gamification_points","gps_tracking","health_certificates","import_events",
  "import_jobs","import_rows","ingredient_substitutions","insurance_policies",
  "integrations","inventory","inventory_batches","inventory_demand_outlook",
  "inventory_item_supplier_price_history",
  "inventory_item_suppliers","inventory_items","inventory_transactions","invoices",
  "kitchen_duty_shifts","kitchen_handoffs","kitchen_payslips","kitchen_prep_tasks",
  "kitchen_shifts","kitchen_staff_members","kitchen_staff_shifts","kitchen_stations",
  "kitchen_task_completions","leads","lighting_tests","loadoff_verifications",
  "menu_items","menu_item_price_history","notifications","onboarding_state","order_amendment_requests",
  "order_assignment_audit","order_driver_interest","order_ingredient_demand","order_items","orders_per_email_rollup","order_status_history",
  "order_chat_messages",
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
  "staff_work_sessions","storage_locations","storage_racks","subscription_webhook_events",
  "subscriptions","suppliers",
  "supplier_payables","support_ticket_messages","support_tickets","temperature_logs","time_clock_entries",
  "training_materials","trial_expiry_notifications","user_access_audit","user_departments","user_saved_views",
  "vehicle_bookings","vehicle_maintenance_log","vehicles","waste_logs",
  "webhook_deliveries","webhook_subscriptions","whatsapp_messages","whatsapp_templates",
  "won_then_cancelled_quotes","xero_integration_settings",
]);

// REG-E: skip a finding when it matches the baseline-allowed set.
const _baselineKey = (rel, table, literal, shape) => `${rel}::${table}::${literal}::${shape}`;
const _isRegEBaseline = (rel, table, literal, shape) =>
  REG_E_BASELINE.has(_baselineKey(rel, table, literal, shape));

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
      if (_isRegEBaseline(rel, table, literal, ".eq")) continue;
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
        if (_isRegEBaseline(rel, table, literal, ".in")) continue;
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

  // Pattern 4: .not("status", "in", "(LITERAL, LITERAL, ...)")
  // REG-E (regions enum-drift fix): the regions page used this shape
  // with a literal `declined` that doesn't exist in the order_status
  // enum. Postgres rejected the cast with 22P02 invalid_input, the
  // supabase-js client swallowed the error, and every per-branch
  // count silently returned null -> rendered as 0. The CI lint didn't
  // catch it because Pattern 2 only looked at .in() with array syntax,
  // not the .not("col","in","(...)") variant.
  for (const m of src.matchAll(/\.not\(\s*["'`]status["'`]\s*,\s*["'`]in["'`]\s*,\s*["'`]\(([^)]+)\)["'`]\s*\)/g)) {
    const arr = m[1];
    // ENUM-T (enum-drift triage): the LeadAgingWidget escapes its
    // values with backslashed quotes inside the PostgREST tuple
    // string ("(\"won\",\"lost\")"). Strip backslash-quotes AND plain
    // quotes before comparing, otherwise the parser sees \"won\ and
    // misses the membership check entirely.
    const literals = arr
      .split(",")
      .map((l) => l.trim().replace(/^[\\"'`]+|[\\"'`]+$/g, ""));
    const table = findTableBefore(src, m.index);
    if (!table || !STATUS_VOCAB[table]) continue;
    for (const literal of literals) {
      if (!STATUS_VOCAB[table].includes(literal)) {
        const shape = '.not("status","in","(...)")';
        if (_isRegEBaseline(rel, table, literal, shape)) continue;
        findings.push({
          file: rel,
          line: src.slice(0, m.index).split("\n").length,
          table,
          column: "status",
          literal,
          allowed: STATUS_VOCAB[table],
          shape,
        });
      }
    }
  }

  // Pattern 3: status: "LITERAL" inside .update({...}) / .insert({...}).
  // Walk every `status: "X"` occurrence and check the preceding
  // ~300 chars for a .update / .insert / .upsert opener AND the
  // preceding ~800 chars for the .from("TABLE") call.
  //
  // The leading lookbehind (?<![A-Za-z0-9_]) excludes payload keys
  // that just happen to END in `status` - the obvious one is
  // `payment_status: "paid"` which is a completely different column
  // and lives in payment_status enum, not order_status. Without the
  // lookbehind every order.update({status: 'completed', payment_
  // status: 'paid'}) call lit up Pattern 3 for a bogus order.status
  // = 'paid' write.
  for (const m of src.matchAll(/(?<![A-Za-z0-9_])status\s*:\s*["'`]([a-z_]+)["'`]/g)) {
    const literal = m[1];
    const lookback300 = src.slice(Math.max(0, m.index - 300), m.index);
    if (!/\.(?:update|insert|upsert)\s*\(/.test(lookback300)) continue;
    const table = findTableBefore(src, m.index);
    if (table && STATUS_VOCAB[table] && !STATUS_VOCAB[table].includes(literal)) {
      const shape = ".update/.insert/.upsert payload";
      if (_isRegEBaseline(rel, table, literal, shape)) continue;
      findings.push({
        file: rel,
        line: src.slice(0, m.index).split("\n").length,
        table,
        column: "status",
        literal,
        allowed: STATUS_VOCAB[table],
        shape,
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
