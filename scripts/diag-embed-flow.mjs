import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const HOST = process.env.EMBED_HOST || "https://cateringms.com";

console.log("=== 1. Companies + embed_token state ===");
const { data: companies, error: cErr } = await sb
  .from("companies")
  .select("id, company_name, slug, is_active, deleted_at, embed_token")
  .is("deleted_at", null);
if (cErr) { console.log("ERR companies:", cErr.message); }
for (const c of companies || []) {
  console.log(`- ${c.company_name} (slug=${c.slug}) active=${c.is_active} embed_token=${c.embed_token || "** MISSING **"}`);
}

console.log("\n=== 2. embed_form_configs ===");
const { data: forms, error: fErr } = await sb
  .from("embed_form_configs")
  .select("id, company_id, name, slug, template_id, is_active, deleted_at, views_count, submissions_count, region_id, fields")
  .order("created_at", { ascending: true });
if (fErr) { console.log("ERR embed_form_configs:", fErr.message); }
console.log(`Total forms: ${(forms||[]).length}`);
for (const f of forms || []) {
  const fieldList = (f.fields||[]).map(x=>`${x.id}(${x.mapsTo||"-"})`).join(", ");
  const hasEmail = (f.fields||[]).some(x=> x.mapsTo==="email" || x.type==="email");
  console.log(`- "${f.name}" slug=${f.slug} tpl=${f.template_id} active=${f.is_active} del=${!!f.deleted_at} region=${f.region_id||"none"} views=${f.views_count} subs=${f.submissions_count}`);
  console.log(`    fields: ${fieldList}`);
  if (!hasEmail) console.log(`    !! NO EMAIL FIELD -> every submission will be rejected (400 email required)`);
}

console.log("\n=== 3. Regions per company (leads.region_id is NOT NULL) ===");
for (const c of companies || []) {
  const { data: regions } = await sb.from("regions").select("id, name, is_active").eq("company_id", c.id);
  const active = (regions||[]).filter(r=>r.is_active);
  console.log(`- ${c.company_name}: ${active.length} active region(s)${active.length===0?"  !! NO ACTIVE REGION -> submit 503":""}`);
}

// Pick a company that has both a token and at least one active form to live-test
const testCompany = (companies||[]).find(c => c.embed_token && c.is_active && (forms||[]).some(f=>f.company_id===c.id && f.is_active && !f.deleted_at));
console.log("\n=== 4. Live endpoint test ===");
if (!testCompany) {
  console.log("No company with embed_token + active form found; skipping live test.");
} else {
  const form = (forms||[]).find(f=>f.company_id===testCompany.id && f.is_active && !f.deleted_at);
  const token = testCompany.embed_token;
  console.log(`Testing ${HOST} with company="${testCompany.company_name}" token=${token} slug=${form.slug}`);

  // 4a config
  try {
    const cfgUrl = `${HOST}/api/public/embed/${token}/config?slug=${encodeURIComponent(form.slug)}`;
    const r = await fetch(cfgUrl);
    const j = await r.json().catch(()=>null);
    console.log(`  config -> ${r.status} ok=${j?.ok} fields=${(j?.fields||[]).length} template=${j?.templateId}`);
  } catch(e){ console.log("  config FETCH ERR", String(e)); }

  // 4b loader.js reachable
  try {
    const r = await fetch(`${HOST}/embed/loader.js`);
    console.log(`  loader.js -> ${r.status} (${r.headers.get("content-type")})`);
  } catch(e){ console.log("  loader FETCH ERR", String(e)); }

  // 4c template js reachable
  try {
    const r = await fetch(`${HOST}/embed/templates/${form.template_id}.js`);
    console.log(`  templates/${form.template_id}.js -> ${r.status}`);
  } catch(e){ console.log("  template FETCH ERR", String(e)); }

  // 4d submit a test lead
  const payload = {};
  for (const fld of (form.fields||[])) {
    if (fld.mapsTo==="email" || fld.type==="email") payload[fld.id] = "diag-test@example.com";
    else if (fld.mapsTo==="name") payload[fld.id] = "DIAG TEST LEAD";
    else if (fld.type==="phone"||fld.mapsTo==="phone") payload[fld.id] = "0820000000";
    else if (fld.type==="date") payload[fld.id] = "2026-09-01";
    else if (fld.type==="number") payload[fld.id] = 50;
    else if (fld.type==="select") payload[fld.id] = (fld.options&&fld.options[0]?.value) || "other";
    else if (fld.required) payload[fld.id] = "diag";
  }
  console.log("  submit payload:", JSON.stringify(payload));
  try {
    const r = await fetch(`${HOST}/api/public/embed/${token}/submit`, {
      method:"POST", headers:{"content-type":"application/json"},
      body: JSON.stringify({ formSlug: form.slug, payload, turnstileToken:"", honeypot:"", referrer:"diag-script" })
    });
    const j = await r.json().catch(()=>null);
    console.log(`  submit -> ${r.status}`, JSON.stringify(j));
    if (j?.leadId) {
      const { data: lead } = await sb.from("leads").select("id, contact_name, email, status, source, region_id, guest_count, event_date").eq("id", j.leadId).single();
      console.log("  lead row:", JSON.stringify(lead));
      // cleanup the diag lead
      await sb.from("embed_form_submissions").delete().eq("lead_id", j.leadId);
      await sb.from("leads").delete().eq("id", j.leadId);
      console.log("  (diag lead cleaned up)");
    }
  } catch(e){ console.log("  submit FETCH ERR", String(e)); }
}
console.log("\n=== done ===");
process.exit(0);
