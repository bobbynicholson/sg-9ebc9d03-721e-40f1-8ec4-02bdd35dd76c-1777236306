// Shared helpers for the email E2E run (test company only, local app).
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import fs from "fs";
import crypto from "crypto";

export const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
export const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const BASE = "http://localhost:3001";
export const COMPANY = "1417901f-2a08-4fd0-a264-29f47ce371cb";
export const SLUG = "raj267748-payfast-test";
export const ADMIN_ID = "0d8f0046-bf30-4466-9d6f-17c04076fedb";
export const TEST_EMAIL = "rajm267744@gmail.com";

let browser;
async function getBrowser() { browser ||= await chromium.launch(); return browser; }
export async function close() { if (browser) await browser.close(); }

/** API call as the test company admin (same session cookie the app uses). */
export async function asAdmin(method, path, data) {
  const ctx = await (await getBrowser()).newContext();
  await ctx.addCookies(JSON.parse(fs.readFileSync("tmp/email-e2e/.cookies.json", "utf8")));
  const res = await ctx.request.fetch(`${BASE}${path}`, { method, data });
  const text = await res.text();
  await ctx.close();
  return { status: res.status(), body: text.slice(0, 300) };
}

/** API call as the client, after opening their emailed order link. */
export async function asClient(orderId, method, path, data) {
  const { data: tok, error } = await sb.rpc("mint_client_order_token", { p_company_id: COMPANY, p_order_id: orderId, p_label: "email-e2e-test" });
  if (error) throw new Error("mint: " + error.message);
  const ctx = await (await getBrowser()).newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${SLUG}/c/order/${orderId}?t=${tok.raw_token}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(12000);
  const res = await page.request.fetch(`${BASE}${path}`, { method, data });
  const text = await res.text();
  await ctx.close();
  return { status: res.status(), body: text.slice(0, 300) };
}

/** Fresh confirmed order: quote copied from the E2E quote, accepted by the client. */
export async function newOrder(tag, opts = {}) {
  const q = await newQuote(tag, opts);
  const res = await fetch(`${BASE}/api/public/quotes/${q.public_token}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acceptedByName: "Raj Email Test" }) });
  const j = await res.json();
  const { data: o } = await sb.from("orders").select("id, order_number, status").eq("id", j.orderId).single();
  return { quote: q, order: o };
}

/** Fresh sent quote (not accepted). */
export async function newQuote(tag, { eventInDays = 21 } = {}) {
  const { data: src } = await sb.from("quotes").select("*").eq("id", "620cfd68-b049-4e60-95d4-91251fdf2664").single();
  const { data: client } = await sb.from("clients").select("id").eq("company_id", COMPANY).eq("email", TEST_EMAIL).single();
  const { id, quote_number, public_token, created_at, updated_at, lead_id, accepted_at, converted_to_order_id, sent_at, ...copy } = src;
  const ev = new Date(Date.now() + eventInDays * 864e5).toISOString().slice(0, 10);
  const { data: q, error } = await sb.from("quotes").insert({
    ...copy, quote_number: `QUO-TEST-${tag}-${Date.now().toString().slice(-5)}`, quote_name: `EMAIL TEST ${tag}`, event_type: `EMAIL TEST ${tag}`,
    client_id: client.id, client_name: "RAJ EMAIL TEST", contact_name: "RAJ EMAIL TEST", client_email: TEST_EMAIL, client_phone: "0826411373",
    event_date: ev, valid_until: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), venue_address: "TEST - no delivery",
    status: "sent", sent_at: new Date().toISOString(), public_token: crypto.randomUUID(), source: "email-e2e-test", prepared_by: ADMIN_ID, user_id: ADMIN_ID,
  }).select("id, quote_number, public_token").single();
  if (error) throw new Error("quote: " + error.message);
  return q;
}

/** Emails logged for the test company since an ISO time. */
export async function emailsSince(since) {
  const { data } = await sb.from("email_automation_log").select("created_at, status, recipient_email, subject, error_message")
    .eq("user_id", COMPANY).gte("created_at", since).order("created_at");
  return (data || []).filter((r) => !/booking confirmed/i.test(r.subject || "") || r.status === "sent");
}

export async function setAutomatic(on) {
  const { data: row } = await sb.from("email_provider_settings").select("id, automation_preferences").eq("company_id", COMPANY).neq("provider", "mailchimp").single();
  await sb.from("email_provider_settings").update({ automation_preferences: { ...(row.automation_preferences || {}), queue_delivery_mode: on ? "automatic" : "off" }, updated_at: new Date().toISOString() }).eq("id", row.id);
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
