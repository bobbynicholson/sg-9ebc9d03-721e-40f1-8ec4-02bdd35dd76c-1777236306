// Email E2E test setup - writes ONLY inside "Raj PayFast Test Company".
// Usage: node tmp/email-e2e/setup.mjs <round-label>
//   Creates (once) the shared email sender + test client, then a fresh quote
//   copied from the company's E2E quote, addressed to rajm267744@gmail.com.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import crypto from "crypto";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const COMPANY = "1417901f-2a08-4fd0-a264-29f47ce371cb";
const ADMIN = "0d8f0046-bf30-4466-9d6f-17c04076fedb";
const TEST_EMAIL = "rajm267744@gmail.com";
const label = process.argv[2] || "Round";

// 1. Email sender: same row the onboarding "Use shared sender" button writes.
const { data: sender } = await sb.from("email_provider_settings").select("id").eq("company_id", COMPANY).neq("provider", "mailchimp").maybeSingle();
if (!sender) {
  const { error } = await sb.from("email_provider_settings").upsert({
    company_id: COMPANY, provider: "resend", from_name: "Raj PayFast Test Company",
    from_email: "raj267748@gmail.com", force_platform_sender: true, updated_at: new Date().toISOString(),
  }, { onConflict: "company_id,provider" });
  if (error) throw new Error("sender: " + error.message);
  console.log("sender: shared CateringMS sender created");
} else console.log("sender: already set");

// 2. Test client.
let { data: client } = await sb.from("clients").select("id").eq("company_id", COMPANY).eq("email", TEST_EMAIL).maybeSingle();
if (!client) {
  const { data, error } = await sb.from("clients").insert({
    company_id: COMPANY, client_name: "RAJ EMAIL TEST", email: TEST_EMAIL, phone: "0826411373",
    client_type: "individual", region_id: "97135d1c-a47d-4496-92e5-4bcd6cf68dcc", is_active: true,
  }).select("id").single();
  if (error) throw new Error("client: " + error.message);
  client = data;
  console.log("client: created");
} else console.log("client: already exists");

// 3. Fresh quote copied from the company's E2E quote.
const { data: src, error: srcErr } = await sb.from("quotes").select("*").eq("id", "620cfd68-b049-4e60-95d4-91251fdf2664").single();
if (srcErr) throw new Error("source quote: " + srcErr.message);
const eventDate = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
const { id: _id, quote_number: _n, public_token: _t, created_at: _c, updated_at: _u, lead_id: _l, accepted_at: _a, converted_to_order_id: _o, sent_at: _s, ...copy } = src;
const quote = {
  ...copy,
  quote_number: `QUO-TEST-${label}-${Date.now().toString().slice(-5)}`,
  quote_name: `EMAIL TEST ${label}`,
  event_type: `EMAIL TEST ${label}`,
  client_id: client.id, client_name: "RAJ EMAIL TEST", contact_name: "RAJ EMAIL TEST",
  client_email: TEST_EMAIL, client_phone: "0826411373",
  event_date: eventDate, valid_until: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
  venue_address: "TEST - no delivery", status: "sent", sent_at: new Date().toISOString(),
  public_token: crypto.randomUUID(), source: "email-e2e-test", prepared_by: ADMIN, user_id: ADMIN,
};
const { data: q, error: qErr } = await sb.from("quotes").insert(quote).select("id, quote_number, public_token, total_amount, event_date").single();
if (qErr) throw new Error("quote: " + qErr.message);
console.log("quote:", JSON.stringify(q));
fs.writeFileSync(`tmp/email-e2e/${label}.json`, JSON.stringify({ quote: q, client_id: client.id }, null, 1));
