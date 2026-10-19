import { newOrder, emailsSince, sb, close, wait, COMPANY } from "./lib.mjs";
import { execFileSync } from "child_process";
import fs from "fs";
const since = new Date().toISOString();
const log = (...a) => console.log(...a);
const { data: row } = await sb.from("email_provider_settings").select("id, automation_preferences").eq("company_id", COMPANY).neq("provider", "mailchimp").single();
const prefs = { ...(row.automation_preferences || {}), queue_delivery_mode: "automatic", template_delivery_modes: { order_confirmed: "off" } };
await sb.from("email_provider_settings").update({ automation_preferences: prefs }).eq("id", row.id);
log("settings: everything Automatic except 'Order confirmed' = Off");
const s = await newOrder("ONE-OFF");
const today = new Date().toISOString().slice(0, 10);
await sb.from("orders").update({ status: "pending", event_date: today, event_end_date: today }).eq("id", s.order.id).eq("company_id", COMPANY);
fs.writeFileSync("tmp/email-e2e/S2.json", JSON.stringify({ order_id: s.order.id }));
await close();
for (const want of ["^Confirmed$", "^In Prep$"]) {
  execFileSync("node", ["tmp/email-e2e/status.mjs", "S2", want], { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  const { data } = await sb.from("orders").select("status").eq("id", s.order.id).single();
  log("  ->", want, "now:", data.status);
}
await wait(12000);
for (const e of await emailsSince(since)) log(e.created_at.slice(11, 19), e.status.padEnd(6), e.recipient_email.padEnd(22), e.subject);
// restore: everything Automatic, no per-email overrides
await sb.from("email_provider_settings").update({ automation_preferences: { ...prefs, template_delivery_modes: {} } }).eq("id", row.id);
log("settings restored: everything Automatic");
await close();
