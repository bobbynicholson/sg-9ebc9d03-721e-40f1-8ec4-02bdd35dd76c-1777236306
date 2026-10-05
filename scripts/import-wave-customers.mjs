// Import a Wave "customers" CSV export into one company's clients.
//
// - Skips anyone already on file: same email (case-insensitive), or - when
//   the row has no email - same client name. Duplicates inside the CSV are
//   collapsed the same way.
// - New clients follow the in-app importer: default (oldest active) region,
//   imported_at / imported_filename stamped, and automated emails paused for
//   7 days so thousands of imported contacts are not mass-emailed.
// - Existing clients are never modified.
//
// Usage (reads .env.local):
//   node scripts/import-wave-customers.mjs "C:/path/customers.csv"                         -> DRY RUN
//   node scripts/import-wave-customers.mjs "C:/path/customers.csv" --confirm=spit-braai-delivery
//   add --slug=other-company to target another company
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const FILE = process.argv.slice(2).find((a) => !a.startsWith("--"));
const SLUG = arg("slug") || "spit-braai-delivery";
const DRY_RUN = arg("confirm") !== SLUG;
if (!FILE) { console.error("Pass the CSV path as the first argument."); process.exit(1); }

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// RFC 4180 CSV: quoted fields, escaped quotes, newlines inside quotes.
function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
const nameKey = (v) => clean(v).toLowerCase();

const [header, ...records] = parseCsv(readFileSync(FILE, "utf8").replace(/^\uFEFF/, ""));
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
for (const needed of ["company", "firstName", "lastName", "email"]) {
  if (!(needed in col)) { console.error(`CSV is missing the "${needed}" column - is this a Wave customers export?`); process.exit(1); }
}
const get = (r, k) => (k in col ? clean(r[col[k]]) : "");

// --- Company, region, existing clients ------------------------------
const { data: company, error: companyError } = await sb.from("companies").select("id, company_name, slug").eq("slug", SLUG).maybeSingle();
if (companyError) throw companyError;
if (!company) { console.error(`No company with slug "${SLUG}".`); process.exit(1); }
const { data: region } = await sb.from("regions").select("id, name").eq("company_id", company.id)
  .eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
if (!region) { console.error("This company has no active region; create one in the app first."); process.exit(1); }

const existingEmails = new Set();
const existingNames = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("clients").select("email, client_name").eq("company_id", company.id).range(from, from + 999);
  if (error) throw error;
  for (const c of data) {
    if (c.email) existingEmails.add(c.email.toLowerCase().trim());
    if (c.client_name) existingNames.add(nameKey(c.client_name));
  }
  if (data.length < 1000) break;
}
console.log(`Company: ${company.company_name} (${company.slug}) - ${existingEmails.size} existing clients with email, region "${region.name}"`);
console.log(DRY_RUN ? `DRY RUN - nothing will be written. Re-run with --confirm=${SLUG} to import.\n` : "IMPORTING\n");

// --- Map rows --------------------------------------------------------
const nowIso = new Date().toISOString();
const pausedUntil = new Date(Date.now() + 7 * 86400000).toISOString();
const filename = basename(FILE);
const stats = { rows: records.length, existing: 0, duplicateInFile: 0, noNameOrEmail: 0, invalidEmail: 0, toInsert: 0 };
const seenEmails = new Set(); const seenNames = new Set();
const inserts = [];

for (const r of records) {
  const companyName = get(r, "company");
  const person = clean(`${get(r, "firstName")} ${get(r, "lastName")}`);
  const clientName = companyName || person;
  let email = get(r, "email").toLowerCase();
  // Wave sometimes holds "a@x.com; b@y.com" - keep the first as primary.
  const extraEmails = email.split(/[;,\s]+/).filter(Boolean);
  email = extraEmails.shift() || "";
  if (email && !EMAIL.test(email)) { stats.invalidEmail += 1; email = ""; }
  if (!clientName && !email) { stats.noNameOrEmail += 1; continue; }

  const key = nameKey(clientName || email);
  if ((email && existingEmails.has(email)) || (!email && existingNames.has(key))) { stats.existing += 1; continue; }
  if ((email && seenEmails.has(email)) || (!email && seenNames.has(key))) { stats.duplicateInFile += 1; continue; }
  if (email) seenEmails.add(email); else seenNames.add(key);

  const phone = get(r, "phone"); const mobile = get(r, "mobile");
  const notes = [
    companyName && person ? `Contact: ${person}` : "",
    extraEmails.length ? `Other email: ${extraEmails.join(", ")}` : "",
    get(r, "fax") ? `Fax: ${get(r, "fax")}` : "",
    get(r, "website") ? `Website: ${get(r, "website")}` : "",
    [get(r, "shippingAddress1"), get(r, "shippingAddress2"), get(r, "shippingCity"), get(r, "shippingPostalCode")].filter(Boolean).length
      ? `Delivery address: ${[get(r, "shippingAddress1"), get(r, "shippingAddress2"), get(r, "shippingCity"), get(r, "shippingProvince"), get(r, "shippingPostalCode")].filter(Boolean).join(", ")}` : "",
    get(r, "shipToContact") || get(r, "shipToPhone") ? `Delivery contact: ${[get(r, "shipToContact"), get(r, "shipToPhone")].filter(Boolean).join(" ")}` : "",
    get(r, "deliveryInstructions") ? `Delivery instructions: ${get(r, "deliveryInstructions")}` : "",
    Number(get(r, "balance")) ? `Wave balance at export: ${get(r, "currency") || "ZAR"} ${get(r, "balance")}` : "",
  ].filter(Boolean).join("\n");

  inserts.push({
    company_id: company.id,
    region_id: region.id,
    client_name: clientName || email,
    email: email || null,
    // clients.phone is NOT NULL; blank (not null) when the customer has no number.
    phone: phone || mobile || "",
    mobile_number: mobile || null,
    landline_number: mobile && phone ? phone : null,
    billing_address_line1: get(r, "billingAddress1") || null,
    billing_address_line2: get(r, "billingAddress2") || null,
    billing_city: get(r, "billingCity") || null,
    billing_postal_code: get(r, "billingPostalCode") || null,
    preferred_currency: get(r, "currency") || "ZAR",
    notes: notes || null,
    tags: ["wave-import"],
    is_active: true,
    imported_at: nowIso,
    imported_filename: filename,
    comms_paused_until: pausedUntil,
    created_at: /^\d{4}-\d{2}-\d{2}T/.test(get(r, "createdAt")) ? get(r, "createdAt") : nowIso,
  });
}
stats.toInsert = inserts.length;
console.log(`CSV rows:                     ${stats.rows}`);
console.log(`Already in the company:       ${stats.existing} (skipped)`);
console.log(`Duplicates inside the CSV:    ${stats.duplicateInFile} (skipped)`);
console.log(`No name and no email:         ${stats.noNameOrEmail} (skipped)`);
console.log(`Invalid email (imported without email): ${stats.invalidEmail}`);
console.log(`NEW clients to add:           ${stats.toInsert}`);
if (DRY_RUN) {
  console.log("\nSample:", JSON.stringify(inserts.slice(0, 2), null, 1));
  console.log(`\nTo import: node scripts/import-wave-customers.mjs "${FILE}" --confirm=${SLUG}`);
  process.exit(0);
}

// --- Insert in batches; a failing batch is retried row by row ---------
// clients.email is NOT NULL in this database, so customers without an
// email cannot be stored; list them instead of failing whole batches.
const noEmail = inserts.filter((row) => !row.email);
const withEmail = inserts.filter((row) => row.email);
let inserted = 0; const failures = [];
for (let i = 0; i < withEmail.length; i += 500) {
  const batch = withEmail.slice(i, i + 500);
  const { error } = await sb.from("clients").insert(batch);
  if (!error) { inserted += batch.length; }
  else {
    console.log(`\n  batch ${i / 500 + 1} failed (${error.code}): ${error.message} - retrying row by row`);
    for (const row of batch) {
      const { error: rowError } = await sb.from("clients").insert(row);
      if (!rowError) inserted += 1;
      else if (rowError.code === "23505") stats.existing += 1; // added meanwhile
      else failures.push(`${row.client_name} <${row.email || "no email"}>: ${rowError.message}`);
    }
  }
  console.log(`  inserted ${inserted}/${withEmail.length}`);
}
console.log(`\nDone: ${inserted} new clients added to ${company.company_name}.`);
if (noEmail.length) {
  console.log(`${noEmail.length} customer(s) have no email address and were not added (email is required):`);
  noEmail.forEach((row) => console.log(`  ${row.client_name}${row.phone ? " - " + row.phone : ""}`));
}
if (failures.length) {
  console.log(`${failures.length} could not be added:`);
  failures.slice(0, 50).forEach((f) => console.log("  " + f));
}
