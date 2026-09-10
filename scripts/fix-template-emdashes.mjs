// Replace em-dash / en-dash / double-hyphen with a single hyphen in the
// GLOBAL (company_id IS NULL) email_templates rows so outgoing subjects
// and bodies stop shipping em-dashes to clients. Tenant-customized rows
// are left untouched (0 affected per probe). Pure DML, service role.
//   node scripts/fix-template-emdashes.mjs           (dry run)
//   node scripts/fix-template-emdashes.mjs --apply    (write)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const APPLY = process.argv.includes("--apply");

function clean(s) {
  if (!s) return s;
  return s
    .replace(/—/g, "-")   // em dash
    .replace(/–/g, "-")   // en dash
    .replace(/ ?-- ?/g, " - ") // spaced/unspaced double hyphen -> spaced single
    .replace(/ {2,}/g, " ");   // collapse any doubled space we introduced
}

const { data } = await sb.from("email_templates").select("id, template_type, subject, body").is("company_id", null);
let changed = 0;
for (const r of (data||[])) {
  const ns = clean(r.subject), nb = clean(r.body);
  if (ns === r.subject && nb === r.body) continue;
  changed++;
  console.log(`\n[${r.template_type}]`);
  if (ns !== r.subject) console.log(`  subj: "${r.subject}"\n     -> "${ns}"`);
  if (nb !== r.body) console.log(`  body changed (${(r.body||"").length} -> ${nb.length} chars)`);
  if (APPLY) {
    const { error } = await sb.from("email_templates").update({ subject: ns, body: nb }).eq("id", r.id);
    if (error) console.log("  UPDATE FAILED:", error.message);
    else console.log("  UPDATED");
  }
}
console.log(`\n${changed} global rows ${APPLY ? "updated" : "would change (dry run; pass --apply)"}.`);
