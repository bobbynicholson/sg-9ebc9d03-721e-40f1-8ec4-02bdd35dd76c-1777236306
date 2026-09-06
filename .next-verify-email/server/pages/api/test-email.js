"use strict";(()=>{var e={};e.id=77496,e.ids=[10157,32538,44443,50472,54919,58868,77300,77496],e.modules={23405:e=>{e.exports=require("@supabase/ssr")},29021:e=>{e.exports=require("fs")},33873:e=>{e.exports=require("path")},47026:(e,t,r)=>{r.a(e,async(e,a)=>{try{r.r(t),r.d(t,{getRequestSupabase:()=>o,getServiceSupabase:()=>s});var i=r(93721),n=e([i]);i=(n.then?(await n)():n)[0];let l=null,c=!1,p=null;function s(){if(l)return l;let e="https://vsuyzovzqtrngorpqnhy.supabase.co",t=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SECRET_KEY;if(!e||!t)throw Error("Service-role Supabase credentials missing, set SUPABASE_SERVICE_ROLE_KEY");if(!c){let e=function(e){try{let t=e.split(".");if(3!==t.length)return null;let r=JSON.parse(Buffer.from(t[1],"base64").toString("utf8"));return r&&"string"==typeof r.role?r.role:null}catch{return null}}(t);if("anon"===e)throw Error("[service.ts] SUPABASE_SERVICE_ROLE_KEY (or its fallback env var) appears to be an ANON key (role claim = 'anon'). Service-role client cannot bypass RLS with an anon key - every query will return empty silently. Replace with the project's service_role JWT from Supabase dashboard -> Settings -> API.");e&&"service_role"!==e&&console.warn(`[service.ts] WARNING: loaded service key has role='${e}' (expected 'service_role'). RLS bypass may not work as intended.`),e||console.warn("[service.ts] WARNING: could not decode role claim from service key. Continuing - this is fine for non-JWT tokens but worth a glance."),c=!0}return l=(0,i.createClient)(e,t,{auth:{persistSession:!1,autoRefreshToken:!1}})}async function o(){try{return s()}catch(e){throw e}return p||(p=(async()=>{let e="https://vsuyzovzqtrngorpqnhy.supabase.co",t="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdXl6b3Z6cXRybmdvcnBxbmh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNDc0MjMsImV4cCI6MjA3NjgyMzQyM30.LUMDk9iiVZ53SIVdlyWfpY1FqB0ZZGsoYJuV4ythj1s",r=process.env.SUPABASE_DEV_USER_EMAIL,a="CateringMS123!";if(!e||!t||!r||!a)throw Error("Local Supabase fallback missing SUPABASE_DEV_USER_EMAIL or NEXT_PUBLIC_DEV_USER_PASSWORD");let n=(0,i.createClient)(e,t,{auth:{persistSession:!1,autoRefreshToken:!1}}),{data:s,error:o}=await n.auth.signInWithPassword({email:r,password:a});if(o||!s.user)throw Error(`Local Supabase fallback login failed: ${o?.message||"no user"}`);let{data:l,error:c}=await n.from("profiles").select("role, active_role").eq("id",s.user.id).maybeSingle();if(c)throw c;let p=String(l?.active_role||l?.role||"");if(!["super_admin","company_admin","admin"].includes(p))throw Error("SUPABASE_DEV_USER_EMAIL must belong to an administrative dev account");return n})().catch(e=>{throw p=null,e}))}a()}catch(e){a(e)}})},55511:e=>{e.exports=require("crypto")},58868:(e,t,r)=>{r.d(t,{createPagesServerClient:()=>i});var a=r(23405);function i(e){let t="https://vsuyzovzqtrngorpqnhy.supabase.co",r="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdXl6b3Z6cXRybmdvcnBxbmh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNDc0MjMsImV4cCI6MjA3NjgyMzQyM30.LUMDk9iiVZ53SIVdlyWfpY1FqB0ZZGsoYJuV4ythj1s";if(!t||!r)throw Error("Missing Supabase environment variables");return(0,a.createServerClient)(t,r,{cookies:{getAll:()=>Object.keys(e.req.cookies).map(t=>({name:t,value:e.req.cookies[t]||""})),setAll(t){try{let r=t.map(({name:e,value:t,options:r})=>(0,a.serializeCookieHeader)(e,t,r));e.res.setHeader("Set-Cookie",r)}catch(e){}}}})}},73403:(e,t,r)=>{r.a(e,async(e,a)=>{try{r.r(t),r.d(t,{default:()=>d});var i=r(73217),n=r(80606),s=r(58868),o=r(47026),l=r(96153),c=e([o]);async function p(e,t){if("POST"!==e.method)return t.status(405).json({error:"Method not allowed"});try{let{companyId:r,to:a}=e.body;if(!r||!a)return t.status(400).json({error:"Missing required fields: companyId and to are required"});let i=(0,s.createPagesServerClient)({req:e,res:t}),{data:{user:l}}=await i.auth.getUser();if(!l)return t.status(401).json({error:"Authentication required"});let{data:c}=await i.from("profiles").select("company_id, role, active_role").eq("id",l.id).maybeSingle(),p=c?.active_role||c?.role;if("super_admin"!==p&&c?.company_id!==r)return t.status(403).json({error:"Cannot test email for another company"});let d=(0,o.getServiceSupabase)(),u=await n.emailService.getEmailConfig(r,d);if(!u)return t.status(400).json({error:"Email configuration not found for this company",hint:"Set up email settings in the admin portal first"});if(!u.enabled)return t.status(400).json({error:"Email automation is disabled for this company",hint:"Enable email automation in the admin portal"});let m=`${u.from_name||"Your team"} <${u.from_email||"your address"}>`,f=`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CateringMS test email</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;line-height:1.55;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0;font-size:13px;color:#64748b;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">CateringMS test email</p>
                <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">Your email setup is working.</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 28px 4px 28px;">
                <p style="margin:0;font-size:15px;color:#334155;">
                  If you can read this, CateringMS can send quotes, invoices and confirmations to your clients from this address.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 4px 28px;">
                <p style="margin:0;font-size:12px;color:#64748b;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">From</p>
                <p style="margin:4px 0 0 0;font-size:14px;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all;">${m}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 28px 4px 28px;">
                <p style="margin:0;font-size:12px;color:#64748b;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">Sent via</p>
                <p style="margin:4px 0 0 0;font-size:14px;color:#0f172a;">${"resend"===u.provider?"CateringMS (Resend)":u.provider||"Default"}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 28px 28px;">
                <p style="margin:0;font-size:13px;color:#64748b;">
                  This is a one-off test from the Email settings page. Real client emails carry the booking link, quote PDF, or invoice.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:11px;color:#94a3b8;text-align:center;">
            Sent from CateringMS &middot; <a href="https://cateringms.com" style="color:#94a3b8;text-decoration:underline;">cateringms.com</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`,h=await n.emailService.sendEmailDetailed({companyId:r,to:a,subject:"CateringMS test email - your setup is working",body:f,_client:d});if(h.success)return t.status(200).json({success:!0,message:"Test email sent successfully! Check your inbox.",config:{provider:u.provider,from:`${u.from_name} <${u.from_email}>`,enabled:u.enabled}});let y=process.env.RESEND_API_KEY,g="resend_auth"===h.error_code?{resend_key_present:!!y,resend_key_length:y?y.length:0,resend_key_prefix:y?y.slice(0,3):null,resend_key_starts_with_re_:!!y&&y.startsWith("re_"),resend_key_has_whitespace_edges:!!y&&y.trim()!==y,node_env:"production",vercel_env:process.env.VERCEL_ENV||null}:void 0;return t.status(500).json({success:!1,error:h.error||"Failed to send test email",error_code:h.error_code||null,fix_link:h.fix_link||null,context:h.context||null,debug:g,config:{provider:u.provider,from:`${u.from_name} <${u.from_email}>`,enabled:u.enabled}})}catch(e){return console.error("Test email error:",e),t.status(500).json({success:!1,error:e instanceof Error?(0,i._)(e):"Unknown error"})}}o=(c.then?(await c)():c)[0];let d=(0,l.k)(p);a()}catch(e){a(e)}})},75600:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},77300:(e,t,r)=>{r.d(t,{N:()=>n});var a=r(82664);let i=null,n=new Proxy({},{get:(e,t,r)=>Reflect.get((i||(i=(0,a.U)()),i),t,r)})},82664:(e,t,r)=>{r.d(t,{U:()=>i});var a=r(23405);let i=()=>{let e="https://vsuyzovzqtrngorpqnhy.supabase.co",t="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdXl6b3Z6cXRybmdvcnBxbmh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNDc0MjMsImV4cCI6MjA3NjgyMzQyM30.LUMDk9iiVZ53SIVdlyWfpY1FqB0ZZGsoYJuV4ythj1s";return e&&t||console.warn("Missing Supabase environment variables; using placeholder client. All Supabase calls will fail. This is expected during prerender; if you see it at runtime, check NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY."),(0,a.createBrowserClient)(e||"https://placeholder.supabase.co",t||"placeholder")}},90264:(e,t,r)=>{r.a(e,async(e,a)=>{try{r.r(t),r.d(t,{config:()=>p,default:()=>c,routeModule:()=>d});var i=r(33480),n=r(8667),s=r(86435),o=r(73403),l=e([o]);o=(l.then?(await l)():l)[0];let c=(0,s.M)(o,"default"),p=(0,s.M)(o,"config"),d=new i.PagesAPIRouteModule({definition:{kind:n.A.PAGES_API,page:"/api/test-email",pathname:"/api/test-email",bundlePath:"",filename:""},userland:o});a()}catch(e){a(e)}})},93721:e=>{e.exports=import("@supabase/supabase-js")}};var t=require("../../webpack-api-runtime.js");t.C(e);var r=e=>t(t.s=e),a=t.X(0,[28560,80606],()=>r(90264));module.exports=a})();