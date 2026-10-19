import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TEST = "1417901f-2a08-4fd0-a264-29f47ce371cb";
let rows = [], from = 0;
for (;;) { const { data } = await sb.from("email_automation_log").select("user_id,created_at,template_type,recipient_email,subject").eq("status","sent").gte("created_at","2026-09-16").neq("user_id",TEST).order("created_at").range(from, from+999); rows.push(...(data||[])); if (!data || data.length < 1000) break; from += 1000; }
const last = new Map(), dups = [];
for (const r of rows) {
  const k = `${r.user_id}|${String(r.recipient_email).toLowerCase()}|${String(r.subject).trim().toLowerCase()}`;
  const t = new Date(r.created_at).getTime(), p = last.get(k);
  if (p && t - p.t <= 60*60e3) dups.push({ gapMin: ((t - p.t)/60e3).toFixed(1), type: r.template_type, prevType: p.type, at: r.created_at.slice(0,16), to: r.recipient_email, subject: r.subject });
  last.set(k, { t, type: r.template_type });
}
console.log(`sent emails checked: ${rows.length}, same email to same person again within 60 min: ${dups.length}`);
const byType = {}; for (const d of dups) { const k = `${d.prevType} -> ${d.type}`; byType[k] = (byType[k]||0)+1; }
console.log("by email type:", JSON.stringify(byType, null, 1));
const gaps = { "<1 min":0, "1-10 min":0, "10-60 min":0 }; for (const d of dups) { const g = +d.gapMin; gaps[g<1?"<1 min":g<10?"1-10 min":"10-60 min"]++; }
console.log("gaps:", JSON.stringify(gaps));
for (const d of dups.slice(-15)) console.log(`  ${d.at} +${d.gapMin}m ${String(d.type).padEnd(24)} ${d.to.padEnd(32)} ${d.subject.slice(0,60)}`);
