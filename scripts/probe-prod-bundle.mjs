// "Is my fix actually deployed?" - fetches prod's live buildId, resolves
// the build manifest, downloads the given routes' JS chunks and greps
// them for distinctive strings from the fix (new toast/label literals
// survive minification; comments do not). Born 2026-07-11 after a
// driver-portal fix was live on the server while the client's stale
// PWA kept running week-old JS - git log can't answer what a device
// runs, but this at least proves what the SERVER serves.
// Usage: node scripts/probe-prod-bundle.mjs [route] [needle...]
const base = process.env.PROBE_BASE || "https://cateringms.com";

const html = await (await fetch(`${base}/team-portal/driver/dashboard`)).text();
const buildId = html.match(/"buildId":"([^"]+)"/)?.[1];
if (!buildId) { console.error("could not resolve buildId"); process.exit(1); }
console.log("prod buildId:", buildId);

const bmSrc = await (await fetch(`${base}/_next/static/${buildId}/_buildManifest.js`)).text();
const self = {};
// eslint-disable-next-line no-new-func
new Function("self", bmSrc)(self);
const manifest = self.__BUILD_MANIFEST;

const argRoute = process.argv[2];
const argNeedles = process.argv.slice(3);
const jobs = argRoute
  ? [{ route: argRoute, needles: argNeedles }]
  : [
      // Default: the 2026-07-11 stale-bundle + driver fixes.
      { route: "/team-portal/driver/dashboard", needles: ["Resuming delivery confirmation", "Only one shift per day is allowed", "__stale_build_reload_at"] },
      { route: "/q/[token]", needles: ["formatToParts"] },
      { route: "/pay/i/[token]", needles: ["Full payment due", "Reg No"] },
    ];

// _app/framework code (e.g. the buildId liveness probe) lives in
// chunks referenced by the page HTML, not by the route manifest -
// include every script the HTML loads in the search set for all jobs.
// Vercel appends ?dpl=... to chunk srcs - strip the query, keep the path.
const htmlScripts = [...html.matchAll(/<script[^>]+src="(\/_next\/[^"?]+\.js)(?:\?[^"]*)?"/g)].map((m) => m[1]);

const chunkCache = new Map();
async function chunk(url) {
  if (!chunkCache.has(url)) {
    const res = await fetch(url);
    chunkCache.set(url, res.ok ? await res.text() : "");
  }
  return chunkCache.get(url);
}

let missing = 0;
for (const { route, needles } of jobs) {
  const files = manifest[route];
  if (!files) { console.log(`ROUTE ${route}: NOT IN MANIFEST`); missing++; continue; }
  const urls = [
    ...files.filter((f) => f.endsWith(".js")).map((f) => `${base}/_next/${f}`),
    ...htmlScripts.map((s) => `${base}${s}`),
  ];
  const found = new Set();
  for (const u of urls) {
    const js = await chunk(u);
    for (const n of needles) if (js.includes(n)) found.add(n);
  }
  for (const n of needles) {
    const ok = found.has(n);
    if (!ok) missing++;
    console.log(`ROUTE ${route}: ${ok ? "OK   " : "MISS "} ${n}`);
  }
}
process.exit(missing ? 1 : 0);
