import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CO = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
const { data: qs } = await sb.from("quotes").select("quote_number,total,event_date,client_id,client_email,client_name,created_at").eq("company_id", CO).is("deleted_at", null).gte("created_at","2026-09-30T22:00:00Z").lte("created_at","2026-10-31T21:59:59Z");
const key = q => q.client_id ? "id:"+q.client_id : q.client_email ? "email:"+q.client_email.trim().toLowerCase() : q.client_name ? "name:"+q.client_name.trim().toLowerCase() : null;
const old = qs.reduce((s,q)=>s+Number(q.total||0),0);
const m = new Map(); let nw = 0;
for (const q of qs) { const c = key(q), d = String(q.event_date||"").slice(0,10), v = Number(q.total||0); if (!c||!d) { nw += v; continue; } const k = c+"|"+d; if (!m.has(k)) m.set(k, []); m.get(k).push(q); }
let groups = 0;
for (const [k, list] of m) { nw += Math.min(...list.map(q=>Number(q.total||0))); if (list.length > 1) { groups++; if (groups <= 6) console.log("  ", list[0].client_name, list[0].event_date, list.map(q=>`${q.quote_number} R${Number(q.total).toFixed(2)}`).join(" | ")); } }
console.log(`quotes this month: ${qs.length}`);
console.log(`old total: R${old.toFixed(2)}   new total: R${nw.toFixed(2)}   client/date groups with more than one quote: ${groups}`);
