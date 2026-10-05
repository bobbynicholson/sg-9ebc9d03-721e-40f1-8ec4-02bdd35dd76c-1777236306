const fs=require('fs');const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const i=l.indexOf('=');if(i>0&&!l.trim().startsWith('#'))env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'');}
const {createClient}=require('@supabase/supabase-js');const c=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
(async()=>{const {data:p}=await c.from('profiles').select('id,role,active_role').eq('email','cleaning.manager.demo@spitbraaidelivery.co.za').single();
console.log('profile role:',p?.role,'| active_role:',p?.active_role);
const {data:r}=await c.from('user_roles').select('department,is_primary').eq('user_id',p.id);console.log('assigned roles:',JSON.stringify(r));})();
