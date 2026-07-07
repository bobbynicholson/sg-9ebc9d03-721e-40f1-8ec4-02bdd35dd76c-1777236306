/**
 * Fix invoice due_date rows that land AFTER the event.
 *
 * Bug (owner Callum 2026-07-08): the invoice generator capped the due
 * date at event_date - 1 day ONLY when that date was still in the
 * future, so a same-day / imminent event fell back to invoice_date +
 * termDays and the balance was "due" 14 days AFTER the function.
 *
 * Correct rule: the balance is never due after the event. Prefer 1 day
 * before the event, but never after the event day and never before the
 * invoice date. This script recomputes due_date for existing invoices
 * using the SAME rule and reports / applies the change.
 *
 * Usage:
 *   node scripts/fix-invoice-due-dates.mjs            # dry run (default)
 *   node scripts/fix-invoice-due-dates.mjs --apply    # write changes
 *   node scripts/fix-invoice-due-dates.mjs --token <public_token>   # single invoice
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const tokenIdx = args.indexOf("--token");
const ONE_TOKEN = tokenIdx >= 0 ? args[tokenIdx + 1] : null;

const dayStart = (d) => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Recompute the correct due date from the event date + invoice date,
// matching src/services/invoiceGenerationService.ts.
function correctDue(invoiceDate, eventDate, currentDue) {
  const invDay = dayStart(invoiceDate);
  const evDay = dayStart(eventDate);
  const curDue = dayStart(currentDue);
  if (!evDay || !invDay) return null; // nothing to cap against
  const dayBefore = new Date(evDay.getTime() - 86400000);
  // Keep the operator's term if it's already at/under 1-day-before-event.
  let capped = curDue && curDue.getTime() < dayBefore.getTime() ? curDue : dayBefore;
  if (capped.getTime() > evDay.getTime()) capped = evDay;   // never after event
  if (capped.getTime() < invDay.getTime()) capped = invDay; // never before invoice date
  return capped;
}

let q = sb
  .from("invoices")
  .select("id, public_token, invoice_number, invoice_date, due_date, order_id, balance_due, status, invoice_data, orders:order_id(event_date)")
  .is("deleted_at", null);
if (ONE_TOKEN) q = q.eq("public_token", ONE_TOKEN);

const { data: invoices, error } = await q;
if (error) { console.error("query failed:", error); process.exit(1); }

let changed = 0, skipped = 0;
for (const inv of invoices || []) {
  const eventDate = inv.orders?.event_date || inv.invoice_data?.eventDate || null;
  if (!eventDate) { skipped++; continue; }
  const correct = correctDue(inv.invoice_date, eventDate, inv.due_date);
  if (!correct) { skipped++; continue; }
  const correctIso = iso(correct);
  const curIso = inv.due_date ? iso(dayStart(inv.due_date)) : null;
  if (correctIso === curIso) { skipped++; continue; }
  changed++;
  console.log(
    `${inv.invoice_number} (${inv.public_token}) event ${String(eventDate).slice(0, 10)} | due ${curIso} -> ${correctIso}${inv.balance_due > 0 ? "" : "  [settled]"}`,
  );
  if (APPLY) {
    const { error: upErr } = await sb.from("invoices").update({ due_date: correctIso }).eq("id", inv.id);
    if (upErr) console.error(`  ! update failed for ${inv.invoice_number}:`, upErr.message);
  }
}

console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"} - ${changed} invoice(s) ${APPLY ? "updated" : "would change"}, ${skipped} unchanged/skipped, ${(invoices || []).length} scanned.`);
if (!APPLY && changed > 0) console.log("Re-run with --apply to write these changes.");
