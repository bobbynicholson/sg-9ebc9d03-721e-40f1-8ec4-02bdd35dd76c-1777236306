const fs=require('fs');
let s=fs.readFileSync('scripts/all-users-verify.mjs','utf8');
s=s.replace('const USERS = [','let USERS = [');
s=s.replace('function parseEnvFile() {', `USERS = USERS.filter(u => ['shopping_staff','cleaning_staff','cleaning_manager','company_admin'].includes(u.role));
for (const u of USERS) {
 if(u.role==='shopping_staff') u.routes.push('/team-portal/shopping/restock');
 if(u.role==='cleaning_manager') u.routes=['/team-portal/cleaning/management','/team-portal/cleaning/settings'];
 if(u.role==='company_admin') u.routes=['/team-portal/shopping/settings','/team-portal/cleaning/settings'];
}
function parseEnvFile() {`);
const start=s.indexOf('  const resp = await fetch(data.properties.action_link');
const end=s.indexOf('\n  return s.session;',start);
s=s.slice(0,start)+`  const {data:s,error:se}=await anon.auth.verifyOtp({token_hash:data.properties.hashed_token,type:'magiclink'});
  if(se || !s?.session) throw new Error(se?.message || 'no session');`+s.slice(end);
s=s.replace('    const consoleErrors = [];','    const consoleErrors = []; const backend = [];');
s=s.replace('        const sameOrigin =',`        if (u.pathname.startsWith('/rest/v1/') || u.pathname.startsWith('/api/')) backend.push({method:resp.request().method(),path:u.pathname,status:resp.status()});
        const sameOrigin =`);
s=s.replace('await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});','await page.waitForTimeout(3500);');
s=s.replace('results.push({ role: user.role,',`const controls=route.endsWith('/settings') ? await page.locator('input,button[role="switch"]').evaluateAll(nodes=>nodes.map(n=>({id:n.id,disabled:n.disabled,value:n.value,checked:n.getAttribute('aria-checked')}))) : [];
    results.push({ backend, controls, role: user.role,`);
s=s.replace('"screenshots", "all-users-verify-results.json"','"tmp", "shop-clean-backend-pages.json"');
fs.writeFileSync('tmp/shop-clean-backend-crawl.mjs',s);
