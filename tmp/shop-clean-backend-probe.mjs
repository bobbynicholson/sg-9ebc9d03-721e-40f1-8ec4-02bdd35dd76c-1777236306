import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = { ...process.env };
for (const line of readFileSync('.env.local','utf8').split(/\r?\n/)) {
 const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/); if(m) env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');
}
const opts = {auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}};
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,opts);
const results=[];
for (const [role,email] of [['shopping_staff','shopping@spitbraaidelivery.co.za'],['cleaning_staff','cleaning@spitbraaidelivery.co.za'],['company_admin','hello@spitbraaidelivery.co.za']]) {
 const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);
 const {data:link,error:le}=await admin.auth.admin.generateLink({type:'magiclink',email});
 if(le) { results.push({role,error:le.message});continue; }
 const {data:auth,error:ae}=await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'});
 if(ae) {results.push({role,error:ae.message});continue;}
 const {data:profile,error:pe}=await client.from('profiles').select('company_id,role,active_role').eq('id',auth.user.id).single();
 if(pe){results.push({role,error:pe.message});continue;}
 const record={role,actualRole:profile.active_role||profile.role,checks:[]};
 const queries=[
 ['shopping settings',client.from('company_shopping_settings').select('*').eq('company_id',profile.company_id)],
 ['cleaning settings',client.from('companies').select('cleaning_settings').eq('id',profile.company_id)],
 ['draft reorder item columns',client.from('shopping_list_items').select('inventory_item_id,item_name,quantity,unit,supplier_id,status').limit(0)],
 ['canonical shopper item columns',client.from('shopping_list_items').select('item_id,name,quantity,unit,purchased').limit(0)],
 ];
 for(const [name,q] of queries){const {data,error,status}=await q;record.checks.push({name,status,rows:data?.length,error:error?{code:error.code,message:error.message}:null,...(name.endsWith('settings')?{settings:data?.map(({company_id,updated_by_user_id,...safe})=>safe)}:{})});}
 results.push(record);console.log(JSON.stringify(record));
}
writeFileSync('tmp/shop-clean-backend-probe.json',JSON.stringify(results,null,2));
