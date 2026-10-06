import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data:providers,error:pErr}=await sb.from('email_provider_settings').select('company_id,provider,resend_domain_status,force_platform_sender').eq('provider','resend');
if(pErr)throw pErr;
console.log(JSON.stringify({providers}));
const {data:queue,error:qErr}=await sb.from('outgoing_email_queue').select('status,trigger_event,template_type').limit(1000);
if(qErr)throw qErr;
const counts={};for(const r of queue){const k=[r.status,r.trigger_event,r.template_type].join('/');counts[k]=(counts[k]||0)+1;}
console.log(JSON.stringify({queue_counts:counts}));
