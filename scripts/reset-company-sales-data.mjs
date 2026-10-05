// Reset ONE company's sales data: every quote, order, invoice and payment
// (incl. refunds, store-credit rows, checkout attempts) plus the rows that
// hang off them (items, status history, assignments, handovers, deliveries,
// reminders, kitchen/cleaning/driver jobs for those orders...).
//
// KEEPS: the company, its users, clients, leads, menu/recipes, equipment,
// inventory, vehicles, payment-gateway setup, plan subscription, templates.
// Other companies are never touched: every delete is scoped to this
// company's own quote/order/invoice/payment ids.
//
// Usage (reads .env.local for NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
//   node scripts/reset-company-sales-data.mjs                       -> DRY RUN (counts only)
//   node scripts/reset-company-sales-data.mjs --confirm=spit-braai-delivery   -> deletes
//   node scripts/reset-company-sales-data.mjs --slug=other-co [--confirm=other-co]
//
// This cannot be undone. Take a Supabase backup first if you may need the data.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const SLUG = arg("slug") || "spit-braai-delivery";
const CONFIRM = arg("confirm");
const DRY_RUN = CONFIRM !== SLUG;

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Missing table / column in this database: skip quietly.
const isSchemaMiss = (e) => e && (["42P01", "42703", "PGRST204", "PGRST205"].includes(e.code) || /does not exist|could not find/i.test(e.message || ""));
const chunk = (list, size = 150) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

async function idsOf(table, column, value) {
  const ids = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("id").eq(column, value).range(from, from + 999);
    if (error) { if (isSchemaMiss(error)) return ids; throw new Error(`${table}: ${error.message}`); }
    ids.push(...data.map((r) => r.id));
    if (data.length < 1000) return ids;
  }
}

// --- 1. Resolve the company ------------------------------------------
const { data: company, error: companyError } = await sb.from("companies")
  .select("id, company_name, slug").eq("slug", SLUG).maybeSingle();
if (companyError) throw companyError;
if (!company) { console.error(`No company with slug "${SLUG}".`); process.exit(1); }
console.log(`Company: ${company.company_name} (${company.slug}) id=${company.id}`);
console.log(DRY_RUN
  ? `DRY RUN - nothing will be deleted. Re-run with --confirm=${SLUG} to delete.\n`
  : "DELETING - this cannot be undone.\n");

const quoteIds = await idsOf("quotes", "company_id", company.id);
const orderIds = await idsOf("orders", "company_id", company.id);
const invoiceIds = await idsOf("invoices", "company_id", company.id);
const paymentIds = await idsOf("payments", "company_id", company.id);
const ids = { quote: quoteIds, order: orderIds, invoice: invoiceIds, payment: paymentIds, company: [company.id] };
console.log(`Found: ${quoteIds.length} quotes, ${orderIds.length} orders, ${invoiceIds.length} invoices, ${paymentIds.length} payments\n`);

// --- 2. What to delete, children before parents ----------------------
// [table, column, which id list]. Tables/columns absent in this DB are skipped.
const PLAN = [
  // order children
  ...[
    "order_items", "order_status_history", "order_attachments", "order_chat_messages", "order_amendment_requests",
    "order_assignment_audit", "order_driver_interest", "order_reviews", "order_work_contributors",
    "driver_assignments", "driver_confirmations", "driver_replacement_requests", "driver_shifts", "driver_earnings",
    "deliveries", "delivery_feedback", "delivery_stops", "delivery_route_stops", "route_stops", "dispatch_messages",
    "gps_tracking", "proximity_alerts", "vehicle_bookings",
    "kitchen_prep_tasks", "kitchen_duty_shifts", "kitchen_shifts", "kitchen_task_completions", "prep_lists",
    "recipe_scaling_history", "inventory_transactions",
    "cleaning_event_checklists", "cleaning_event_handovers",
    "equipment_bookings", "equipment_damages", "equipment_handovers", "equipment_hire_orders",
    "equipment_shortage_flags", "equipment_shortage_reports", "equipment_assignments",
    "outsource_assignments", "after_sales_schedules", "event_attendance", "pending_reviews",
    "cancellation_requests", "complaints", "complaint_tickets", "client_access_log", "client_access_tokens",
    "email_automation_log", "gamification_points", "role_work_sessions", "payment_reminders", "payment_schedules",
  ].map((t) => [t, "order_id", "order"]),
  ["shopping_list_items", "source_order_id", "order"],
  // quote children
  ...["quote_items", "quote_acceptances", "quote_change_requests", "quote_followup_log"].map((t) => [t, "quote_id", "quote"]),
  ["equipment_hire_orders", "quote_id", "quote"],
  // money children
  ["payment_receipt_outbox", "payment_id", "payment"],
  ["refund_reconciliation_events", "payment_id", "payment"],
  ["payment_credit_redemptions", "invoice_id", "invoice"],
  ["payment_credit_redemptions", "order_id", "order"],
  ["payment_credit_redemptions", "company_id", "company"],
  ["recurring_invoice_runs", "invoice_id", "invoice"],
  ["payment_attempts", "company_id", "company"],
  ["payment_gateway_events", "company_id", "company"],
  // the spine
  ["payments", "company_id", "company"],
  ["invoices", "company_id", "company"],
  ["orders", "company_id", "company"],
  ["quotes", "company_id", "company"],
];

// Links that would block or dangle: clear them instead of deleting the row.
const UNLINK = [
  ["payments", "refund_original_payment_id", "company_id"],
  ["quotes", "converted_to_order_id", "company_id"],
  ["quotes", "parent_quote_id", "company_id"],
  ["orders", "quote_id", "company_id"],
  ["leads", "source_order_id", "company_id"],
];

async function countRows(table, column, list) {
  let total = 0;
  for (const part of chunk(list)) {
    const { count, error } = await sb.from(table).select("*", { count: "exact", head: true }).in(column, part);
    if (error) return isSchemaMiss(error) ? null : `ERR ${error.message}`;
    total += count || 0;
  }
  return total;
}

async function deleteRows(table, column, list) {
  for (const part of chunk(list)) {
    const { error } = await sb.from(table).delete().in(column, part);
    if (error) return isSchemaMiss(error) ? null : error;
  }
  return null;
}

// --- 3. Preview ------------------------------------------------------
const seen = new Set();
for (const [table, column, kind] of PLAN) {
  if (!ids[kind].length) continue;
  const n = await countRows(table, column, ids[kind]);
  if (n === null || n === 0) continue;
  const key = `${table}.${column}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`  ${String(n).padStart(6)}  ${table} (by ${column})`);
}
if (DRY_RUN) {
  console.log(`\nDry run complete. To delete the rows above run:\n  node scripts/reset-company-sales-data.mjs --confirm=${SLUG}`);
  process.exit(0);
}

// --- 4. Delete -------------------------------------------------------
for (const [table, column] of UNLINK) {
  const { error } = await sb.from(table).update({ [column]: null }).eq("company_id", company.id).not(column, "is", null);
  if (error && !isSchemaMiss(error)) console.log(`  unlink ${table}.${column}: ${error.message}`);
}

let pending = PLAN.filter(([, , kind]) => ids[kind].length);
for (let pass = 1; pass <= 4 && pending.length; pass++) {
  const failed = [];
  for (const step of pending) {
    const [table, column, kind] = step;
    const error = await deleteRows(table, column, ids[kind]);
    if (error) failed.push([...step, error.message]);
  }
  if (failed.length) console.log(`pass ${pass}: ${failed.length} step(s) blocked, retrying`);
  pending = failed.map(([t, c, k]) => [t, c, k]);
  if (pass === 4 && failed.length) {
    console.log("\nSTILL BLOCKED (nothing else of this company is affected):");
    for (const [t, c, , msg] of failed) console.log(`  ${t}.${c}: ${msg}`);
  }
}

// --- 5. Verify -------------------------------------------------------
console.log("\nRemaining for this company:");
let leftover = 0;
for (const table of ["quotes", "orders", "invoices", "payments", "payment_attempts"]) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true }).eq("company_id", company.id);
  if (error && isSchemaMiss(error)) continue;
  console.log(`  ${table}: ${error ? "ERR " + error.message : count}`);
  leftover += count || 0;
}
console.log(leftover ? "\nSome rows remain - see messages above." : "\nDone. This company now starts with no quotes, orders, invoices or payments.");
