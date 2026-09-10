import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync("E:/Catering/sg-9ebc9d03-721e-40f1-8ec4-02bdd35dd76c-1777236306/.env.local", "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: co } = await db.from("companies").select("id,slug").eq("slug", "spit-braai-delivery").single();
const { data: profs, error } = await db.from("profiles").select("id,email,role,active_role,full_name").eq("company_id", co.id).order("role");
if (error) console.error(error);
for (const p of profs || []) console.log(`${(p.role || "?").padEnd(16)} ${(p.active_role || "").padEnd(16)} ${p.email}  ${p.full_name || ""}`);
const { data: supers } = await db.from("profiles").select("id,email,role,full_name").eq("role", "super_admin").limit(5);
console.log("--- super admins ---");
for (const p of supers || []) console.log(`${p.role.padEnd(16)} ${p.email}  ${p.full_name || ""}`);
