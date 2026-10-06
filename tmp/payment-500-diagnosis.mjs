import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const cid='0e139a19-6526-4e1f-9bf7-87d6adbee5f8';
const queries=[
 ['attempts',sb.from('payment_attempts').select('id,invoice_id,provider,status,provider_status,failure_reason,created_at,metadata').eq('company_id',cid).order('created_at',{ascending:false}).limit(8)],
 ['gateways',sb.from('payment_gateways').select('id,provider,is_active,is_test,updated_at').eq('company_id',cid)],
 ['invoices',sb.from('invoices').select('id,invoice_number,order_id,total_amount,balance_due,status,public_token,created_at').eq('company_id',cid).is('deleted_at',null).order('created_at',{ascending:false}).limit(5)],
];
const results=await Promise.all(queries.map(async([name,q])=>{const{data,error}=await q;return{name,data,error};}));
const {data:config,error:configError}=await sb.rpc('read_payment_gateway_configuration',{p_company_id:cid,p_gateway_id:null,p_include_deleted:false});
console.log(JSON.stringify({name:'active_gateway',error:configError,provider:config?.gateway?.provider,is_test:config?.gateway?.is_test,merchant_id_present:!!config?.credentials?.merchantId,merchant_key_present:!!config?.credentials?.merchantKey,passphrase_present:!!config?.credentials?.passphrase,shared_sandbox_merchant:config?.credentials?.merchantId==='10000100'}));
for(const r of results)console.log(JSON.stringify({...r,data:r.name==='invoices'?r.data?.map(({public_token,...safe})=>({...safe,has_pay_token:!!public_token})):r.name==='attempts'?r.data?.map(({metadata,...safe})=>({...safe,gateway_is_test:metadata?.gatewayIsTest,gateway_version_id:metadata?.gatewayVersionId})):r.data}));
for(const inv of results.find(r=>r.name==='invoices')?.data?.filter(r=>r.public_token).slice(0,2)||[]){
 for(const base of ['http://localhost:3001','https://cateringms.com']){
  try{
   const response=await fetch(base+'/api/public/invoices/'+encodeURIComponent(inv.public_token)+'/get',{signal:AbortSignal.timeout(20000)});
   const data=await response.json().catch(()=>({error:'Non-JSON response'}));
   console.log(JSON.stringify({base,invoice:inv.invoice_number,http_status:response.status,error:data.error,payment_options:data.invoice?.payment_options}));
  }catch(e){console.log(JSON.stringify({base,invoice:inv.invoice_number,error:e.message}));}
 }
}
