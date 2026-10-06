import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const invoiceId=process.argv.find(a=>/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(a))||'e3fc18de-6e5d-487d-9d0c-42eb9291ed3e';
const {data:invoice,error}=await sb.from('invoices').select('id,public_token,invoice_number').eq('id',invoiceId).single();
if(error)throw error;
const response=await fetch('https://cateringms.com/api/payments/create-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invoice_id:invoice.id,public_token:invoice.public_token,checkout_request_id:randomUUID()}),signal:AbortSignal.timeout(25000)});
const data=await response.json().catch(()=>({error:'Non-JSON response'}));
console.log(JSON.stringify({invoice:invoice.invoice_number,status:response.status,ok:data.ok,error:data.error,provider:data.provider,sessionId:data.sessionId,chargedAmount:data.chargedAmount}));
if(data.isHtmlForm&&data.paymentUrl){
 const fields=[...data.paymentUrl.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(m=>[m[1],m[2].replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<')]);
 console.log(JSON.stringify({action:data.paymentUrl.match(/action="([^"]+)"/)?.[1],field_order:fields.map(r=>r[0]),fields:fields.filter(([k])=>!['merchant_id','merchant_key','signature','return_url','cancel_url','notify_url','email_address','custom_str1','custom_str3','custom_str4','custom_str5','m_payment_id'].includes(k))}));
 const {data:config,error:configErr}=await sb.rpc('read_payment_gateway_configuration',{p_company_id:'0e139a19-6526-4e1f-9bf7-87d6adbee5f8',p_gateway_id:null,p_include_deleted:false});
 if(configErr)throw configErr;
 const {createHash}=await import('node:crypto');
 const encode=value=>encodeURIComponent(value.trim()).replace(/%20/g,'+').replace(/[!'()*~]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 const source=fields.filter(([k,v])=>k!=='signature'&&v.trim()!=='').map(([k,v])=>k+'='+encode(v)).join('&')+(config.credentials.passphrase?'&passphrase='+encode(config.credentials.passphrase):'');
 console.log(JSON.stringify({posted_signature_matches_saved_configuration:createHash('md5').update(source).digest('hex')===fields.find(([k])=>k==='signature')?.[1]}));
 if(process.argv.includes('--submit')){
  const action=data.paymentUrl.match(/action="([^"]+)"/)[1];
  const provider=await fetch(action,{method:'POST',body:new URLSearchParams(fields),redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded','Origin':'https://cateringms.com','User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(25000)});
  console.log(JSON.stringify({provider_status:provider.status,buyer_email_prefilled:fields.some(([k])=>k==='email_address'),redirect_host:provider.headers.get('location')?new URL(provider.headers.get('location'),action).hostname:null,payment_completed:false}));
 }
}
