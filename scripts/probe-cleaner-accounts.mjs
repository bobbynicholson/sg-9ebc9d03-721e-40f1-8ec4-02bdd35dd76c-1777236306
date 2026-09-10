import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const COMPANY = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";

const { data: profs, error } = await sb.from("profiles")
  .select("id, email, full_name, role, company_id")
  .eq("company_id", COMPANY)
  .order("role");
if (error) { console.log("ERR profiles:", error.message); process.exit(0); }
console.log("PROFILES in company:", profs.length);
for (const p of profs) console.log(`  ${(p.role||"?").padEnd(16)} ${p.email||"-"}  (${p.full_name||"-"})`);

console.log("\nCLEANERS:");
const cleaners = profs.filter(p => p.role === "cleaning_staff");
if (!cleaners.length) console.log("  (none with role=cleaning_staff)");
for (const c of cleaners) console.log(`  email=${c.email}  name=${c.full_name||"-"}  id=${c.id}`);
