const fs=require('fs');const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const i=l.indexOf('=');if(i>0&&!l.trim().startsWith('#'))env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'');}
const {createClient}=require('@supabase/supabase-js');const c=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
(async()=>{const r=await c.from('cleaning_event_handovers').select('id,status').is('deleted_at',null).order('created_at',{ascending:false}).limit(1);console.log(r.data?.[0]?.id||'none');})();
