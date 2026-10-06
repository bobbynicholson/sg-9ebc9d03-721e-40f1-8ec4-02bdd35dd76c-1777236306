import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const anon=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const {data:link,error}=await admin.auth.admin.generateLink({type:'magiclink',email:'hello@spitbraaidelivery.co.za'});
if(error)throw error;
const {data:verified,error:verifyErr}=await anon.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'});
if(verifyErr)throw verifyErr;
const storageKey='sb-'+new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]+'-auth-token';
const encoded='base64-'+Buffer.from(JSON.stringify(verified.session)).toString('base64url');
const chunks=encoded.match(/.{1,3180}/g);
const cookie=chunks.map((v,i)=>(chunks.length===1?storageKey:storageKey+'.'+i)+'='+v).join('; ');
for(const base of ['http://localhost:3001','https://cateringms.com']){
 try{
  const r=await fetch(base+'/api/admin/email-health',{headers:{Cookie:cookie},signal:AbortSignal.timeout(20000)});
  console.log(JSON.stringify({base,endpoint:'email-health',status:r.status,body:(await r.text()).slice(0,1000)}));
 }catch(e){console.log(JSON.stringify({base,error:e.message}));}
}
try{
 const r=await fetch('https://cateringms.com/api/admin/resend/dns-check',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({companyId:'0e139a19-6526-4e1f-9bf7-87d6adbee5f8'}),signal:AbortSignal.timeout(20000)});
 console.log(JSON.stringify({endpoint:'dns-check',status:r.status,body:(await r.text()).slice(0,6000)}));
}catch(e){console.log(JSON.stringify({endpoint:'dns-check',error:e.message}));}
const {data:provider,error:providerErr}=await admin.from('email_provider_settings').select('resend_domain_status,resend_domain_verified_at,from_email,force_platform_sender').eq('company_id','0e139a19-6526-4e1f-9bf7-87d6adbee5f8').eq('provider','resend').single();
if(providerErr)throw providerErr;
console.log(JSON.stringify({name:'sender_after',provider}));
if(provider.resend_domain_verified_at){
 try{
  const r=await fetch('https://cateringms.com/api/admin/resend/verify-domain',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({companyId:'0e139a19-6526-4e1f-9bf7-87d6adbee5f8'}),signal:AbortSignal.timeout(30000)});
  console.log(JSON.stringify({endpoint:'verify-domain',status:r.status,body:(await r.text()).slice(0,4500)}));
 }catch(e){console.log(JSON.stringify({endpoint:'verify-domain',error:e.message}));}
}
const {data,error:cronErr}=await admin.from('audit_logs').select('created_at,details').eq('action','cron.process-email-queue').order('created_at',{ascending:false}).limit(3);
console.log(JSON.stringify({name:'queue_heartbeat',data,error:cronErr}));
