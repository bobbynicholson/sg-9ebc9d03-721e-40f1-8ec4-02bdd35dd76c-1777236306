/** Consolidate duplicate open kitchen_shortfall shopping lists into one
 * (keep the newest, move/dedupe items, delete the empties). */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const CO="0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
const { data: lists } = await sb.from("shopping_lists").select("id,created_at").eq("company_id",CO).eq("status","open").eq("source","kitchen_shortfall").order("created_at",{ascending:false});
if(!lists||lists.length<=1){ console.log("nothing to merge:", lists?.length||0); process.exit(0); }
const keeper = lists[0].id; const others = lists.slice(1).map(l=>l.id);
console.log("keeper:", keeper.slice(0,8), "merging:", others.map(o=>o.slice(0,8)).join(","));
// existing keys on keeper
const { data: keepItems } = await sb.from("shopping_list_items").select("item_id,name").eq("shopping_list_id",keeper).is("removed_at",null);
const ids=new Set((keepItems||[]).map(r=>r.item_id).filter(Boolean));
const names=new Set((keepItems||[]).map(r=>String(r.name||"").trim().toLowerCase()));
for(const o of others){
  const { data: its } = await sb.from("shopping_list_items").select("*").eq("shopping_list_id",o).is("removed_at",null);
  for(const it of its||[]){
    const dup = it.item_id ? ids.has(it.item_id) : names.has(String(it.name||"").trim().toLowerCase());
    if(!dup){
      const {error}=await sb.from("shopping_list_items").update({shopping_list_id:keeper}).eq("id",it.id);
      if(!error){ if(it.item_id)ids.add(it.item_id); names.add(String(it.name||"").trim().toLowerCase()); }
    } else {
      await sb.from("shopping_list_items").delete().eq("id",it.id);
    }
  }
  // delete any remaining items + the list
  await sb.from("shopping_list_items").delete().eq("shopping_list_id",o);
  await sb.from("shopping_lists").delete().eq("id",o);
}
const { data: finalItems } = await sb.from("shopping_list_items").select("name").eq("shopping_list_id",keeper).is("removed_at",null);
console.log("DONE. keeper now has items:", (finalItems||[]).map(i=>i.name).join(", "));
