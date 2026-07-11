const BUILD = "yN0BF7LEDmWNGOrpAKyo8";
const base = "https://cateringms.com";
const bmSrc = await (await fetch(`${base}/_next/static/${BUILD}/_buildManifest.js`)).text();
const self = {};
// eslint-disable-next-line no-new-func
new Function("self", bmSrc)(self);
const manifest = self.__BUILD_MANIFEST;
const routes = ["/q/[token]", "/pay/i/[token]"];
const NEEDLES = [
  "formatToParts",
  "maximumFractionDigits:0",
  "maximumFractionDigits: 0",
];
for (const route of routes) {
  const files = manifest[route];
  if (!files) { console.log(`ROUTE ${route}: NOT IN MANIFEST`); continue; }
  console.log(`ROUTE ${route}: ${files.length} chunks`);
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const res = await fetch(`${base}/_next/${f}`);
    if (!res.ok) { console.log(`  ${f}: HTTP ${res.status}`); continue; }
    const js = await res.text();
    const hits = NEEDLES.filter(n => js.includes(n));
    if (hits.length) console.log(`  ${f}: HITS -> ${hits.join(" | ")}`);
  }
}
console.log("done");
