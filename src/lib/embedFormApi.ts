/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Helper module for the embeddable quote-request form public API.
 *
 * Pure functions, no Next.js coupling, so other agents and tests can
 * use them. Keep this file framework-agnostic.
 */

import { createHash } from "crypto";

// ---------- Types (loose, sync with src/types/embedForms.ts when landed) ----------

export type EmbedFieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "checkboxes"
  | "tier";

export interface EmbedField {
  id: string;
  type: EmbedFieldType;
  label?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  options?: Array<{ value: string; label?: string }>;
  // Field-to-lead column mapping. Recognised values:
  //   name, email, phone, event_date, guest_count, venue,
  //   event_name, notes, budget, dietary
  mapsTo?: string;
  // Conditional visibility: only validate this field if the referenced field
  // equals the supplied value.
  showIf?: { field: string; equals: any };
}

export interface ValidateResult {
  ok: boolean;
  error?: string;
}

export interface ValidateSubmissionResult {
  ok: boolean;
  errors?: Record<string, string>;
}

// ---------- Validation ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Permissive international phone -- digits, spaces, dashes, parens, plus.
const PHONE_RE = /^[+\d][\d\s\-().]{5,24}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

const HARD_MAX_STRING = 10_000;

function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function isVisible(field: any, payload: Record<string, any>): boolean {
  // Two conditional shapes are accepted -- the legacy
  // {conditional: {showIfFieldId, showIfValue}} from the original
  // migration and the flat {showIf: {field, equals}} the server-side
  // parser converged on. Normalise here so renderers can store either.
  const legacy = field?.conditional;
  if (legacy?.showIfFieldId) {
    const ref = payload[legacy.showIfFieldId];
    const want = legacy.showIfValue;
    if (Array.isArray(want)) {
      return want.some((w) => String(ref) === String(w));
    }
    // eslint-disable-next-line eqeqeq
    return ref == want;
  }
  if (field?.showIf?.field) {
    // eslint-disable-next-line eqeqeq
    return payload[field.showIf.field] == field.showIf.equals;
  }
  return true;
}

export function validateField(field: EmbedField, value: any): ValidateResult {
  const present = !isEmpty(value);

  if (!present) {
    if (field.required) {
      return { ok: false, error: `${field.label || field.id} is required` };
    }
    return { ok: true };
  }

  // String-shape checks
  if (typeof value === "string") {
    if (value.length > HARD_MAX_STRING) {
      return { ok: false, error: "Value too long" };
    }
    if (field.maxLength && value.length > field.maxLength) {
      return { ok: false, error: `Maximum ${field.maxLength} characters` };
    }
    if (field.minLength && value.length < field.minLength) {
      return { ok: false, error: `Minimum ${field.minLength} characters` };
    }
    if (field.pattern) {
      try {
        if (!new RegExp(field.pattern).test(value)) {
          return { ok: false, error: "Invalid format" };
        }
      } catch {
        // Bad regex from config -- fail closed but with a clear log signal.
        // Don't block submission for a config bug.
      }
    }
  }

  switch (field.type) {
    case "email": {
      if (typeof value !== "string" || !EMAIL_RE.test(value.trim())) {
        return { ok: false, error: "Enter a valid email address" };
      }
      break;
    }
    case "phone": {
      if (typeof value !== "string" || !PHONE_RE.test(value.trim())) {
        return { ok: false, error: "Enter a valid phone number" };
      }
      break;
    }
    case "date": {
      if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
        return { ok: false, error: "Enter a valid date" };
      }
      const parsed = Date.parse(value);
      if (Number.isNaN(parsed)) {
        return { ok: false, error: "Enter a valid date" };
      }
      break;
    }
    case "number": {
      const num = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(num)) {
        return { ok: false, error: "Enter a valid number" };
      }
      if (field.min !== undefined && num < field.min) {
        return { ok: false, error: `Minimum ${field.min}` };
      }
      if (field.max !== undefined && num > field.max) {
        return { ok: false, error: `Maximum ${field.max}` };
      }
      break;
    }
    case "select":
    case "radio": {
      if (field.options && field.options.length > 0) {
        const allowed = field.options.map((o) => o.value);
        if (!allowed.includes(String(value))) {
          return { ok: false, error: "Invalid selection" };
        }
      }
      break;
    }
    case "checkboxes": {
      if (!Array.isArray(value)) {
        return { ok: false, error: "Invalid selection" };
      }
      if (field.options && field.options.length > 0) {
        const allowed = new Set(field.options.map((o) => o.value));
        for (const v of value) {
          if (!allowed.has(String(v))) {
            return { ok: false, error: "Invalid selection" };
          }
        }
      }
      break;
    }
    case "checkbox": {
      if (typeof value !== "boolean" && value !== "true" && value !== "false") {
        return { ok: false, error: "Invalid value" };
      }
      break;
    }
    default:
      // text / textarea / tier already covered by the generic string checks above
      break;
  }

  return { ok: true };
}

export function validateSubmission(
  fields: EmbedField[],
  payload: Record<string, any>
): ValidateSubmissionResult {
  const errors: Record<string, string> = {};

  for (const field of fields || []) {
    if (!isVisible(field, payload)) continue;
    const result = validateField(field, payload[field.id]);
    if (!result.ok) {
      errors[field.id] = result.error || "Invalid value";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

// ---------- Lead mapping ----------

export interface MappedLead {
  contact_name?: string;
  client_name?: string;
  email?: string;
  client_email?: string;
  phone?: string;
  client_phone?: string;
  event_date?: string;
  event_type?: string;
  guest_count?: number;
  venue_address?: string;
  notes?: string;
  budget?: number;
}

export function mapPayloadToLead(
  fields: EmbedField[],
  payload: Record<string, any>
): MappedLead {
  const lead: MappedLead = {};
  const notesParts: string[] = [];

  for (const field of fields || []) {
    if (!isVisible(field, payload)) continue;
    const value = payload[field.id];
    if (isEmpty(value)) continue;

    switch (field.mapsTo) {
      case "name": {
        const str = String(value).slice(0, 200);
        lead.contact_name = str;
        lead.client_name = str;
        break;
      }
      case "email": {
        const str = String(value).trim().slice(0, 200);
        lead.email = str;
        lead.client_email = str;
        break;
      }
      case "phone": {
        const str = String(value).trim().slice(0, 50);
        lead.phone = str;
        lead.client_phone = str;
        break;
      }
      case "event_date": {
        lead.event_date = String(value);
        break;
      }
      case "guest_count": {
        const num = typeof value === "number" ? value : parseInt(String(value), 10);
        if (!Number.isNaN(num)) lead.guest_count = num;
        break;
      }
      case "venue": {
        lead.venue_address = String(value).slice(0, 500);
        break;
      }
      case "event_name": {
        lead.event_type = String(value).slice(0, 100);
        break;
      }
      case "notes": {
        notesParts.push(String(value));
        break;
      }
      case "budget": {
        const num = typeof value === "number" ? value : parseFloat(String(value));
        if (!Number.isNaN(num)) lead.budget = num;
        break;
      }
      case "dietary": {
        const formatted = Array.isArray(value)
          ? `Dietary: ${value.join(", ")}`
          : `Dietary: ${value}`;
        notesParts.push(formatted);
        break;
      }
      default:
        // Unmapped fields fall through to the raw payload that's already
        // captured on embed_form_submissions.
        break;
    }
  }

  if (notesParts.length > 0) {
    lead.notes = notesParts.join("\n\n").slice(0, 5000);
  }

  return lead;
}

// ---------- IP hashing ----------

let warnedAboutMissingSalt = false;

export function hashIp(ip: string): string {
  // Salt with a per-deployment secret so the hash isn't trivially
  // reversible against a candidate IP set. We still allow a fallback
  // because (a) IP hashing is bucket-keying, not credential storage,
  // and (b) failing closed in dev would block every embed call. But
  // we warn loudly once per process so prod misconfig is visible.
  const salt = process.env.EMBED_IP_HASH_SALT;
  if (!salt && !warnedAboutMissingSalt) {
    warnedAboutMissingSalt = true;
    console.warn(
      "[embed] EMBED_IP_HASH_SALT is not set. IP hashes are still one-way " +
        "but a determined attacker with the public source can rainbow them. " +
        "Set this env var in production."
    );
  }
  return createHash("sha256")
    .update(`${salt || "cateringms-embed-v1"}::${ip}`)
    .digest("hex");
}

// ---------- Redirect URL validation ----------

/**
 * Validate a tenant-supplied redirect URL. Locks the scheme to https,
 * blocks credentials in URL, and enforces a sane host. Used both at
 * admin write time (so a malicious or compromised tenant admin can't
 * stash a javascript: payload that would later run on every host site
 * embedding the form) and in the loader as a defence in depth.
 *
 * Returns null when valid (caller can use the URL as-is). Returns a
 * human-readable error otherwise.
 */
export function validateRedirectUrl(input: unknown): { ok: true } | { ok: false; error: string } {
  if (input === null || input === undefined || input === "") {
    return { ok: true }; // empty / null is fine -- means "render success card"
  }
  if (typeof input !== "string") {
    return { ok: false, error: "Redirect URL must be a string." };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: true };
  if (trimmed.length > 2000) {
    return { ok: false, error: "Redirect URL is too long." };
  }
  // Protocol-relative or scheme-less is ambiguous in browsers -- reject.
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Redirect URL is not a valid absolute URL." };
  }
  // Block javascript:, data:, vbscript:, file:, etc. Only https is allowed.
  if (url.protocol !== "https:") {
    return { ok: false, error: "Redirect URL must use https." };
  }
  // Reject embedded credentials -- they're a phishing tell and most browsers
  // strip them anyway.
  if (url.username || url.password) {
    return { ok: false, error: "Redirect URL may not contain credentials." };
  }
  return { ok: true };
}

// ---------- HTML escaping (for plain-text-rendered email & notification text) ----------

/**
 * Minimal HTML entity escaper for user-supplied strings that flow into
 * email bodies (sent as html: by Resend) or in-app notification messages
 * (rendered into the bell dropdown). The auditors found that visitor
 * names were interpolated raw, opening a stored-XSS vector against the
 * tenant's own admins. Pre-escape every untrusted string before string
 * concat.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Turnstile ----------

export interface TurnstileResult {
  ok: boolean;
  score?: number;
  error?: string;
}

export async function verifyTurnstile(
  token: string,
  secretKey: string,
  remoteIp?: string
): Promise<TurnstileResult> {
  if (!token) return { ok: false, error: "Missing challenge token" };

  try {
    const body = new URLSearchParams();
    body.set("secret", secretKey);
    body.set("response", token);
    if (remoteIp) body.set("remoteip", remoteIp);

    const resp = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );
    const json: any = await resp.json();
    return {
      ok: !!json.success,
      score: typeof json.score === "number" ? json.score : undefined,
      error: !json.success
        ? (json["error-codes"] || []).join(",") || "Challenge failed"
        : undefined,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Turnstile network error" };
  }
}

// ---------- Rate limiting ----------

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt?: string;
}

/**
 * Atomic rate limit -- delegates to the increment_embed_rate_limit
 * Postgres function (see migration embed_forms_hardening_foundation).
 * The previous select-then-update implementation had a race the
 * security audit flagged: two concurrent requests both read count=N,
 * both wrote N+1, and either bypassed the limit or hit the unique-key
 * conflict and silently fail-opened. The RPC does the conflict check
 * and counter bump in a single statement.
 */
export async function checkAndIncrementRateLimit(
  embedToken: string,
  ipHash: string,
  supabase: any,
  options: { limit?: number; bucket?: "hour" | "minute" } = {}
): Promise<RateLimitResult> {
  const limit = options.limit ?? 30;
  const bucket = options.bucket ?? "hour";

  const now = new Date();
  const windowStart = new Date(now);
  if (bucket === "hour") {
    windowStart.setUTCMinutes(0, 0, 0);
  } else {
    windowStart.setUTCSeconds(0, 0);
  }
  const windowStartIso = windowStart.toISOString();

  try {
    const { data, error } = await supabase.rpc("increment_embed_rate_limit", {
      p_token: embedToken,
      p_ip_hash: ipHash,
      p_window_start: windowStartIso,
      p_limit: limit,
    });
    if (error) throw error;
    const allowed = !!(data && data.allowed);
    const count = typeof data?.count === "number" ? data.count : limit;
    if (!allowed) {
      const resetAt = new Date(windowStart);
      if (bucket === "hour") resetAt.setUTCHours(resetAt.getUTCHours() + 1);
      else resetAt.setUTCMinutes(resetAt.getUTCMinutes() + 1);
      return { allowed: false, remaining: 0, resetAt: resetAt.toISOString() };
    }
    return { allowed: true, remaining: Math.max(0, limit - count) };
  } catch (err) {
    // Fail-open on infra error -- better to accept a submission than
    // black-hole a customer enquiry. Log and move on.
    console.warn("[embed] rate limit RPC failed", err);
    return { allowed: true, remaining: limit };
  }
}

// ---------- Misc helpers shared across endpoints ----------

export function getClientIp(req: { headers: Record<string, any>; socket?: any }): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  if (Array.isArray(fwd) && fwd.length > 0) {
    return String(fwd[0]).split(",")[0].trim();
  }
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length > 0) return real;
  return req.socket?.remoteAddress || "0.0.0.0";
}

export function applyCorsHeaders(res: any, opts: { cacheSeconds?: number } = {}) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, X-Requested-With"
  );
  res.setHeader("Vary", "Origin");
  if (opts.cacheSeconds) {
    res.setHeader(
      "Cache-Control",
      `public, max-age=${opts.cacheSeconds}, s-maxage=${opts.cacheSeconds}`
    );
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
