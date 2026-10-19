import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CO = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
const emails = ["admin@spitbraaidelivery.co.za","hello@spitbraaidelivery.co.za","sbd.kitchen1@gmail.com","kitchen@spitbraaidelivery.co.za","kitchen.manager.demo@spitbraaidelivery.co.za","waiter.demo@spitbraaidelivery.co.za"];
const { data, error } = await sb.from("profiles").select("email, role, company_id").in("email", emails);
console.log(error?.message || "");
for (const e of emails) { const p = (data||[]).find(r => r.email === e); console.log(e.padEnd(46), p ? `profile role=${p.role} sameCompany=${p.company_id===CO}` : "NOT A PROFILE"); }
// How clients look, for contrast
const { count } = await sb.from("profiles").select("id",{count:"exact",head:true}).eq("company_id", CO).eq("role","client");
console.log("client-role profiles in company:", count);
