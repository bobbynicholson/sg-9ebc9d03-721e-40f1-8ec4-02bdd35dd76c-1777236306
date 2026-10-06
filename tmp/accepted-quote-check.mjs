import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const company='0e139a19-6526-4e1f-9bf7-87d6adbee5f8';
const {data:quotes,error}=await sb.from('quotes').select('id,quote_number,status,client_id,lead_id,client_name,client_email,converted_to_order_id,guest_count,venue_address,accepted_at').eq('company_id',company).order('created_at',{ascending:false}).limit(4);
console.log(JSON.stringify({quotes,error}));
const ids=quotes?.map(q=>q.client_id).filter(Boolean)||[];
const orderIds=quotes?.map(q=>q.converted_to_order_id).filter(Boolean)||[];
for(const [name,q] of [
 ['clients',sb.from('clients').select('id,name,email').in('id',ids)],
 ['orders',sb.from('orders').select('id,order_number,client_id,client_name,client_email,quote_id').in('id',orderIds)],
 ['invoices',sb.from('invoices').select('id,invoice_number,order_id,client_id,status,sent_at,created_at').in('order_id',orderIds).is('deleted_at',null)],
]){const{data,error}=await q;console.log(JSON.stringify({name,data,error}));}
