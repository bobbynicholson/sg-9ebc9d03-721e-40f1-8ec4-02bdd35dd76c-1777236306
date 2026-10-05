import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const readEnv = file => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));
const env=readEnv('.env.local');
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const company='0e139a19-6526-4e1f-9bf7-87d6adbee5f8';
const queries=[
 ['company',sb.from('companies').select('id,company_name,slug,email').eq('id',company)],
 ['provider',sb.from('email_provider_settings').select('id,provider,from_email,from_name,is_verified,resend_domain_id,resend_sending_domain,resend_domain_status,force_platform_sender,smtp_host,smtp_port,updated_at').eq('company_id',company)],
 ['email_log',sb.from('email_automation_log').select('id,user_id,template_type,recipient_email,status,error_message,subject,created_at,sent_at').eq('user_id',company).order('created_at',{ascending:false}).limit(10)],
 ['delivery_events',sb.from('email_delivery_events').select('event_at,event_type,to_email,reason,raw_payload').eq('company_id',company).order('created_at',{ascending:false}).limit(10)],
 ['queue',sb.from('outgoing_email_queue').select('id,status,to_email,subject,error_message,attempts,created_at').eq('company_id',company).order('created_at',{ascending:false}).limit(10)],
 ['quotes',sb.from('quotes').select('id,quote_number,status,client_name,client_email,event_date,guest_count,sent_at,created_at').eq('company_id',company).order('created_at',{ascending:false}).limit(8)],
];
const results=await Promise.all(queries.map(async ([name,q])=>{const {data,error}=await q; return {name,data,error};}));
for(const result of results){
 if(result.name==='delivery_events')result.data=result.data?.map(r=>({...r,raw_payload:{from:r.raw_payload?.data?.from,subject:r.raw_payload?.data?.subject}}));
 console.log(JSON.stringify(result));
}
const providers=results.find(r=>r.name==='provider')?.data||[];
const preview=readEnv('.env.vercel.preview');
if(preview.RESEND_API_KEY){
 for(const p of providers.filter(p=>p.resend_domain_id)){
  const key=preview.RESEND_API_KEY.replace(/\\n$/,'').trim();
  const res=await fetch('https://api.resend.com/domains/'+encodeURIComponent(p.resend_domain_id),{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
  console.log(JSON.stringify({name:'resend_domain',http_status:res.status,data:await res.json()}));
 }
}
