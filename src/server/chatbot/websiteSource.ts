import dns from "node:dns/promises";
import net from "node:net";

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 20_000;

export interface WebsiteSourceResult {
  text: string;
  title: string | null;
  requestedUrl: string;
  finalUrl: string;
  fetchedAt: string;
}

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
      normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
  }
  return true;
}

export async function assertPublicWebsiteUrl(value: unknown): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new Error("Enter a valid public http or https website URL");
  }
  if (!(["http:", "https:"].includes(parsed.protocol)) || parsed.username || parsed.password) {
    throw new Error("Only public http or https website URLs are supported");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (["localhost", "localhost.localdomain", "0.0.0.0", "::", "::1"].includes(hostname) || isPrivateIp(hostname)) {
    throw new Error("Private and local network URLs are not allowed");
  }
  try {
    const addresses = net.isIP(hostname) ? [hostname] : (await dns.lookup(hostname, { all: true })).map((item) => item.address);
    if (!addresses.length || addresses.some(isPrivateIp)) throw new Error("Private and local network URLs are not allowed");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Private and local")) throw error;
    throw new Error("The website host could not be resolved");
  }
  return parsed;
}

async function readLimited(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_HTML_BYTES) throw new Error("The website page is larger than the 5 MB limit");
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_HTML_BYTES) throw new Error("The website page is larger than the 5 MB limit");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (full, entity: string) => {
    if (entity.toLowerCase().startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] || full;
  });
}

export function extractWebsiteText(html: string): { text: string; title: string | null } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 240) || null : null;
  const content = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|section|article|main|header|footer|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(content)
    .replace(/[ \t\f\r]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .split("\n").map((line) => line.trim()).filter(Boolean).join("\n")
    .trim();
  if (text.length < 80) throw new Error("The website page did not contain enough readable text to index");
  return { text: text.slice(0, 200_000), title };
}

export async function fetchWebsiteSource(value: unknown): Promise<WebsiteSourceResult> {
  const requested = await assertPublicWebsiteUrl(value);
  let current = requested;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicWebsiteUrl(current.toString());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "CateringMS-KnowledgeBot/1.0" },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("The website took too long to respond");
      throw new Error("The website could not be fetched");
    } finally {
      clearTimeout(timeout);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("The website has too many redirects");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`The website returned HTTP ${response.status}`);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("The website URL must return an HTML page");
    }
    const extracted = extractWebsiteText(await readLimited(response));
    return { ...extracted, requestedUrl: requested.toString(), finalUrl: current.toString(), fetchedAt: new Date().toISOString() };
  }
  throw new Error("The website could not be fetched");
}
