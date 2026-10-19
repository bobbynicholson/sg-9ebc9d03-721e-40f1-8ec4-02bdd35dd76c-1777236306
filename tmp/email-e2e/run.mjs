// Email E2E steps against the LOCAL app (localhost:3001, new code), test company only.
// Usage: node tmp/email-e2e/run.mjs <round-label> <step>
//   send-quote : admin's own "Send quote" (POST /api/send-email, like QuoteSendDialog)
//   accept     : client accepts the quote (POST /api/public/quotes/{token}/accept)
//   log        : list emails logged for the test client since the round started
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import fs from "fs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = "http://localhost:3001";
const COMPANY = "1417901f-2a08-4fd0-a264-29f47ce371cb";
const [label, step] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(`tmp/email-e2e/${label}.json`, "utf8"));
const save = () => fs.writeFileSync(`tmp/email-e2e/${label}.json`, JSON.stringify(state, null, 1));

async function adminCookies() {
  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: "raj267748@gmail.com" });
  if (error) throw error;
  const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: v, error: ve } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (ve) throw ve;
  const enc = `base64-${Buffer.from(JSON.stringify(v.session)).toString("base64url")}`;
  const cookies = [];
  for (let i = 0; i < enc.length; i += 3180) cookies.push({ name: enc.length <= 3180 ? storageKey : `${storageKey}.${cookies.length}`, value: enc.slice(i, i + 3180), domain: "localhost", path: "/" });
  return cookies;
}

if (step === "send-quote") {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addCookies(await adminCookies());
  const q = state.quote;
  const res = await ctx.request.post(`${BASE}/api/send-email`, { data: {
    companyId: COMPANY, idempotencyKey: `quote/${q.id}/e2e-${Date.now()}`, to: "rajm267744@gmail.com",
    subject: `Your quote ${q.quote_number} from Raj PayFast Test Company`,
    body: `<p>Hi Raj,</p><p>Here is your quote ${q.quote_number}. Review and accept it here: <a href="${BASE}/q/${q.public_token}">${BASE}/q/${q.public_token}</a></p>`,
    quoteId: q.id, attachQuotePdf: false,
  } });
  console.log("send-quote:", res.status(), JSON.stringify(await res.json()));
  await browser.close();
} else if (step === "accept") {
  state.acceptedAt = new Date().toISOString(); save();
  const res = await fetch(`${BASE}/api/public/quotes/${state.quote.public_token}/accept`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acceptedByName: "Raj Email Test" }),
  });
  console.log("accept:", res.status, (await res.text()).slice(0, 400));
  const { data: q } = await admin.from("quotes").select("status, converted_to_order_id").eq("id", state.quote.id).single();
  state.order_id = q.converted_to_order_id; save();
  const { data: o } = await admin.from("orders").select("order_number, status").eq("id", q.converted_to_order_id || "00000000-0000-0000-0000-000000000000").maybeSingle();
  console.log("quote now:", q.status, "order:", JSON.stringify(o));
} else if (step === "log") {
  const since = process.argv[4] || state.since || "2026-10-15T00:00:00Z";
  const { data } = await admin.from("email_automation_log").select("created_at, status, template_type, subject, recipient_email, error_message")
    .eq("user_id", COMPANY).gte("created_at", since).order("created_at");
  for (const r of data || []) console.log(r.created_at.slice(11, 19), r.status.padEnd(7), (r.template_type || "").padEnd(26), r.recipient_email, "|", r.subject, r.error_message ? "| " + r.error_message : "");
  console.log("total:", (data || []).length);
}
