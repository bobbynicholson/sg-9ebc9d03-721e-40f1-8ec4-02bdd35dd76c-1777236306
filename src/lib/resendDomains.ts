/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * Server-side wrapper around Resend's Domains API. The platform holds
 * a single RESEND_API_KEY on Vercel; each tenant verifies their own
 * sending domain through it. See:
 *   https://resend.com/docs/api-reference/domains
 *
 * Every helper here returns either the Resend response body or an
 * object of shape { error: string } so callers can render a clear
 * message. Network errors and missing-API-key cases are normalised
 * into the same shape so the UI never has to distinguish.
 */

const RESEND_BASE = "https://api.resend.com";

export interface ResendDnsRecord {
  record: string;            // 'DKIM' | 'SPF' | 'MX' | etc
  name: string;              // hostname to enter at the DNS host
  value: string;             // the record value
  type: string;              // 'TXT' | 'MX' | 'CNAME'
  ttl?: string | number;     // 'Auto' from Resend, occasionally a number
  priority?: number;         // MX records only
  status?: string;           // 'pending' | 'verified' | 'failed'
}

export interface ResendDomain {
  id: string;
  name: string;
  status: string;            // 'pending' | 'verified' | 'failed' | 'temporary_failure'
  records?: ResendDnsRecord[];
  region?: string;
  created_at?: string;
}

export interface ResendDomainError {
  error: string;
  status?: number;
}

function getApiKey(): string | null {
  const key = process.env.RESEND_API_KEY;
  if (!key || typeof key !== "string" || key.length < 10) return null;
  return key;
}

async function resendFetch(path: string, init: RequestInit = {}): Promise<any> {
  const key = getApiKey();
  if (!key) {
    return {
      error:
        "Resend API key is missing. Ask your CateringMS admin to add RESEND_API_KEY to the Vercel environment.",
      status: 0,
    } satisfies ResendDomainError;
  }

  let response: Response;
  try {
    response = await fetch(`${RESEND_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (e: any) {
    return {
      error: `Could not reach Resend: ${e?.message || "network error"}`,
      status: 0,
    } satisfies ResendDomainError;
  }

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body?.message ||
      body?.error ||
      `Resend returned ${response.status}`;
    return {
      error: String(message),
      status: response.status,
    } satisfies ResendDomainError;
  }

  return body;
}

export async function createResendDomain(
  domain: string,
  region: string = "us-east-1",
): Promise<ResendDomain | ResendDomainError> {
  const result = await resendFetch("/domains", {
    method: "POST",
    body: JSON.stringify({ name: domain, region }),
  });
  return result;
}

export async function getResendDomain(
  domainId: string,
): Promise<ResendDomain | ResendDomainError> {
  return resendFetch(`/domains/${encodeURIComponent(domainId)}`, {
    method: "GET",
  });
}

/**
 * Trigger Resend to re-check a domain's DNS now. Without this, Resend
 * only re-checks on its own internal schedule and a domain can sit in
 * 'not_started' indefinitely after the records are live. The endpoint
 * returns the domain object with the freshest status; callers should
 * still GET /domains/{id} after to fetch the updated record list.
 *
 * https://resend.com/docs/api-reference/domains/verify-domain
 */
export async function verifyResendDomain(
  domainId: string,
): Promise<ResendDomain | ResendDomainError> {
  return resendFetch(`/domains/${encodeURIComponent(domainId)}/verify`, {
    method: "POST",
  });
}

/**
 * List every domain registered under our Resend account.
 *
 * Used when createResendDomain returns "already registered" - we look
 * up the existing record by name and reuse its DNS records rather than
 * making the operator re-register a domain that's already there. This
 * happens when an earlier test left a domain in Resend but the local
 * email_provider_settings row got cleaned up.
 */
export async function listResendDomains(): Promise<
  ResendDomain[] | ResendDomainError
> {
  const result = await resendFetch(`/domains`, { method: "GET" });
  if (isResendError(result)) return result;
  // Resend returns either { data: [...] } or a bare array depending on
  // version. Normalise.
  const list = Array.isArray(result) ? result : (result as any)?.data;
  if (!Array.isArray(list)) {
    return {
      error: "Unexpected response from Resend listing domains.",
      status: 0,
    } satisfies ResendDomainError;
  }
  return list as ResendDomain[];
}

/**
 * Detect Resend's "already registered" error. Resend's exact wording
 * has shifted over time so we match the common phrases rather than
 * the error code, which has changed too.
 */
export function isAlreadyRegisteredError(
  err: ResendDomainError | null | undefined,
): boolean {
  if (!err || !err.error) return false;
  const msg = err.error.toLowerCase();
  return (
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("domain has been registered")
  );
}

export async function deleteResendDomain(
  domainId: string,
): Promise<{ deleted: boolean } | ResendDomainError> {
  const result = await resendFetch(`/domains/${encodeURIComponent(domainId)}`, {
    method: "DELETE",
  });
  if (result && result.error) return result as ResendDomainError;
  return { deleted: true };
}

export function isResendError(x: any): x is ResendDomainError {
  return x && typeof x === "object" && typeof x.error === "string";
}

/**
 * Normalise a domain string the operator typed into a canonical
 * lowercase apex/subdomain. Strips protocol, paths, www prefix, and
 * any whitespace. Returns null if it doesn't look like a real domain.
 */
export function normaliseDomain(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.replace(/^www\./, "");
  d = d.split("/")[0];
  d = d.split("?")[0];
  d = d.replace(/\/+$/, "");
  // Very loose check - at least one dot, only allowed chars.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
  if (d.length > 253) return null;
  return d;
}
