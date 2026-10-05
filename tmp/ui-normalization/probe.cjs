const fs=require('fs');const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const i=l.indexOf('=');if(i>0&&!l.trim().startsWith('#'))env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'');}
const {createClient}=require('@supabase/supabase-js');const c=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const checks={equipment_damages:['total_cost','repair_cost','damage_stage','quantity_damaged','quantity','damage_type','handover_id']};
(async()=>{for(const [t,cols] of Object.entries(checks)){for(const col of cols){const r=await c.from(t).select(col).limit(1);console.log(t+'.'+col, r.error?'MISSING':'exists');}}})();
