const fs=require('fs');const p='src/pages/api/onboarding/clients/map-columns.ts';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a))throw new Error(a.slice(0,70));s=s.replace(a,b);};
rep(`  const headers = rawHeaders.map((h) => clip(h, MAX_HEADER_LEN).trim());`,
`  // Unique, non-empty labels: blank headers become "Column N" and repeated
  // names get " (2)", " (3)" so every column maps back unambiguously.
  const seenLabels = new Map<string, number>();
  const headers = rawHeaders.map((h, i) => {
    const base = clip(h, MAX_HEADER_LEN).replace(/^\uFEFF/, "").trim() || \`Column \${i + 1}\`;
    const n = (seenLabels.get(base.toLowerCase()) || 0) + 1;
    seenLabels.set(base.toLowerCase(), n);
    return n === 1 ? base : \`\${base} (\${n})\`;
  });`);
rep(`    headers.forEach((h, i) => { out[h || \`Column \${i + 1}\`] = clip(cells[i], MAX_CELL_LEN); });`,
    `    headers.forEach((h, i) => { out[h] = clip(cells[i], MAX_CELL_LEN); });`);
rep(`      headers: headers.map((h, i) => h || \`Column \${i + 1}\`),`, `      headers,`);
rep(`    const decisions = headers.map((h, index) => {
      const label = h || \`Column \${index + 1}\`;
      const m = mapping.find((x) => x.source_header === label);`,
`    const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
    const decisions = headers.map((label, index) => {
      const m = mapping.find((x) => x.source_header === label)
        || mapping.find((x) => norm(x.source_header) === norm(label));`);
rep(`  } catch (e) {
    console.error("[clients/map-columns] AI mapping failed", e);
    return res.status(502).json({
      error: "AI column matching failed. Your columns were matched by name instead.",
      code: "ai_failed",
    });
  }`,
`  } catch (e: any) {
    const status = Number(e?.status) || 0;
    const timedOut = /timed? ?out|timeout|ETIMEDOUT|aborted/i.test(String(e?.message || e?.name || ""));
    console.error("[clients/map-columns] AI mapping failed", { status, message: String(e?.message || e).slice(0, 300) });
    if (status === 429) {
      return res.status(429).json({ error: "AI matching is busy right now. Try again in a minute, or match the columns by hand.", code: "ai_rate_limited" });
    }
    if (timedOut) {
      return res.status(504).json({ error: "AI matching took too long. Try again, or match the columns by hand.", code: "ai_timeout" });
    }
    return res.status(502).json({ error: "AI matching is unavailable right now. Match the columns by hand.", code: "ai_failed" });
  }`);
fs.writeFileSync(p,s);console.log('ok');
