// Exercise the assistant with ten real requests for every seeded role.
// Usage: node scripts/chat-role-qa.mjs --base http://localhost:3001
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE_URL = baseIdx >= 0 ? args[baseIdx + 1] : "http://localhost:3001";
const roleIdx = args.indexOf("--role");
const ONLY_ROLE = roleIdx >= 0 ? args[roleIdx + 1] : null;
const SHOW_NAVIGATION = args.includes("--show-navigation");
const SHOW_ANSWER = args.includes("--show-answer");
const CHECK_LINKS = args.includes("--check-links");
const questionIdx = args.indexOf("--question");
const ONE_QUESTION = questionIdx >= 0 ? args.slice(questionIdx + 1).join(" ") : null;
const SLUG = "spit-braai-delivery";

const USERS = [
  { role: "company_admin", email: "hello@spitbraaidelivery.co.za", landing: "/admin/dashboard", prefix: `/${SLUG}` },
  { role: "admin", email: "admin@spitbraaidelivery.co.za", landing: "/admin/dashboard", prefix: `/${SLUG}` },
  { role: "kitchen_staff", email: "kitchen@spitbraaidelivery.co.za", landing: "/team-portal/kitchen/dashboard", prefix: `/${SLUG}` },
  { role: "kitchen_manager", email: "kitchen.manager.demo@spitbraaidelivery.co.za", landing: "/team-portal/kitchen/dashboard", prefix: `/${SLUG}` },
  { role: "waiter", email: "waiter.demo@spitbraaidelivery.co.za", landing: "/team-portal/waiter/dashboard", prefix: `/${SLUG}` },
  { role: "driver", email: "driver@spitbraaidelivery.co.za", landing: "/team-portal/driver/dashboard", prefix: `/${SLUG}` },
  { role: "shopping_staff", email: "shopping@spitbraaidelivery.co.za", landing: "/team-portal/shopping/dashboard", prefix: `/${SLUG}` },
  { role: "cleaning_staff", email: "cleaning@spitbraaidelivery.co.za", landing: "/team-portal/cleaning/dashboard", prefix: `/${SLUG}` },
  { role: "cleaning_manager", email: "cleaning.manager.demo@spitbraaidelivery.co.za", landing: "/team-portal/cleaning/dashboard", prefix: `/${SLUG}` },
  { role: "client", email: "universalsportmags23@gmail.com", landing: "/client-portal/dashboard", prefix: `/${SLUG}` },
  { role: "super_admin", email: "bobby@skylight-digital.co.za", landing: "/admin/platform/dashboard", prefix: "" },
];

const ROLE_QUESTIONS = {
  company_admin: [
    "What controls are available on this page?", "Which sections are visible here?", "Which tags or filters are visible here?",
    "What can I do on this page?", "What filters can I use here?", "How many active customers do we have?",
    "What is our current subscription plan?", "How many companies are currently registered?", "Can I see all companies on the platform?", "Where can I manage notifications?",
  ],
  admin: [
    "What controls are available on this page?", "Which sections are visible here?", "Which tags or filters are visible here?",
    "What can I do on this page?", "What filters can I use here?", "How many active customers do we have?",
    "What is our current subscription plan?", "How many companies are currently registered?", "Can I see all companies on the platform?", "Where can I manage notifications?",
  ],
  kitchen_staff: [
    "What controls are available on this page?", "Which sections are visible here?", "Which tags or filters are visible here?",
    "What can I do on this page?", "What filters can I use here?", "What is our current subscription plan?",
    "How many companies are currently registered?", "Can I see orders from other companies?", "Where can I view today's kitchen work?", "Where can I view kitchen notifications?",
  ],
  kitchen_manager: [
    "What controls are available on this page?", "Which sections are visible here?", "Which tags or filters are visible here?",
    "What can I do on this page?", "What filters can I use here?", "What is our current subscription plan?",
    "How many companies are currently registered?", "Can I see orders from other companies?", "Where can I view today's kitchen work?", "Where can I view kitchen handovers?",
  ],
  waiter: [
    "What controls are available on this page?", "Which sections are visible here?", "Which tags or filters are visible here?",
    "What can I do on this page?", "What filters can I use here?", "What is our current subscription plan?",
    "How many companies are currently registered?", "Can I see customers from other companies?", "Where can I view my waiter dashboard?", "Where can I view notifications?",
  ],
  driver: [
    "What controls are available on this page?", "Which sections are visible here?", "Which tags or filters are visible here?",
    "What can I do on this page?", "What filters can I use here?", "What is our current subscription plan?",
    "How many companies are currently registered?", "Can I see deliveries from other companies?", "Where can I view my deliveries?", "Where can I view my driver calendar?",
  ],
  shopping_staff: [
    "What controls are available on this page?", "Which sections are visible here?", "Which tags or filters are visible here?",
    "What can I do on this page?", "What filters can I use here?", "What is our current subscription plan?",
    "How many companies are currently registered?", "Can I see stock from other companies?", "Where can I view the buy list?", "Where can I view shopping alerts?",
  ],
  cleaning_staff: [
    "What controls are available on this page?", "Which sections are visible here?", "Which tags or filters are visible here?",
    "What can I do on this page?", "What filters can I use here?", "What is our current subscription plan?",
    "How many companies are currently registered?", "Can I see cleaning tasks from other companies?", "Where can I view my cleaning tasks?", "Where can I view cleaning notifications?",
  ],
  cleaning_manager: [
    "What controls are available on this page?", "Which sections are visible here?", "Which tags or filters are visible here?",
    "What can I do on this page?", "What filters can I use here?", "What is our current subscription plan?",
    "How many companies are currently registered?", "Can I see cleaning tasks from other companies?", "Where can I view my cleaning tasks?", "Where can I view cleaning workflows?",
  ],
  client: [
    "What controls are available on this page?", "Which sections are visible here?", "Which tags or filters are visible here?",
    "What can I do on this page?", "What filters can I use here?", "What is our current subscription plan?",
    "How many companies are currently registered?", "Can I see orders from other companies?", "Where can I view my orders?", "Where can I view my billing?",
  ],
  super_admin: [
    "How many companies are currently registered?", "How many users are on the platform?", "Which companies are currently on trial?",
    "Which subscription plans are active?", "Give me a complete platform overview.", "Where can I view MRR details?",
    "Switch to that company's admin view.", "What controls are available on this page?", "Which sections are visible here?", "Which tags or filters are visible here?", "Do I need a company context?",
  ],
};

function parseEnvFile() {
  const envPath = path.join(repoRoot, ".env.local");
  const env = { ...process.env };
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = parseEnvFile();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Missing Supabase env in .env.local");
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function mintSession(email) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: "https://cateringms.com/auth/callback" } });
  if (error || !data?.properties?.action_link) throw new Error(error?.message || "no action link");
  const resp = await fetch(data.properties.action_link, { redirect: "manual" });
  const loc = resp.headers.get("location") || "";
  const params = new URLSearchParams(new URL(loc).hash.replace(/^#/, ""));
  const { data: session, error: sessionError } = await anon.auth.setSession({ access_token: params.get("access_token"), refresh_token: params.get("refresh_token") });
  if (sessionError || !session?.session) throw new Error(sessionError?.message || "no session");
  return session.session;
}

function b64url(v) { return Buffer.from(v, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function cookieChunks(storageKey, session) {
  const encoded = `base64-${b64url(JSON.stringify(session))}`;
  const size = 3180;
  if (encoded.length <= size) return [{ name: storageKey, value: encoded }];
  const out = [];
  for (let i = 0; i < encoded.length; i += size) out.push({ name: `${storageKey}.${out.length}`, value: encoded.slice(i, i + size) });
  return out;
}

const BAD_VISIBLE_TERMS = /\b(?:database|schema|query|provider|metadata|tenant|tenants|rag|embedding|prompt token|response token)\b/i;
const CROSS_COMPANY = /\b(?:other companies|all companies|companies from other|company count|registered companies|platform companies|cross[- ]company|cross[- ]tenant|other tenants|all tenants)\b/i;

function getFrontendContext(page) {
  return page.evaluate(() => {
    const root = (element) => !element.closest("[data-chatbot-root]");
    const nodes = Array.from(document.querySelectorAll("button, a, input, select, textarea, [role='button'], [role='tab'], [role='option']")).filter(root);
    const seen = new Set();
    const controls = nodes.map((element) => {
      const explicit = element.getAttribute("data-chat-action-label") || element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("placeholder") || element.textContent || "";
      const label = explicit.replace(/\s+/g, " ").trim().slice(0, 160);
      return { label, kind: element.tagName.toLowerCase() };
    }).filter((item) => item.label.length >= 2 && !seen.has(item.label.toLowerCase()) && seen.add(item.label.toLowerCase())).slice(0, 120);
    const tags = Array.from(document.querySelectorAll("[data-chat-tag], [data-tag], [data-filter-tag]")).map((element) => (element.getAttribute("data-chat-tag") || element.getAttribute("data-tag") || element.getAttribute("data-filter-tag") || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100)).filter(Boolean).filter((tag, i, values) => values.indexOf(tag) === i).slice(0, 80);
    const sections = Array.from(document.querySelectorAll("[data-chat-section]"))
      .map((element) => ({ id: element.getAttribute("data-chat-section") || "", label: (element.getAttribute("data-chat-section-label") || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240), ref: element.getAttribute("data-chat-section-ref") || undefined, kind: "section" }))
      .filter((item) => item.id && item.label);
    return { controls, tags, sections };
  });
}

async function ask(page, user, question, frontend, index) {
  return page.evaluate(async ({ question, frontend, index }) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: question, history: [], temporary: true, clientMessageId: `qa-${Date.now()}-${index}`, currentPath: location.pathname, currentSections: frontend.sections, currentControls: frontend.controls, currentTags: frontend.tags }),
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }, { question, frontend, index });
}

function validate(user, question, result) {
  const body = result.body || {};
  const payload = body.response_payload || {};
  const provider = body.message?.metadata?.provider || payload.provider || "unknown";
  const text = [body.message?.content, payload.title, payload.message, ...(payload.details || [])]
    .filter((v) => typeof v === "string")
    .join(" ")
    .replace(/\[[^\]]+\]\([^)]*\)/g, "[link]");
  const navigation = Array.isArray(body.navigation) ? body.navigation : [];
  const problems = [];
  if (result.status !== 200) problems.push(`${result.status} ${body.code || "CHAT_ERROR"}`);
  if (result.status === 200 && !String(body.message?.content || payload.message || "").trim()) problems.push("empty answer");
  if (BAD_VISIBLE_TERMS.test(text)) problems.push("technical term leaked");
  const inlineLinks = [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
  if (/https?:\/\//i.test(text) || inlineLinks.some((href) => !href.startsWith("/"))) problems.push("unapproved inline link");
  for (const item of navigation) {
    if (!item || typeof item.href !== "string" || !item.href.startsWith("/")) problems.push("invalid navigation href");
    if (!item.label || !item.description) problems.push("incomplete navigation item");
  }
  if (user.role !== "super_admin" && CROSS_COMPANY.test(question)) {
    if (provider !== "role-policy") problems.push(`cross-company answer not role-policy (${provider})`);
    if (navigation.length) problems.push("cross-company answer exposed navigation");
  }
  return { ok: problems.length === 0, problems, provider, route: body.intent_route || "unknown", navigation: navigation.map((item) => `${item.label} -> ${item.href}`), text: [body.message?.content, payload.message, ...(payload.details || [])].filter((value) => typeof value === "string").join(" ").slice(0, 600) };
}

const browser = await chromium.launch({ headless: true });
let total = 0;
let passed = 0;
const failures = [];
for (const user of USERS.filter((candidate) => !ONLY_ROLE || candidate.role === ONLY_ROLE)) {
  const session = await mintSession(user.email);
  const baseHost = new URL(BASE_URL).hostname;
  const isLocal = baseHost === "localhost" || baseHost === "127.0.0.1";
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(cookieChunks(`sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`, session).map((c) => ({ ...c, domain: baseHost, path: "/", secure: !isLocal, httpOnly: false, sameSite: "Lax", expires: Math.floor(Date.now() / 1000) + 86400 })));
  const page = await context.newPage();
  await page.goto(`${BASE_URL}${user.prefix}${user.landing}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  const frontend = await getFrontendContext(page);
  const questions = ONE_QUESTION ? [ONE_QUESTION] : ROLE_QUESTIONS[user.role];
  let rolePassed = 0;
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const result = validate(user, question, await ask(page, user, question, frontend, i));
    if (CHECK_LINKS) {
      const links = [...result.text.matchAll(/\[[^\]]+\]\((\/[^)]+)\)/g)].map((match) => match[1]);
      for (const href of links) {
        const linkResponse = await page.request.get(`${BASE_URL}${href}`);
        if (linkResponse.status() >= 400) {
          result.ok = false;
          result.problems.push(`linked page ${href} returned ${linkResponse.status()}`);
        }
      }
    }
    if (SHOW_NAVIGATION) console.log(`NAV [${user.role}] ${question} :: ${result.navigation.join(" | ") || "none"}`);
    if (SHOW_ANSWER) console.log(`ANSWER [${user.role}] ${question} :: ${result.text}`);
    total++;
    if (result.ok) { passed++; rolePassed++; }
    else failures.push({ role: user.role, question, ...result });
    console.log(`${result.ok ? "PASS" : "FAIL"} [${user.role}] ${i + 1}/${questions.length} ${question} :: ${result.provider} :: ${result.route}`);
  }
  console.log(`ROLE ${user.role}: ${rolePassed}/${questions.length} passed; frontend controls=${frontend.controls.length}, tags=${frontend.tags.length}, sections=${frontend.sections.length}`);
  await context.close();
}
await browser.close();
console.log(`\nCHAT QA TOTAL: ${passed}/${total} passed; failures=${failures.length}`);
if (failures.length) console.log(JSON.stringify(failures, null, 2));
process.exitCode = failures.length ? 1 : 0;
