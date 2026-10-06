const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const {createClient} = require('@supabase/supabase-js');
const {execFileSync} = require('node:child_process');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
function load(source){
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 const localRequire=(id)=>{
  if(id==='@/lib/localFormat')return{formatLocalDate:()=>''};
  if(id==='@/lib/platformBilling')return{PLATFORM_TRIAL_DAYS:14};
  if(id==='@/lib/payfastTestPlan')return{PAYFAST_TEST_PLAN_AMOUNT_ZAR:5};
  return require(id);
 };
 vm.runInNewContext(code,{module,exports:module.exports,require:localRequire,process,URLSearchParams,fetch,AbortSignal,console},{filename:'payfast-probe.ts'});
 return module.exports;
}
async function get(table,columns,id){const {data,error}=await sb.from(table).select(columns).eq('id',id).single();if(error)throw error;return data;}
(async()=>{
 const attempt=await get('payment_attempts','id,invoice_id,amount,metadata','ce271c46-7acb-4e35-bc53-661532ee512f');
 const version=await get('payment_gateway_credential_versions','credentials,is_test',attempt.metadata.gatewayVersionId);
 const invoice=await get('invoices','id,public_token,order_id,client_id',attempt.invoice_id);
 const order=await get('orders','id,order_number,client_name,client_email',invoice.order_id);
 const client=await get('clients','client_name,email',invoice.client_id);
 const buyerName=client.client_name||order.client_name||'';
 const base='https://cateringms.com';
 const input={...version.credentials,passphrase:version.credentials.passphrase||'',testMode:version.is_test,amount:Number(attempt.amount),itemName:`Order ${order.order_number} - Deposit payment`,returnUrl:`${base}/pay/i/${invoice.public_token}/success?payment_attempt_id=${attempt.id}`,cancelUrl:`${base}/pay/i/${invoice.public_token}?cancelled=1&payment_attempt_id=${attempt.id}`,notifyUrl:`${base}/api/webhooks/payment-confirmation`,nameFirst:buyerName.split(' ')[0]||'Customer',nameLast:buyerName.split(' ').slice(1).join(' '),emailAddress:client.email||order.client_email||'',merchantPaymentId:attempt.id,customStr1:order.id,customStr2:'deposit',customStr3:'0e139a19-6526-4e1f-9bf7-87d6adbee5f8',customStr4:invoice.id,customStr5:attempt.id};
 console.log(JSON.stringify({credential_format:{merchant_id_digits:/^\d+$/.test(input.merchantId),merchant_id_has_surrounding_space:input.merchantId!==input.merchantId.trim(),merchant_key_has_surrounding_space:input.merchantKey!==input.merchantKey.trim(),passphrase_has_surrounding_space:input.passphrase!==input.passphrase.trim()}}));
 const currentSource=fs.readFileSync('src/lib/payfastService.ts','utf8');
 const sources=process.argv.includes('--fixed')?[['fixed',currentSource]]:process.argv.includes('--buyer-fields')?['names','email','other-email','full-other-email','full-no-buyer'].map(label=>[label,currentSource]):process.argv.includes('--groups')?['base','callbacks','buyer','tracking'].map(label=>[label,currentSource]):process.argv.includes('--minimal')?[['minimal',currentSource]]:[['current',currentSource]];
 if(process.argv.includes('--compare'))sources.push(['before-540904b4',execFileSync('git',['show','540904b4^:src/lib/payfastService.ts'],{encoding:'utf8',maxBuffer:1000000})]);
 await Promise.all(sources.map(async([label,source])=>{
  const api=load(source);
  let html;
  if(['minimal','base','callbacks','buyer','tracking','names','email','other-email','full-other-email','full-no-buyer'].includes(label)){
   const service=new api.PayFastService({merchantId:input.merchantId,merchantKey:input.merchantKey,passphrase:input.passphrase,testMode:input.testMode});
   const params={merchant_id:input.merchantId,merchant_key:input.merchantKey,amount:Number(input.amount).toFixed(2),item_name:label==='minimal'?'Checkout diagnostic':input.itemName};
   if(label==='callbacks')Object.assign(params,{return_url:input.returnUrl,cancel_url:input.cancelUrl,notify_url:input.notifyUrl});
   if(label==='buyer')Object.assign(params,{name_first:input.nameFirst,name_last:input.nameLast,email_address:input.emailAddress});
   if(label==='names')Object.assign(params,{name_first:input.nameFirst,name_last:input.nameLast});
   if(label==='email')Object.assign(params,{email_address:input.emailAddress});
   if(label==='other-email')Object.assign(params,{email_address:'checkout-probe@example.com'});
   if(['full-other-email','full-no-buyer'].includes(label))Object.assign(params,{return_url:input.returnUrl,cancel_url:input.cancelUrl,notify_url:input.notifyUrl,m_payment_id:input.merchantPaymentId,custom_str1:input.customStr1,custom_str2:input.customStr2,custom_str3:input.customStr3,custom_str4:input.customStr4,custom_str5:input.customStr5});
   if(label==='full-other-email')Object.assign(params,{name_first:input.nameFirst,name_last:input.nameLast,email_address:'checkout-probe@example.com'});
   if(label==='tracking')Object.assign(params,{m_payment_id:input.merchantPaymentId,custom_str1:input.customStr1,custom_str2:input.customStr2,custom_str3:input.customStr3,custom_str4:input.customStr4,custom_str5:input.customStr5});
   html=service.generatePaymentForm({...params,signature:service.generateSignature(params)});
  }else html=api.generatePayFastPaymentForm(label==='fixed'?{...input,emailAddress:undefined}:input);
  const action=html.match(/action="([^"]+)"/)[1];
  const fields=[...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(m=>[m[1],m[2].replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<')]);
  const r=await fetch(action,{method:'POST',body:new URLSearchParams(fields),redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded','Origin':base,'Referer':base+'/','User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(25000)});
  let body=(await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  for(const secret of [version.credentials.merchantId,version.credentials.merchantKey,version.credentials.passphrase,invoice.public_token,client.email,order.client_email,attempt.id].filter(Boolean))body=body.split(secret).join('[redacted]');
  console.log(JSON.stringify({variant:label,provider_status:r.status,provider_host:new URL(action).hostname,redirect_host:r.headers.get('location')?new URL(r.headers.get('location'),action).hostname:null,body_preview:r.status>=400?body.slice(0,1000):undefined}));
 }));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
