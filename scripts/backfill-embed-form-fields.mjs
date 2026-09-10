import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

// New quote-ready default field sets, mirroring src/lib/embed/templateCatalog.ts.
const contact = [
  { id:"name",  type:"text",  label:"Your name",        required:true,  visible:true, order:1, mapsTo:"name" },
  { id:"email", type:"email", label:"Email address",    required:true,  visible:true, order:2, mapsTo:"email" },
  { id:"phone", type:"phone", label:"Phone / WhatsApp", required:true,  visible:true, order:3, mapsTo:"phone" },
];
const eventType = { id:"event_type", type:"select", label:"Type of event", required:true, visible:true, order:4, mapsTo:"event_name",
  options:[
    {value:"wedding",label:"Wedding"},
    {value:"corporate",label:"Corporate / work function"},
    {value:"birthday",label:"Birthday / private party"},
    {value:"year_end",label:"Year-end function"},
    {value:"funeral",label:"Funeral / memorial"},
    {value:"other",label:"Other"},
  ] };
const eventBasics = [
  { id:"event_date",  type:"date",   label:"Event date",       required:true,  visible:true, order:5, mapsTo:"event_date" },
  { id:"guest_count", type:"number", label:"Number of guests", required:true,  visible:true, order:6, mapsTo:"guest_count", validation:{min:1,max:10000} },
  { id:"venue",       type:"text",   label:"Venue / area",     required:false, visible:true, order:7, mapsTo:"venue" },
];
const budget  = { id:"budget",  type:"number",   label:"Approximate budget (R)", required:false, visible:true, order:8, mapsTo:"budget" };
const dietary = { id:"dietary", type:"textarea", label:"Dietary requirements / allergies", required:false, visible:true, order:9, mapsTo:"dietary" };
const notes   = { id:"notes",   type:"textarea", label:"Anything else we should know?", required:false, visible:true, order:99, mapsTo:"notes" };

const NEW_DEFAULTS = {
  "quick-card":      [...contact, eventType, ...eventBasics, notes],
  "modern-inline":   [...contact, eventType, ...eventBasics, budget, dietary, notes],
  "floating-widget": [...contact, eventType, ...eventBasics, notes],
  "luxe-vertical":   [...contact, eventType, ...eventBasics, dietary, notes],
  "pricing-calculator": [...contact, eventType, ...eventBasics,
    { id:"tier", type:"select", label:"Menu tier", required:true, visible:true, order:8, options:[], helpText:"Tiers populated from your pricing setup." }, notes],
  "event-estimator": [...contact, eventType, ...eventBasics,
    { id:"tier", type:"select", label:"Menu tier", required:true, visible:true, order:8, options:[] }, notes],
};

// Old pristine default id-sets per template. We only refresh a form whose
// current field ids exactly match the OLD default (i.e. the tenant never
// customised it). This is safe + idempotent: a form already on the new
// set, or one the tenant edited, is left untouched.
const OLD_DEFAULT_IDS = {
  "quick-card":         ["name","email","phone","notes"],
  "modern-inline":      ["name","email","phone","event_date","guest_count","venue","notes"],
  "floating-widget":    ["name","email","phone","notes"],
  "luxe-vertical":      ["name","email","phone","event_type","event_date","guest_count","notes"],
  "pricing-calculator": ["name","email","phone","event_date","guest_count","venue","tier","notes"],
  "event-estimator":    ["name","email","phone","event_date","guest_count","venue","tier","notes"],
};

const sameSet = (a,b) => a.length===b.length && [...a].sort().join(",")===[...b].sort().join(",");

const { data: forms, error } = await sb
  .from("embed_form_configs")
  .select("id, name, slug, template_id, fields, deleted_at")
  .is("deleted_at", null);
if (error) { console.log("ERR", error.message); process.exit(1); }

let updated = 0, skipped = 0;
for (const f of forms || []) {
  const newDef = NEW_DEFAULTS[f.template_id];
  const oldIds = OLD_DEFAULT_IDS[f.template_id];
  const currentIds = (f.fields||[]).map(x=>x.id);
  if (!newDef || !oldIds) { console.log(`- SKIP "${f.name}" (${f.template_id}): no managed default`); skipped++; continue; }
  if (sameSet(currentIds, newDef.map(x=>x.id))) { console.log(`- OK   "${f.name}" (${f.template_id}): already on new set`); skipped++; continue; }
  if (!sameSet(currentIds, oldIds)) { console.log(`- SKIP "${f.name}" (${f.template_id}): customised (${currentIds.join(",")}), leaving as-is`); skipped++; continue; }
  const { error: upErr } = await sb.from("embed_form_configs").update({ fields: newDef }).eq("id", f.id);
  if (upErr) { console.log(`- FAIL "${f.name}": ${upErr.message}`); continue; }
  console.log(`- UPDATED "${f.name}" (${f.template_id}): ${currentIds.join(",")}  ->  ${newDef.map(x=>x.id).join(",")}`);
  updated++;
}
console.log(`\nDone. updated=${updated} skipped=${skipped}`);
process.exit(0);
