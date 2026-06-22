import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const AUTH_ID = "0262e82e-8a27-4030-a5b2-1682a508ff5a"; // cleaning@spitbraaidelivery.co.za (profiles.id = auth id)
const NEW_PW = "Cleaner@2026";

const { data, error } = await sb.auth.admin.updateUserById(AUTH_ID, {
  password: NEW_PW,
  email_confirm: true,
});
if (error) { console.log("ERR:", error.message); process.exit(1); }
console.log("OK - password set for", data.user.email);
console.log("Password:", NEW_PW);
