const fs=require('fs');let s=fs.readFileSync('tmp/ui-normalization/shot.mjs','utf8');
const inject=`for (const route of process.argv.slice(2)) { if (process.env.IMPORTTEST) {
  const page = await ctx.newPage(); const errors=[]; page.on("pageerror", e => errors.push(e.message.slice(0,200)));
  const posted=[]; page.on("request", r => { if (r.method()==="POST" && r.url().includes("/api/")) posted.push(r.url().replace(/^https?:\/\/[^/]+/,"")); });
  await page.goto(\`http://localhost:3001/spit-braai-delivery\${route}\`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(9000);
  const tsv = ["Full Name\tE-mail Address\tCell\tTown\tRemarks", "Thandi Mokoena\tthandi@example.co.za\t082 555 1234\tCape Town\tVIP", "Pieter Botha\t\t083 111 2222\tPretoria\t", "Lerato Dlamini\tlerato@example\t12\tDurban\tCorporate", "Sam Naidoo\tsam@example.co.za\t084 999 0000\tJohannesburg\t"].join("\n");
  await page.locator("textarea").first().fill(tsv);
  await page.getByRole("button", { name: "Continue with pasted rows" }).click();
  await page.waitForTimeout(800);
  const selects = await page.locator("select[aria-label^='Import column']").evaluateAll(els => els.map(e => e.value));
  await page.getByRole("button", { name: "Match with AI" }).click();
  await page.waitForTimeout(4000);
  const aiNote = await page.locator("text=/AI matched|unavailable|isn't configured|failed/i").first().textContent().catch(()=>null);
  await page.screenshot({ path: \`\${out}/import-step2.png\`, fullPage: true });
  // Fix the matching by hand: Full Name -> name, E-mail -> email, Cell -> mobile, Town -> city, Remarks -> notes
  const pick = async (i, v) => page.locator("select[aria-label='Import column " + (i+1) + " as']").selectOption(v);
  await pick(0,"name"); await pick(1,"email"); await pick(2,"mobile_number"); await pick(3,"billing_city"); await pick(4,"notes");
  await page.getByRole("button", { name: /^Continue with \d+ rows?/ }).click();
  await page.waitForTimeout(800);
  const fixList = await page.locator("ul li button").allTextContents();
  // Click the second problem and check scroll + focus
  await page.locator("ul li button").nth(1).click(); await page.waitForTimeout(900);
  const focused = await page.evaluate(() => document.activeElement?.id || "");
  await page.screenshot({ path: \`\${out}/import-step3.png\`, fullPage: true });
  // Fix the missing email inline and confirm the problem list shrinks
  await page.locator("input[aria-label='Row 2 Email']").fill("pieter@example.co.za"); await page.waitForTimeout(300);
  const fixAfter = await page.locator("ul li button").count();
  const importLabel = await page.getByRole("button", { name: /^Import \d+ client/ }).textContent();
  console.log(JSON.stringify({ selectsByName: selects, aiNote, fixList, focused, fixAfter, importLabel, posted, errors }, null, 1));
  await page.close(); continue; }`;
s=s.replace('for (const route of process.argv.slice(2)) {',inject);fs.writeFileSync('tmp/ui-normalization/importtest.mjs',s);console.log('ok');
