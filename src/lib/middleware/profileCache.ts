/**
 * Signed-cookie cache for the per-request profile + company fetch
 * the middleware does on every authenticated route.
 *
 * Without this, every page navigation triggers two DB queries (profiles
 * + companies) plus the auth.getUser() JWT revalidation. The cookie
 * caches the static fields the middleware actually reads (role,
 * company_id, slug, onboarding_completed_at_ms) for a short TTL so
 * rapid navigations don't compound DB load.
 *
 * Security:
 *   - HMAC-SHA256 signed with MIDDLEWARE_PROFILE_SECRET
 *   - Includes uid so a stolen cookie can't be replayed across sessions
 *   - Includes exp so stale data doesn't sit forever
 *   - HttpOnly + SameSite=Lax + Secure in prod
 *
 * On cache miss, the middleware runs the original DB queries and then
 * re-signs a fresh cookie. Role / slug / onboarding state changes
 * propagate within TTL_SECONDS.
 *
 * P2-15 from the 2026-05 audit.
 */
import type { NextRequest, NextResponse } from "next/server";

export interface CachedProfilePayload {
  v?: number;
  uid: string;
  role: string | null;
  roles?: string[];
  company_id: string | null;
  slug: string | null;
  onboarding_completed_at: string | null;
  /** Company subscription_status, for the expired-plan access gate.
   *  Optional so cookies signed before this field shipped still parse. */
  subscription_status?: string | null;
  exp: number; // unix seconds
}

const COOKIE_NAME = "cms.mw.profile";
const CACHE_VERSION = 2;
const TTL_SECONDS = 300; // 5 minutes

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (s: string): Uint8Array => {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

let cachedKey: CryptoKey | null = null;
async function getKey(secret: string): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cachedKey;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return b64url(sig);
}

export async function readCachedProfile(
  request: NextRequest,
  userId: string,
): Promise<CachedProfilePayload | null> {
  const secret = process.env.MIDDLEWARE_PROFILE_SECRET;
  if (!secret) return null;

  const raw = request.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const dot = raw.indexOf(".");
  if (dot < 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  const expected = await sign(body, secret);
  if (!constantTimeEqual(expected, sig)) return null;

  let payload: CachedProfilePayload;
  try {
    const json = new TextDecoder().decode(fromB64url(body));
    payload = JSON.parse(json) as CachedProfilePayload;
  } catch {
    return null;
  }

  if (payload.uid !== userId) return null;
  if (payload.v !== CACHE_VERSION) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < nowSec) return null;

  return payload;
}

export async function writeCachedProfile(
  response: NextResponse,
  payload: Omit<CachedProfilePayload, "exp">,
): Promise<void> {
  const secret = process.env.MIDDLEWARE_PROFILE_SECRET;
  if (!secret) return;

  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const full: CachedProfilePayload = { ...payload, v: CACHE_VERSION, exp };
  const body = b64url(enc.encode(JSON.stringify(full)));
  const sig = await sign(body, secret);
  const value = `${body}.${sig}`;

  response.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export function clearCachedProfile(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}
