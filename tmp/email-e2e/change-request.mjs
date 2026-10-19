// Round C: client submits a change request from their emailed order link.
// Usage: node tmp/email-e2e/change-request.mjs C
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import fs from "fs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const COMPANY = "1417901f-2a08-4fd0-a264-29f47ce371cb";
const label = process.argv[2];
const st = JSON.parse(fs.readFileSync(`tmp/email-e2e/${label}.json`, "utf8"));

// Same RPC the app uses to put a sign-in link in the client's emails.
const { data, error } = await sb.rpc("mint_client_order_token", { p_company_id: COMPANY, p_order_id: st.order_id, p_label: "email-e2e-test" });
if (error) throw new Error("mint: " + error.message);
const link = `http://localhost:3001/raj267748-payfast-test/c/order/${st.order_id}?t=${data.raw_token}`;

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(link, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(15000);
const cookieNames = (await ctx.cookies()).map((c) => c.name).filter((n) => n.startsWith("cms_client"));
console.log("client link opened; client cookie set:", cookieNames.join(",") || "(none)");
const res = await page.request.post("http://localhost:3001/api/client-tokens/amend-order", { data: {
  order_id: st.order_id,
  proposed_changes: { guest_count: 35, special_instructions: "Please add a vegetarian option (email test)" },
  client_notes: "Email test: can we go to 35 guests?",
} });
console.log("change request:", res.status(), (await res.text()).slice(0, 200));
await browser.close();
