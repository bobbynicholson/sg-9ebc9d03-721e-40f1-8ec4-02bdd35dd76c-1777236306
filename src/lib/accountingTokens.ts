/**
 * Phase 5 #6: shared OAuth token refresh + force-refresh helpers for
 * the Xero and QuickBooks integrations.
 *
 * Before this file, /api/accounting/xero/sync-invoice, sync-credit-
 * note and /api/accounting/quickbooks/sync-invoice each had their
 * own copy of ensureFreshAccessToken with the same shape but per-
 * provider URL + creds. Three implementations meant a fix to the
 * refresh logic (e.g. the Phase 3 #7 401-retry force flag) had to
 * land three times.
 *
 * This module centralises:
 *   - ensureFreshXeroToken(supabase, settings, { force? })
 *   - ensureFreshQuickBooksToken(supabase, integration, { force? })
 *
 * Settings row shapes stay the same so callers wrap them in their
 * own typed interfaces. The helpers return the access_token string
 * (already-fresh or just-refreshed) or null when the refresh path
 * can't proceed (missing creds, refresh API error). Callers handle
 * the 502 response.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface XeroSettingsForRefresh {
  company_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
}

export interface QuickBooksIntegrationForRefresh {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
}

/**
 * Xero token refresh. access_token has a 30-minute life and the
 * refresh_token rotates on every call -- we MUST persist the new
 * refresh_token or the next refresh fails with invalid_grant.
 *
 * opts.force=true bypasses the cached-expiry check, used by the
 * 401-retry path when Xero invalidates a token early (clock skew,
 * manual disconnect, scope change).
 */
export async function ensureFreshXeroToken(
  supabase: any,
  settings: XeroSettingsForRefresh,
  opts: { force?: boolean } = {},
): Promise<string | null> {
  if (!settings.access_token_encrypted) return null;

  const expiresAt = settings.token_expires_at
    ? new Date(settings.token_expires_at).getTime()
    : 0;
  const now = Date.now();
  const fresh = expiresAt - now > 60 * 1000;
  if (fresh && !opts.force) return settings.access_token_encrypted;
  if (!settings.refresh_token_encrypted) return null;

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn("[xero] missing XERO_CLIENT_ID / XERO_CLIENT_SECRET env");
    return null;
  }

  const tokenResp = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: settings.refresh_token_encrypted,
    }),
  });
  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    console.warn("[xero] token refresh failed:", body);
    return null;
  }
  const tokens: any = await tokenResp.json();
  const newAccess: string = tokens.access_token;
  const newRefresh: string = tokens.refresh_token;
  const expiresIn: number = Number(tokens.expires_in || 1800);

  await supabase
    .from("xero_integration_settings")
    .update({
      access_token_encrypted: newAccess,
      refresh_token_encrypted: newRefresh,
      token_expires_at: new Date(now + expiresIn * 1000).toISOString(),
    })
    .eq("company_id", settings.company_id);

  return newAccess;
}

/**
 * QuickBooks (Intuit) token refresh. access_token has a 1-hour life;
 * refresh_token rotates on every call (per Intuit docs) and lasts
 * 100 days from the LAST refresh, so persisting the new value keeps
 * the cycle going indefinitely.
 *
 * opts.force=true bypasses the cached-expiry check, used by the
 * 401-retry path. Intuit revokes early on manual disconnect / scope
 * change so the only reliable signal is a 401 from the API.
 */
export async function ensureFreshQuickBooksToken(
  supabase: any,
  integration: QuickBooksIntegrationForRefresh,
  opts: { force?: boolean } = {},
): Promise<string | null> {
  if (!integration.access_token) return null;

  const expiresAt = integration.expires_at
    ? new Date(integration.expires_at).getTime()
    : 0;
  const now = Date.now();
  const fresh = expiresAt - now > 60 * 1000;
  if (fresh && !opts.force) return integration.access_token;
  if (!integration.refresh_token) return null;

  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn("[quickbooks] missing QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET env");
    return null;
  }

  const tokenResp = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: integration.refresh_token,
    }),
  });
  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    console.warn("[quickbooks] token refresh failed:", body);
    return null;
  }
  const tokens: any = await tokenResp.json();
  const newAccess: string = tokens.access_token;
  const newRefresh: string = tokens.refresh_token || integration.refresh_token;
  const expiresIn: number = Number(tokens.expires_in || 3600);

  await supabase
    .from("accounting_integrations")
    .update({
      access_token: newAccess,
      refresh_token: newRefresh,
      expires_at: new Date(now + expiresIn * 1000).toISOString(),
    })
    .eq("id", integration.id);

  return newAccess;
}
