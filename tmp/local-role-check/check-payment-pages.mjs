import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
const env = {};
for (const line of readFileSync('.env.local','utf8').split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim().replace(/^["']|["']$/g,'');
}
const url=env.NEXT_PUBLIC_SUPABASE_URL;
const admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const browser=await chromium.launch({headless:true});
const reports=[];
try {
  for (const user of [
    {role:'client',email:'universalsportmags23@gmail.com',routes:['client-portal/billing','client-portal/quotes','client-portal/my-orders']},
    {role:'company_admin',email:'hello@spitbraaidelivery.co.za',routes:['admin/quotes','admin/quotes/new']},
  ]) {
    const {data,error}=await admin.auth.admin.generateLink({type:'magiclink',email:user.email});
    if(error) throw new Error('Could not create authorized local session');
    const anon=createClient(url,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:verified,error:verifyError}=await anon.auth.verifyOtp({token_hash:data.properties.hashed_token,type:'magiclink'});
    if(verifyError||!verified.session) throw new Error('Could not verify authorized local session');
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
    const key=`sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
    const encoded=`base64-${Buffer.from(JSON.stringify(verified.session)).toString('base64url')}`;
    const cookies=[];
    for(let i=0;i<encoded.length;i+=3180) cookies.push({name:encoded.length<=3180?key:`${key}.${cookies.length}`,
      value:encoded.slice(i,i+3180),domain:'localhost',path:'/',httpOnly:false,secure:false,sameSite:'Lax'});
    await ctx.addCookies(cookies);
    for (const route of user.routes) {
      const page=await ctx.newPage(),pageErrors=[],failedRequests=[];
      page.on('pageerror',e=>pageErrors.push(e.message.slice(0,500)));
      page.on('response',r=>{const u=new URL(r.url());if(u.origin==='http://localhost:3001'&&r.status()>=400)
        failedRequests.push({path:u.pathname,status:r.status()});});
      const response=await page.goto(`http://localhost:3001/spit-braai-delivery/${route}`,{waitUntil:'domcontentloaded',timeout:90000});
      await page.waitForTimeout(5000);
      const finalPath=new URL(page.url()).pathname;
      const body=await page.locator('body').innerText();
      const screenshot=`${user.role}-${route.replaceAll('/','-')}.png`;
      await page.screenshot({path:`tmp/local-role-check/${screenshot}`});
      const loaded=response.ok()&&finalPath===`/spit-braai-delivery/${route}`
        &&!/Application error|Internal Server Error|This page could not be found/.test(body);
      reports.push({role:user.role,route,finalPath,status:response.status(),loaded,
        headings:await page.locator('h1,h2').allTextContents(),pageErrors,failedRequests,screenshot});
      writeFileSync('tmp/local-role-check/payment-pages.json',JSON.stringify(reports,null,2));
      console.log(`${loaded&&!pageErrors.length?'PASS':'REVIEW'} [${user.role}] ${route}`);
      await page.close();
    }
    await ctx.close();
  }
} finally {await browser.close();}
