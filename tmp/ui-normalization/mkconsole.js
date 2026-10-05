const fs=require('fs');let s=fs.readFileSync('tmp/ui-normalization/shot.mjs','utf8');
const inject=`for (const route of process.argv.slice(2)) { if (process.env.CONSOLE) {
  const page = await ctx.newPage(); const logs=[];
  page.on("console", m => { if (["warning","error"].includes(m.type())) logs.push(m.type()+": "+m.text().slice(0,700)); });
  page.on("response", r => { if (r.status()>=400 && r.url().includes("supabase")) logs.push("HTTP "+r.status()+" "+r.url().split(".co")[1]?.slice(0,300)); });
  await page.goto(\`http://localhost:3001/spit-braai-delivery\${route}\`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(15000);
  console.log(logs.filter(l => /timeline|orders\]|HTTP|rror/i.test(l)).slice(0,25).join("\n") || "no warnings");
  await page.close(); continue; }`;
s=s.replace('for (const route of process.argv.slice(2)) {',inject);fs.writeFileSync('tmp/ui-normalization/console.mjs',s);console.log('ok');
