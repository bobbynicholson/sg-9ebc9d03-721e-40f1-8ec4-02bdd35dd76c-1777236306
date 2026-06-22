import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const EMAIL = "cleaning@spitbraaidelivery.co.za";
const COMPANY = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";

// Resolve the tenant slug so the redirect lands inside the company portal.
const { data: company } = await sb.from("companies").select("slug, company_name").eq("id", COMPANY).maybeSingle();
const slug = company?.slug || "";
const base = "https://cateringms.com";
const redirectTo = slug ? `${base}/${slug}/auth/callback` : `${base}/auth/callback`;

const { data, error } = await sb.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
  options: { redirectTo },
});
if (error) { console.log("ERR:", error.message); process.exit(1); }
console.log("Cleaner:", EMAIL, "(", company?.company_name, ")");
console.log("Redirect:", redirectTo);
console.log("\n=== PASTE THIS URL INTO YOUR BROWSER (one-time login, no password) ===\n");
console.log(data.properties.action_link);
console.log("\nAfter login, go to:", `${base}/team-portal/cleaning`);
