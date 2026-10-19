// Switch the three flow emails Off for the TEST company, run the flow, restore.
import { sb, COMPANY } from "./lib.mjs";
import { execSync } from "child_process";
const { data: row } = await sb.from("email_provider_settings").select("id, automation_preferences").eq("company_id", COMPANY).neq("provider", "mailchimp").single();
const original = row.automation_preferences || {};
console.log("settings before:", JSON.stringify(original));
const off = { ...original, template_delivery_modes: { ...(original.template_delivery_modes || {}), deposit_invoice_issued: "off", deposit_payment_received: "off", balance_payment_received: "off" } };
await sb.from("email_provider_settings").update({ automation_preferences: off }).eq("id", row.id);
console.log("switched Off:", JSON.stringify(off.template_delivery_modes));
try {
  console.log(execSync("node tmp/email-e2e/flow-full.mjs", { encoding: "utf8", timeout: 20 * 60e3 }));
} finally {
  await sb.from("email_provider_settings").update({ automation_preferences: original }).eq("id", row.id);
  const { data: back } = await sb.from("email_provider_settings").select("automation_preferences").eq("id", row.id).single();
  console.log("settings restored:", JSON.stringify(back.automation_preferences));
}
