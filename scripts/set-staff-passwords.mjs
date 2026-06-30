import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const PW=process.argv[2]||"CateringMS123!";
const WANT=["kitchen@spitbraaidelivery.co.za","shopping@spitbraaidelivery.co.za","driver@spitbraaidelivery.co.za","cleaning@spitbraaidelivery.co.za"];
const { data: company, error: companyErr } = await sb.from("companies").select("id").eq("slug","spit-braai-delivery").maybeSingle();
if (companyErr || !company?.id) {
  console.error("FAIL company lookup", companyErr?.message || "not found");
  process.exit(1);
}
const { data: profs } = await sb.from("profiles").select("id,role,email").eq("company_id",company.id).in("email",WANT);
for(const p of profs||[]){
  const { error } = await sb.auth.admin.updateUserById(p.id, { password: PW, email_confirm: true });
  console.log(`${error?"FAIL":"OK  "} ${p.role.padEnd(14)} ${p.email}  ${error?error.message:""}`);
}
