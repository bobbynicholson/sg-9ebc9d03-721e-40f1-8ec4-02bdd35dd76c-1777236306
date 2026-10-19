import { sb, COMPANY, asAdmin, close, env } from "./lib.mjs";
const { data: p } = await sb.from("email_provider_settings").select("provider, automation_preferences").eq("company_id", COMPANY).neq("provider","mailchimp");
console.log("prefs:", JSON.stringify(p));
const { data: one } = await sb.from("email_automation_log").select("*").eq("user_id", COMPANY).order("created_at",{ascending:false}).limit(1);
console.log("log columns:", Object.keys(one?.[0] || {}).join(", "));
console.log("admin session:", JSON.stringify(await asAdmin("GET", "/api/payment-gateways")));
console.log("resend key present:", !!env.RESEND_API_KEY);
await close();
