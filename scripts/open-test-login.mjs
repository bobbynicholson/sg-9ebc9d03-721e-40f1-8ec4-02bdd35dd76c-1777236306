import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const profilesRoot = path.join(repoRoot, ".browser-profiles");

const BASE_URL = "https://cateringms.com";
const COMPANY_SLUG = "spit-braai-delivery";

const ACCOUNTS = {
  "super-admin": {
    label: "Super Admin",
    email: "bobby@skylight-digital.co.za",
    redirectTo: `${BASE_URL}/auth/callback`,
    landing: `${BASE_URL}/admin/platform/dashboard`,
  },
  "company-admin": {
    label: "Company Admin",
    email: "hello@spitbraaidelivery.co.za",
    redirectTo: `${BASE_URL}/auth/callback`,
    landing: `${BASE_URL}/${COMPANY_SLUG}/admin/dashboard`,
  },
  admin: {
    label: "Admin",
    email: "admin@spitbraaidelivery.co.za",
    redirectTo: `${BASE_URL}/auth/callback`,
    landing: `${BASE_URL}/${COMPANY_SLUG}/admin/dashboard`,
  },
  kitchen: {
    label: "Kitchen Staff",
    email: "kitchen@spitbraaidelivery.co.za",
    redirectTo: `${BASE_URL}/auth/callback`,
    landing: `${BASE_URL}/${COMPANY_SLUG}/team-portal/kitchen/today`,
  },
  "kitchen-manager": {
    label: "Kitchen Manager",
    email: "kitchen.manager.demo@spitbraaidelivery.co.za",
    redirectTo: `${BASE_URL}/auth/callback`,
    landing: `${BASE_URL}/${COMPANY_SLUG}/team-portal/kitchen/today`,
  },
  driver: {
    label: "Driver",
    email: "driver@spitbraaidelivery.co.za",
    redirectTo: `${BASE_URL}/auth/callback`,
    landing: `${BASE_URL}/${COMPANY_SLUG}/team-portal/driver/dashboard`,
  },
  shopping: {
    label: "Shopping Staff",
    email: "shopping@spitbraaidelivery.co.za",
    redirectTo: `${BASE_URL}/auth/callback`,
    landing: `${BASE_URL}/${COMPANY_SLUG}/team-portal/shopping/dashboard`,
  },
  cleaning: {
    label: "Cleaning Staff",
    email: "cleaning@spitbraaidelivery.co.za",
    redirectTo: `${BASE_URL}/auth/callback`,
    landing: `${BASE_URL}/${COMPANY_SLUG}/team-portal/cleaning/dashboard`,
  },
  "cleaning-manager": {
    label: "Cleaning Manager",
    email: "cleaning.manager.demo@spitbraaidelivery.co.za",
    redirectTo: `${BASE_URL}/auth/callback`,
    landing: `${BASE_URL}/${COMPANY_SLUG}/team-portal/cleaning/dashboard`,
  },
  client: {
    label: "Client",
    email: "universalsportmags23@gmail.com",
    redirectTo: `${BASE_URL}/${COMPANY_SLUG}/auth/callback?next=/client-portal/dashboard`,
    landing: `${BASE_URL}/${COMPANY_SLUG}/client-portal/dashboard`,
  },
};

const GROUPS = {
  all: [
    "super-admin",
    "company-admin",
    "admin",
    "kitchen-manager",
    "kitchen",
    "driver",
    "shopping",
    "cleaning-manager",
    "cleaning",
    "client",
  ],
  admins: ["super-admin", "company-admin", "admin"],
  staff: [
    "kitchen-manager",
    "kitchen",
    "driver",
    "shopping",
    "cleaning-manager",
    "cleaning",
  ],
  "kitchen-team": ["kitchen-manager", "kitchen"],
  drivers: ["driver"],
  "cleaning-team": ["cleaning-manager", "cleaning"],
  clients: ["client"],
};

const ALIASES = {
  platform: "super-admin",
  superadmin: "super-admin",
  companyadmin: "company-admin",
  kitchenmanager: "kitchen-manager",
  cleaningmanager: "cleaning-manager",
  owner: "company-admin",
  cleaner: "cleaning",
  "cleaner-manager": "cleaning-manager",
  customer: "client",
  customers: "clients",
};

function debugLog(message) {
  if (process.env.GO_LOGIN_DEBUG === "1") {
    console.log(`[debug] ${message}`);
  }
}

function parseEnvFile() {
  const envPath = path.join(repoRoot, ".env.local");
  const env = { ...process.env };

  if (!existsSync(envPath)) {
    return env;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    env[key] = value;
  }

  return env;
}

function safeProfileName(name) {
  const clean = String(name || "").trim().replace(/\s+/g, "-").toLowerCase();
  if (!clean || clean === "." || clean === ".." || /[\\/:*?"<>|]/.test(clean)) {
    throw new Error(`Invalid profile name: ${name}`);
  }
  return clean;
}

function candidateBrowserPaths(preferred) {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA || "";

  const chrome = [
    process.env.CHROME_PATH,
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    localAppData && path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);

  const edge = [
    process.env.EDGE_PATH,
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    localAppData && path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter(Boolean);

  return preferred === "edge" ? [...edge, ...chrome] : [...chrome, ...edge];
}

function resolveBrowser(preferred) {
  for (const candidate of candidateBrowserPaths(preferred)) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not find Chrome or Edge.");
}

function getProfileDir(profileName) {
  const safeName = safeProfileName(profileName);
  const profileDir = path.join(profilesRoot, safeName);
  const rootFull = path.resolve(profilesRoot) + path.sep;
  const targetFull = path.resolve(profileDir);

  if (!targetFull.startsWith(rootFull)) {
    throw new Error("Refusing to open a profile outside .browser-profiles.");
  }

  mkdirSync(profileDir, { recursive: true });
  return { safeName, profileDir };
}

function openBrowserProfile(profileName, url, browserPath) {
  const { profileDir } = getProfileDir(profileName);

  const args = [
    `--user-data-dir=${profileDir}`,
    "--profile-directory=Default",
    "--no-first-run",
    "--no-default-browser-check",
    "--start-maximized",
    "--new-window",
    url,
  ];

  const child = spawn(browserPath, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function base64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sessionCookieChunks(storageKey, session) {
  const encoded = `base64-${base64Url(JSON.stringify(session))}`;
  const chunkSize = 3180;

  if (encoded.length <= chunkSize) {
    return [{ name: storageKey, value: encoded }];
  }

  const chunks = [];
  for (let i = 0; i < encoded.length; i += chunkSize) {
    chunks.push({
      name: `${storageKey}.${chunks.length}`,
      value: encoded.slice(i, i + chunkSize),
    });
  }
  return chunks;
}

function getStorageKey(supabaseUrl) {
  const host = new URL(supabaseUrl).hostname;
  const projectRef = host.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error("Could not allocate a debugging port."));
        else resolve(port);
      });
    });
  });
}

async function waitForJson(url, timeoutMs = 8000) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function connectToPageOnPort(port) {
  await waitForJson(`http://127.0.0.1:${port}/json/version`, 3000);
  const pages = await waitForJson(`http://127.0.0.1:${port}/json/list`, 3000);
  const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) {
    throw new Error(`Could not find a debuggable page on port ${port}.`);
  }

  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  return cdp;
}

async function connectExistingProfile(profileDir) {
  const portFile = path.join(profileDir, "DevToolsActivePort");
  if (!existsSync(portFile)) return null;

  try {
    const [portLine] = readFileSync(portFile, "utf8").split(/\r?\n/);
    const port = Number(portLine);
    if (!Number.isFinite(port)) return null;
    return await connectToPageOnPort(port);
  } catch {
    return null;
  }
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || "CDP error"));
      else pending.resolve(message.result);
    });

    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    this.ws.send(payload);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timed out calling ${method}`));
        }
      }, 12000);
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
  }
}

async function startAutomatedBrowser(profileName, browserPath) {
  const port = await getFreePort();
  const { profileDir, safeName } = getProfileDir(profileName);

  const existing = await connectExistingProfile(profileDir);
  if (existing) {
    debugLog(`connected to existing automated browser for ${safeName}`);
    return { cdp: existing, safeName };
  }

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--profile-directory=Default",
    "--no-first-run",
    "--no-default-browser-check",
    "--start-maximized",
    "--window-position=0,0",
    "--window-size=1550,950",
    "about:blank",
  ];

  const child = spawn(browserPath, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`, 7000);
  } catch (error) {
    const existingAfterLaunch = await connectExistingProfile(profileDir);
    if (existingAfterLaunch) {
      debugLog(`connected to existing automated browser for ${safeName} after launch`);
      return { cdp: existingAfterLaunch, safeName };
    }
    throw new Error(`Profile '${safeName}' may already be open without automation.`);
  }

  const cdp = await connectToPageOnPort(port);
  return { cdp, safeName };
}

async function seedSessionAndOpen({ profileName, browserPath, storageKey, session, landingUrl }) {
  let actualProfileName = profileName;
  let browser;

  try {
    debugLog(`starting browser for ${actualProfileName}`);
    browser = await startAutomatedBrowser(actualProfileName, browserPath);
  } catch (error) {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    actualProfileName = `${profileName}-run-${stamp}`;
    console.warn(`${error.message} Using '${actualProfileName}' instead.`);
    debugLog(`starting fallback browser for ${actualProfileName}`);
    browser = await startAutomatedBrowser(actualProfileName, browserPath);
  }

  const { cdp } = browser;
  const cookies = sessionCookieChunks(storageKey, session);
  const expires = Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60;

  try {
    debugLog(`setting cookies for ${actualProfileName}`);
    await cdp.send("Network.enable");

    const staleNames = [
      storageKey,
      `${storageKey}.0`,
      `${storageKey}.1`,
      `${storageKey}.2`,
      `${storageKey}.3`,
      `${storageKey}.4`,
    ];

    for (const name of staleNames) {
      await cdp.send("Network.deleteCookies", {
        name,
        domain: "cateringms.com",
        path: "/",
      }).catch(() => {});
    }

    for (const cookie of cookies) {
      const result = await cdp.send("Network.setCookie", {
        name: cookie.name,
        value: cookie.value,
        domain: "cateringms.com",
        path: "/",
        secure: true,
        httpOnly: false,
        sameSite: "Lax",
        expires,
        url: BASE_URL,
      });

      if (result?.success === false) {
        throw new Error(`Chrome rejected cookie ${cookie.name}`);
      }
    }

    debugLog(`navigating ${actualProfileName} to ${landingUrl}`);
    await cdp.send("Page.enable");
    await cdp.send("Page.navigate", { url: landingUrl });
    await new Promise((resolve) => setTimeout(resolve, 4500));

    debugLog(`reading page state for ${actualProfileName}`);
    let result = null;
    let verifyError = "";
    try {
      result = await cdp.send("Runtime.evaluate", {
        expression: `({ href: location.href, title: document.title, text: document.body.innerText.slice(0, 300) })`,
        returnByValue: true,
      });
    } catch (error) {
      // The browser is already open and the session cookie is already set.
      // A busy page can occasionally miss this verification call; don't turn
      // that into a failed login launch.
      verifyError = error?.message || "verification skipped";
    }

    return {
      profileName: actualProfileName,
      href: result?.result?.value?.href || landingUrl,
      title: result?.result?.value?.title || "",
      text: result?.result?.value?.text || "",
      verifyError,
    };
  } finally {
    cdp.close();
  }
}

async function sessionFromMagicLink(supabase, anonClient, account) {
  debugLog(`generating magic link for ${account.email}`);
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: account.email,
    options: { redirectTo: account.redirectTo },
  });

  if (error || !data?.properties?.action_link) {
    throw new Error(error?.message || "No action link returned");
  }

  const response = await fetch(data.properties.action_link, { redirect: "manual" });
  const location = response.headers.get("location") || "";
  const url = new URL(location);
  const params = new URLSearchParams(url.hash.replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (!accessToken || !refreshToken) {
    throw new Error("Magic link did not return access and refresh tokens.");
  }

  debugLog(`creating session for ${account.email}`);
  const { data: sessionData, error: sessionError } = await anonClient.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError || !sessionData?.session) {
    throw new Error(sessionError?.message || "Could not create a browser session.");
  }

  return sessionData.session;
}

function usage() {
  console.log(`Usage:
  .\\go admin -Login
  .\\go staff -Login
  .\\go -All -Login
  node scripts\\open-test-login.mjs --all --validate

Built-in users:
  Run --list to show every covered user.

Groups:
  admins, staff, kitchen-team, drivers, cleaning-team, clients, all`);
}

function parseArgs(argv) {
  const result = {
    names: [],
    browser: "chrome",
    list: false,
    all: false,
    validate: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const lower = arg.toLowerCase();

    if (lower === "--help" || lower === "-h" || lower === "/?") {
      result.help = true;
    } else if (lower === "--list" || lower === "-list") {
      result.list = true;
    } else if (lower === "--all" || lower === "-all") {
      result.all = true;
    } else if (lower === "--validate" || lower === "-validate") {
      result.validate = true;
    } else if (lower === "--browser" || lower === "-browser") {
      result.browser = (argv[i + 1] || "chrome").toLowerCase();
      i += 1;
    } else {
      result.names.push(arg);
    }
  }

  return result;
}

function expandNames(names, all) {
  if (all) return GROUPS.all;
  if (names.length === 0) return [];

  const expanded = [];
  for (const rawName of names) {
    const normalized = safeProfileName(rawName);
    const alias = ALIASES[normalized] || normalized;
    const group = GROUPS[alias];

    if (group) {
      expanded.push(...group);
    } else {
      expanded.push(alias);
    }
  }

  return [...new Set(expanded)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    usage();
    return;
  }

  if (args.list) {
    console.log("Built-in test users:");
    for (const [name, account] of Object.entries(ACCOUNTS)) {
      console.log(`  ${name.padEnd(13)} ${account.email}`);
    }
    return;
  }

  const names = expandNames(args.names, args.all);
  if (names.length === 0) {
    usage();
    process.exitCode = 1;
    return;
  }

  const unknown = names.filter((name) => !ACCOUNTS[name]);
  if (unknown.length > 0) {
    console.error(`Unknown test user: ${unknown.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const env = parseEnvFile();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    process.exitCode = 1;
    return;
  }

  const browserPath = args.validate ? "" : resolveBrowser(args.browser === "edge" ? "edge" : "chrome");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const storageKey = getStorageKey(supabaseUrl);

  for (const name of names) {
    const account = ACCOUNTS[name];
    try {
      const session = await sessionFromMagicLink(supabase, anonClient, account);
      if (args.validate) {
        console.log(`OK     ${name.padEnd(18)} ${session.user?.email || account.email}`);
        continue;
      }
      const opened = await seedSessionAndOpen({
        profileName: name,
        browserPath,
        storageKey,
        session,
        landingUrl: account.landing,
      });
      const loginLooksGood = !opened.href.includes("/login") && !opened.text.includes("Welcome back");
      console.log(
        `Opened ${opened.profileName.padEnd(16)} ${account.email} -> ${opened.href}${opened.verifyError ? " (opened; verification skipped)" : loginLooksGood ? "" : " (check login)"}`,
      );
    } catch (error) {
      console.error(`FAIL ${name}: ${error?.message || error}`);
      continue;
    }
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
