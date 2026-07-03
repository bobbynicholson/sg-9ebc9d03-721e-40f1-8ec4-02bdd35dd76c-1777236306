// Fresh-start cleanup (2026-07-04, on Raj's instruction after the 02-Jul
// restore): delete all TRANSACTIONAL data, keep people + catalogue + config.
//
// KEEPS: clients (the "leads" the client asked for), leads, profiles,
// companies, regions, menu/recipes/ingredients, equipment + kits,
// suppliers, inventory items, vehicles, stations/machines, templates,
// gateway + integration config, packages, platform/subscription tables.
//
// DELETES: orders/quotes/invoices/payments and every event-shaped child:
// confirmations, assignments, shifts, prep tasks, cleaning jobs, shopping
// lists, handovers, bookings, notifications, email/whatsapp logs + queue,
// audit/history/GPS/import logs, feedback, reviews, purchases.
//
// Multi-pass: FK-blocked deletes are retried after their parents clear.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter(l => l && !l.startsWith("#") && l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DELETE_TABLES = [
  // logs / leaves first
  "order_items", "order_status_history", "order_attachments", "order_chat_messages",
  "order_amendment_requests", "order_assignment_audit", "order_driver_interest",
  "orders_per_email_rollup",
  "driver_confirmations", "driver_locations", "driver_payouts", "driver_rest_logs",
  "driver_shifts", "driver_assignments", "gps_tracking", "dispatch_messages",
  "delivery_route_stops", "delivery_routes", "delivery_crates", "delivery_feedback",
  "deliveries", "return_load_tracking", "loadoff_verifications", "vehicle_bookings",
  "vehicle_maintenance_log",
  "kitchen_prep_tasks", "kitchen_duty_shifts", "kitchen_handoffs", "kitchen_payslips",
  "kitchen_shifts", "kitchen_staff_shifts", "kitchen_task_completions",
  "temperature_logs", "waste_logs",
  "cleaning_jobs", "cleaning_duty_logs", "cleaning_event_checklists",
  "cleaning_event_handovers", "cleaning_schedules",
  "shopping_list_items", "shopping_lists",
  "equipment_bookings", "equipment_damages", "equipment_handovers",
  "equipment_hire_orders", "equipment_shortage_flags", "equipment_maintenance_log",
  "equipment_maintenance",
  "inventory_transactions", "inventory_batches", "inventory_demand_outlook",
  "inventory_item_supplier_price_history", "menu_item_price_history",
  "recipe_scaling_history",
  "purchase_receipt_items", "purchase_receipts", "purchase_history", "purchase_line_memory",
  "supplier_payables",
  "notifications", "admin_notifications", "outgoing_email_queue", "outgoing_email_log",
  "email_automation_log", "email_delivery_events", "whatsapp_messages",
  "chat_messages", "chat_sessions", "complaints",
  "support_ticket_messages", "support_tickets",
  "event_attendance", "pending_reviews", "cancellation_requests",
  "client_access_log", "client_access_tokens", "user_access_audit", "audit_logs",
  "import_rows", "import_events", "import_jobs", "embed_form_submissions",
  "gamification_points", "gamification_achievements",
  "staff_payment_ledger", "staff_work_sessions", "staff_shift_tasks", "time_clock_entries",
  "outsource_assignments", "quote_followup_log", "quote_acceptances", "quote_change_requests",
  "won_then_cancelled_quotes", "currency_fluctuation_alerts", "trial_expiry_notifications",
  "financial_predictions", "webhook_deliveries", "account_deletion_requests",
  "payment_reminders", "recurring_invoice_runs",
  // money spine, then parents
  "payments", "invoices",
  "orders",
  "quotes",
];

async function wipe(t) {
  let { error } = await sb.from(t).delete().not("id", "is", null);
  if (error && /column .*id.* does not exist/i.test(error.message)) {
    ({ error } = await sb.from(t).delete().gte("created_at", "1900-01-01"));
  }
  return error;
}

const failed = new Map();
for (let pass = 1; pass <= 4; pass++) {
  const targets = pass === 1 ? DELETE_TABLES : [...failed.keys()];
  if (!targets.length) break;
  failed.clear();
  console.log(`--- pass ${pass} (${targets.length} tables) ---`);
  for (const t of targets) {
    const error = await wipe(t);
    if (error) {
      failed.set(t, error.message);
      console.log(`  RETRY-LATER ${t}: ${error.message.slice(0, 90)}`);
    }
  }
}
if (failed.size) {
  console.log("STILL FAILING:", JSON.stringify([...failed.entries()], null, 1));
}

console.log("\n--- final census ---");
for (const t of ["orders", "quotes", "invoices", "payments", "notifications", "clients", "leads", "profiles", "menu_items", "recipes", "equipment", "suppliers", "inventory_items", "companies"]) {
  const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
  console.log(`${t}: ${error ? "ERR " + error.message.slice(0, 40) : count}`);
}
console.log("\nKEPT tables were never touched. Done.");
