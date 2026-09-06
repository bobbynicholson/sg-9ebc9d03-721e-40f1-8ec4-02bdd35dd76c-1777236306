"use strict";(()=>{var e={};e.id=36702,e.ids=[10157,32538,36702,44443,50472,54919,77300],e.modules={8667:(e,r)=>{Object.defineProperty(r,"A",{enumerable:!0,get:function(){return t}});var t=function(e){return e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE",e.IMAGE="IMAGE",e}({})},23405:e=>{e.exports=require("@supabase/ssr")},29021:e=>{e.exports=require("fs")},33480:(e,r,t)=>{e.exports=t(75600)},33873:e=>{e.exports=require("path")},47026:(e,r,t)=>{t.a(e,async(e,i)=>{try{t.r(r),t.d(r,{getRequestSupabase:()=>s,getServiceSupabase:()=>o});var a=t(93721),n=e([a]);a=(n.then?(await n)():n)[0];let d=null,l=!1,c=null;function o(){if(d)return d;let e="https://vsuyzovzqtrngorpqnhy.supabase.co",r=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SECRET_KEY;if(!e||!r)throw Error("Service-role Supabase credentials missing, set SUPABASE_SERVICE_ROLE_KEY");if(!l){let e=function(e){try{let r=e.split(".");if(3!==r.length)return null;let t=JSON.parse(Buffer.from(r[1],"base64").toString("utf8"));return t&&"string"==typeof t.role?t.role:null}catch{return null}}(r);if("anon"===e)throw Error("[service.ts] SUPABASE_SERVICE_ROLE_KEY (or its fallback env var) appears to be an ANON key (role claim = 'anon'). Service-role client cannot bypass RLS with an anon key - every query will return empty silently. Replace with the project's service_role JWT from Supabase dashboard -> Settings -> API.");e&&"service_role"!==e&&console.warn(`[service.ts] WARNING: loaded service key has role='${e}' (expected 'service_role'). RLS bypass may not work as intended.`),e||console.warn("[service.ts] WARNING: could not decode role claim from service key. Continuing - this is fine for non-JWT tokens but worth a glance."),l=!0}return d=(0,a.createClient)(e,r,{auth:{persistSession:!1,autoRefreshToken:!1}})}async function s(){try{return o()}catch(e){throw e}return c||(c=(async()=>{let e="https://vsuyzovzqtrngorpqnhy.supabase.co",r="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdXl6b3Z6cXRybmdvcnBxbmh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNDc0MjMsImV4cCI6MjA3NjgyMzQyM30.LUMDk9iiVZ53SIVdlyWfpY1FqB0ZZGsoYJuV4ythj1s",t=process.env.SUPABASE_DEV_USER_EMAIL,i="CateringMS123!";if(!e||!r||!t||!i)throw Error("Local Supabase fallback missing SUPABASE_DEV_USER_EMAIL or NEXT_PUBLIC_DEV_USER_PASSWORD");let n=(0,a.createClient)(e,r,{auth:{persistSession:!1,autoRefreshToken:!1}}),{data:o,error:s}=await n.auth.signInWithPassword({email:t,password:i});if(s||!o.user)throw Error(`Local Supabase fallback login failed: ${s?.message||"no user"}`);let{data:d,error:l}=await n.from("profiles").select("role, active_role").eq("id",o.user.id).maybeSingle();if(l)throw l;let c=String(d?.active_role||d?.role||"");if(!["super_admin","company_admin","admin"].includes(c))throw Error("SUPABASE_DEV_USER_EMAIL must belong to an administrative dev account");return n})().catch(e=>{throw c=null,e}))}i()}catch(e){i(e)}})},50669:(e,r,t)=>{t.d(r,{$:()=>i});async function i(e){try{let r=await fetch("/api/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});if(!r.ok)return console.error("Email API error:",await r.text()),!1;return(await r.json()).success||!1}catch(e){return console.error("Error calling email API:",e),!1}}},75600:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},77300:(e,r,t)=>{t.d(r,{N:()=>n});var i=t(82664);let a=null,n=new Proxy({},{get:(e,r,t)=>Reflect.get((a||(a=(0,i.U)()),a),r,t)})},82489:(e,r,t)=>{t.r(r),t.d(r,{config:()=>h,default:()=>g,routeModule:()=>f});var i={};t.r(i),t.d(i,{default:()=>u});var a=t(33480),n=t(8667),o=t(86435),s=t(77300),d=t(50669);let l=function(){try{let{getServiceSupabase:e}=t(47026);return e()}catch{return s.N}}(),c={async getPreferences(e){let{data:r,error:t}=await l.from("email_notification_preferences").select("*").eq("user_id",e).single();return t&&"PGRST116"!==t.code?(console.error("Error fetching email preferences:",t),null):r},async updatePreferences(e,r){let{error:t}=await l.from("email_notification_preferences").upsert({user_id:e,...r,updated_at:new Date().toISOString()});return!t||(console.error("Error updating email preferences:",t),!1)},async processPendingEmails(e){try{let{data:r,error:t}=await l.from("email_automation_log").select("*").eq("user_id",e).eq("status","pending").order("created_at",{ascending:!0}).limit(50);if(t)return console.error("Error fetching pending emails:",t),0;if(!r||0===r.length)return 0;let i=0;for(let t of r)try{let r=await this.buildEmailBody(t);await (0,d.$)({companyId:e,to:t.recipient_email,subject:t.subject,body:r,orderId:t.order_id,quoteId:t.quote_id})?(await l.from("email_automation_log").update({status:"sent",updated_at:new Date().toISOString()}).eq("id",t.id),i++):await l.from("email_automation_log").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",t.id)}catch(e){console.error("Error sending email:",e),await l.from("email_automation_log").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",t.id)}return i}catch(e){return console.error("Error processing pending emails:",e),0}},async buildEmailBody(e){let r=e.template_type,t=null;if(e.order_id){let{data:r,error:i}=await l.from("orders").select("*").eq("id",e.order_id).single();i&&console.error("[emailNotificationService/buildEmailBody] orders lookup failed:",i),t=r}switch(r){case"order_status_confirmed":return this.buildOrderConfirmedEmail(t,e);case"order_status_preparing":return this.buildOrderPreparingEmail(t,e);case"order_status_ready":return this.buildOrderReadyEmail(t,e);case"order_status_delivered":return this.buildOrderDeliveredEmail(t,e);case"order_status_cancelled":return this.buildOrderCancelledEmail(t,e);case"driver_assigned":return this.buildDriverAssignedEmail(t,e);default:return this.buildGenericEmail(e)}},buildOrderConfirmedEmail(e,r){let t=e?.currency||r?.company_currency||"ZAR";return`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: #9333ea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
    .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Order Confirmed!</h1>
    </div>
    <div class="content">
      <p>Hi ${r.recipient_name},</p>
      <p>Great news! Your order has been confirmed and we're getting everything ready for your event.</p>
      
      <div class="details">
        <h3>Order Details</h3>
        <div class="detail-row">
          <strong>Order Number:</strong>
          <span>${e?.order_number||"N/A"}</span>
        </div>
        <div class="detail-row">
          <strong>Event Date:</strong>
          <span>${e?.event_date?new Date(e.event_date).toLocaleDateString():"TBD"}</span>
        </div>
        <div class="detail-row">
          <strong>Number of People:</strong>
          <span>${e?.number_of_people||"N/A"}</span>
        </div>
        <div class="detail-row">
          <strong>Venue:</strong>
          <span>${e?.venue_name||"N/A"}</span>
        </div>
        <div class="detail-row">
          <strong>Total Amount:</strong>
          <span>${(e=>{try{return new Intl.NumberFormat("en-ZA",{style:"currency",currency:t,minimumFractionDigits:2,maximumFractionDigits:2}).format(e)}catch{return`${t} ${e.toFixed(2)}`}})(Number(e?.total_amount)||0)}</span>
        </div>
      </div>

      <p>We'll keep you updated as we prepare your order. You'll receive notifications when:</p>
      <ul>
        <li>Your order is being prepared</li>
        <li>Your order is ready for pickup/delivery</li>
        <li>Your order is out for delivery</li>
        <li>Your order has been delivered</li>
      </ul>

      <p>If you have any questions, feel free to reach out to us anytime.</p>

      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
    `},buildOrderPreparingEmail:(e,r)=>`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>👨‍🍳 Order Being Prepared</h1>
    </div>
    <div class="content">
      <p>Hi ${r.recipient_name},</p>
      <p>Your order <strong>${e?.order_number}</strong> is now being prepared by our kitchen team.</p>
      <p>We're working hard to ensure everything is perfect for your event on ${e?.event_date?new Date(e.event_date).toLocaleDateString():"your scheduled date"}.</p>
      <p>You'll receive another notification when your order is ready for pickup or delivery.</p>
      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>
    `,buildOrderReadyEmail:(e,r)=>`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔥 Order Ready for Pickup!</h1>
    </div>
    <div class="content">
      <p>Hi ${r.recipient_name},</p>
      <p>Great news! Your order <strong>${e?.order_number}</strong> is ready for pickup/delivery.</p>
      ${e?.delivery_type==="pickup"?"<p>You can collect your order at your convenience.</p>":"<p>Our driver will be delivering your order shortly.</p>"}
      <p>Event Date: ${e?.event_date?new Date(e.event_date).toLocaleDateString():"TBD"}</p>
      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>
    `,buildOrderDeliveredEmail:(e,r)=>`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Order Delivered!</h1>
    </div>
    <div class="content">
      <p>Hi ${r.recipient_name},</p>
      <p>Your order <strong>${e?.order_number}</strong> has been successfully delivered!</p>
      <p>We hope you enjoy your event. If you have any feedback or concerns, please don't hesitate to reach out.</p>
      <p>Thank you for choosing us for your catering needs!</p>
      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>
    `,buildOrderCancelledEmail:(e,r)=>`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ Order Cancelled</h1>
    </div>
    <div class="content">
      <p>Hi ${r.recipient_name},</p>
      <p>Your order <strong>${e?.order_number}</strong> has been cancelled.</p>
      <p>If this was a mistake or you have any questions, please contact us immediately.</p>
      <p>We hope to serve you again in the future.</p>
      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>
    `,buildDriverAssignedEmail:(e,r)=>`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚗 New Delivery Assignment</h1>
    </div>
    <div class="content">
      <p>Hi ${r.recipient_name},</p>
      <p>You have been assigned a new delivery:</p>
      
      <div class="details">
        <h3>Delivery Details</h3>
        <div class="detail-row">
          <strong>Order Number:</strong>
          <span>${e?.order_number||"N/A"}</span>
        </div>
        <div class="detail-row">
          <strong>Client:</strong>
          <span>${e?.client_name||"N/A"}</span>
        </div>
        <div class="detail-row">
          <strong>Event Date:</strong>
          <span>${e?.event_date?new Date(e.event_date).toLocaleDateString():"TBD"}</span>
        </div>
        <div class="detail-row">
          <strong>Delivery Address:</strong>
          <span>${e?.venue_address||"N/A"}</span>
        </div>
      </div>

      <p>Please log in to your driver dashboard to view full details and update the delivery status.</p>

      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>
    `,buildGenericEmail:e=>`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📧 Notification</h1>
    </div>
    <div class="content">
      <p>Hi ${e.recipient_name},</p>
      <p>${e.subject}</p>
      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>
    `};async function p(e,r){if("POST"!==e.method)return r.status(405).json({error:"Method not allowed"});let t=process.env.CRON_SECRET;if(!t)return console.error("[process-email-notifications] CRON_SECRET env var not set"),r.status(500).json({error:"Server config error"});if(e.headers.authorization!==`Bearer ${t}`)return r.status(401).json({error:"Unauthorized"});try{let{companyId:t}=e.body;if(!t)return r.status(400).json({error:"Company ID is required"});let i=await c.processPendingEmails(t);return r.status(200).json({success:!0,sentCount:i,message:`Processed ${i} email notifications`})}catch(e){return console.error("Error processing email notifications:",e),r.status(500).json({success:!1,error:"Failed to process email notifications"})}}let u=(0,t(96153).k)(p),g=(0,o.M)(i,"default"),h=(0,o.M)(i,"config"),f=new a.PagesAPIRouteModule({definition:{kind:n.A.PAGES_API,page:"/api/process-email-notifications",pathname:"/api/process-email-notifications",bundlePath:"",filename:""},userland:i})},82664:(e,r,t)=>{t.d(r,{U:()=>a});var i=t(23405);let a=()=>{let e="https://vsuyzovzqtrngorpqnhy.supabase.co",r="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdXl6b3Z6cXRybmdvcnBxbmh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNDc0MjMsImV4cCI6MjA3NjgyMzQyM30.LUMDk9iiVZ53SIVdlyWfpY1FqB0ZZGsoYJuV4ythj1s";return e&&r||console.warn("Missing Supabase environment variables; using placeholder client. All Supabase calls will fail. This is expected during prerender; if you see it at runtime, check NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY."),(0,i.createBrowserClient)(e||"https://placeholder.supabase.co",r||"placeholder")}},86435:(e,r)=>{Object.defineProperty(r,"M",{enumerable:!0,get:function(){return function e(r,t){return t in r?r[t]:"then"in r&&"function"==typeof r.then?r.then(r=>e(r,t)):"function"==typeof r&&"default"===t?r:void 0}}})},93721:e=>{e.exports=import("@supabase/supabase-js")},96153:(e,r,t)=>{t.d(r,{k:()=>p});var i=t(29021),a=t.n(i),n=t(33873),o=t.n(n);let s=null;function d(e,r){if(s||function(){if(!s)try{let e=o().join(process.cwd(),"logs");a().existsSync(e)||a().mkdirSync(e,{recursive:!0});let r=a().readdirSync(e).filter(e=>/^run-\d+/.test(e)).length+1,t=new Date,i=t.toISOString().slice(0,19).replace("T","_").replace(/:/g,"-");s=o().join(e,`run-${r}-${i}`),a().mkdirSync(s,{recursive:!0});let n=["═".repeat(72),`  RUN #${r}  -  ${t.toISOString()}`,"  NODE_ENV: production",`  APP_URL:  ${process.env.NEXT_PUBLIC_APP_URL??"http://localhost:3001"}`,"═".repeat(72),""].join("\n");a().writeFileSync(o().join(s,"all.log"),n,"utf8"),a().writeFileSync(o().join(s,"errors.log"),n,"utf8"),a().writeFileSync(o().join(s,"_run-info.json"),JSON.stringify({runNumber:r,startedAt:t.toISOString(),nodeEnv:"production",appUrl:process.env.NEXT_PUBLIC_APP_URL},null,2),"utf8"),process.stdout.write(`
[logger] Run #${r} - logs → ${o().relative(process.cwd(),s)}

`)}catch{}}(),s)try{a().appendFileSync(o().join(s,e),r+"\n","utf8")}catch{}}function l(e,r,t,i){let a=new Date().toISOString(),n=i&&Object.keys(i).length>0?"  "+(()=>{try{return JSON.stringify(i)}catch{return"[non-serialisable]"}})():"",o=`[${a}] [${r.padEnd(5)}] [${e.padEnd(10)}] ${t}${n}`;d("all.log",o),d(`${e}.log`,o),("ERROR"===r||"WARN"===r)&&d("errors.log",o)}let c=new Set(["password","token","secret","key","passphrase","access_token","refresh_token","api_key","apiKey"]);function p(e,r){return async(t,i)=>{var a;let n=Date.now(),o=r??(a=t.url??"",/\/api\/cron\//.test(a)?"cron":/\/api\/auth\//.test(a)?"auth":/\/api\/admin\/platform/.test(a)||/\/api\/admin\//.test(a)?"owner":/\/api\/quotes\/|\/api\/leads\//.test(a)||/\/api\/orders\//.test(a)?"sales":/\/api\/kitchen\//.test(a)?"kitchen":/\/api\/shopping\//.test(a)?"shopper":/\/api\/driver\//.test(a)?"driver":/\/api\/cleaning\//.test(a)?"cleaning":/\/api\/client-tokens\/|\/api\/public\//.test(a)?"client":/\/api\/webhooks\/|\/api\/payments\//.test(a)?"payment":/\/api\/accounting\//.test(a)?"accounting":/\/api\/emails\/|\/api\/send-email/.test(a)?"email":"api"),s=t.method??"?",d=t.url??"?",p=t.query.company_slug??"-",u=t.user?.id??t.headers["x-user-id"]??"anon",g={tenant:p,user:u};t.query&&Object.keys(t.query).length>0&&(g.query=t.query),("POST"===s||"PUT"===s||"PATCH"===s)&&t.body&&(g.body=function(e){if(!e||"object"!=typeof e)return e;let r={...e};for(let e of Object.keys(r))c.has(e.toLowerCase())&&(r[e]="[REDACTED]");return r}(t.body)),l(o,"INFO",`→ ${s} ${d}`,g);let h=i.json.bind(i);i.json=function(e){let r=Date.now()-n,t=i.statusCode>=500?"ERROR":i.statusCode>=400?"WARN":"INFO",a={status:i.statusCode,ms:r};return i.statusCode>=400&&(a.response=e),l(o,t,`← ${s} ${d}`,a),h(e)};let f=i.end.bind(i),m=!1;i.end=function(...e){if(!m){m=!0;let e=Date.now()-n;l(o,i.statusCode>=500?"ERROR":i.statusCode>=400?"WARN":"INFO",`← ${s} ${d}`,{status:i.statusCode,ms:e})}return f(...e)};try{await e(t,i)}catch(r){let e=Date.now()-n;l("errors","ERROR",`✗ ${s} ${d} threw after ${e}ms`,{tenant:p,user:u,error:r instanceof Error?r.message:String(r),stack:r instanceof Error?r.stack?.split("\n").slice(0,6).join(" | "):void 0}),i.headersSent||(/\/api\/chat(?:[/?]|$)/.test(d)?i.status(500).json({error:"The assistant could not complete this request. Please try again.",code:"UNEXPECTED_CHAT_SERVER_ERROR",retryable:!0}):i.status(500).json({error:"Internal server error"}))}}}}};var r=require("../../webpack-api-runtime.js");r.C(e);var t=r(r.s=82489);module.exports=t})();