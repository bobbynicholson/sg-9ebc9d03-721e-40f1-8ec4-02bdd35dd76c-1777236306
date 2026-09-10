/** Clear embed_rate_limits rows for a given quote's public_token so the
 * accept flow stops returning "Too many attempts" during testing. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const QUOTE_NUMBER = process.argv[2] || "QUO-000064";
const { data: q, error: qErr } = await sb.from("quotes").select("id, quote_number, public_token, status").eq("quote_number", QUOTE_NUMBER).maybeSingle();
if (qErr || !q) { console.error("quote lookup failed:", qErr || "not found"); process.exit(1); }
console.log("Quote:", q.quote_number, "status=", q.status, "token=", q.public_token);
const { data: del, error: dErr } = await sb.from("embed_rate_limits").delete().eq("embed_token", q.public_token).select("id");
if (dErr) { console.error("delete failed:", dErr); process.exit(1); }
console.log("Cleared", (del||[]).length, "rate-limit row(s) for", q.quote_number);
