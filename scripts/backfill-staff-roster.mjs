// Backfill the pay/clock-in roster (kitchen_staff_members) from existing
// portal logins (profiles) for a tenant.
//
// Why: /admin/staff + /admin/wages read kitchen_staff_members, a roster that
// is SEPARATE from profiles. Staff created via the admin invite flow only get
// a profiles row, so they never appear on the rates/wages surfaces. This
// seeds a linked kitchen_staff_members row for the kitchen / cleaning /
// shopping crew and their managers (Raj's choice, 2026-07-04). Drivers and
// admins are intentionally excluded (drivers have their own driver-management
// roster; admins/owner are not clocked hourly staff).
//
// Idempotent: skips any profile already linked via linked_profile_id.
// Rates are left null so the operator sets them (surfaces as "missing a rate").
//
//   node scripts/backfill-staff-roster.mjs                 # dry run
//   node scripts/backfill-staff-roster.mjs --commit        # actually insert
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const env = Object.fromEntries(readFileSync(path.join(repoRoot, ".env.local"), "utf8").split(/\r?\n/)
  .filter(l => l && !l.startsWith("#") && l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const COMPANY_ID = process.env.COMPANY_ID || "0e139a19-6526-4e1f-9bf7-87d6adbee5f8"; // Spit Braai Delivery
const COMMIT = process.argv.includes("--commit");

// Map a profile's role/active_role -> roster department + friendly title.
// Returns null for roles that should NOT be on this roster.
function mapRoster(role, activeRole) {
  const r = String(activeRole || role || "");
  switch (r) {
    case "kitchen_manager": return { departments: ["kitchen"], role_title: "Kitchen Manager" };
    case "kitchen_staff":   return { departments: ["kitchen"], role_title: "Kitchen" };
    case "cleaning_manager":return { departments: ["cleaning"], role_title: "Cleaning Manager" };
    case "cleaning_staff":  return { departments: ["cleaning"], role_title: "Cleaning" };
    case "shopping_staff":  return { departments: ["shopping"], role_title: "Shopping" };
    default: return null;
  }
}

const { data: profiles, error: pErr } = await db
  .from("profiles")
  .select("id, full_name, email, role, active_role, phone_number")
  .eq("company_id", COMPANY_ID)
  .is("deleted_at", null);
if (pErr) { console.error("profiles fetch failed:", pErr); process.exit(1); }

const { data: existing } = await db
  .from("kitchen_staff_members")
  .select("linked_profile_id, email")
  .eq("company_id", COMPANY_ID)
  .is("deleted_at", null);
const linkedIds = new Set((existing || []).map(r => r.linked_profile_id).filter(Boolean));
const linkedEmails = new Set((existing || []).map(r => (r.email || "").toLowerCase()).filter(Boolean));

const toInsert = [];
for (const p of profiles) {
  const map = mapRoster(p.role, p.active_role);
  if (!map) continue; // not kitchen/cleaning/shopping -> skip (drivers, admins, client)
  if (linkedIds.has(p.id)) { console.log(`skip (already linked): ${p.full_name}`); continue; }
  if (p.email && linkedEmails.has(p.email.toLowerCase())) { console.log(`skip (email exists): ${p.full_name}`); continue; }
  toInsert.push({
    company_id: COMPANY_ID,
    full_name: p.full_name || p.email,
    email: p.email,
    phone: p.phone_number || null,
    linked_profile_id: p.id,
    departments: map.departments,
    role_title: map.role_title,
    is_active: true,
    pay_type: "shift",           // matches the tenant's existing Chef John row; rates left null
    standard_hours_per_day: 9,   // SA norm; operator can adjust
    weekly_ordinary_hours: 45,   // SA BCEA ordinary hours
  });
}

console.log(`\n${toInsert.length} row(s) to add${COMMIT ? "" : " (dry run - pass --commit to apply)"}:`);
for (const r of toInsert) console.log(`  + ${r.full_name.padEnd(24)} ${r.role_title.padEnd(18)} dept=${r.departments.join(",")}`);

if (COMMIT && toInsert.length > 0) {
  const { data, error } = await db.from("kitchen_staff_members").insert(toInsert).select("id, full_name");
  if (error) { console.error("\nINSERT FAILED:", error); process.exit(1); }
  console.log(`\nInserted ${data.length} roster row(s).`);
} else if (!COMMIT) {
  console.log("\nDry run only. Re-run with --commit to insert.");
}
