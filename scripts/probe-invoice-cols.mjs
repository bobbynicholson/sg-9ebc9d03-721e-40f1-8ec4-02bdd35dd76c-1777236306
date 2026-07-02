import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data: inv } = await sb.from("invoices").select("*").limit(1).maybeSingle();
console.log("invoices has client_email?", inv && "client_email" in inv, "| client_id?", inv && "client_id" in inv);
console.log("invoice keys:", inv ? Object.keys(inv).filter(k=>/client|email|company/.test(k)).join(", ") : "none");
const { data: prof } = await sb.from("profiles").select("*").limit(1).maybeSingle();
console.log("profiles has email?", prof && "email" in prof, "| active_role?", prof && "active_role" in prof);
