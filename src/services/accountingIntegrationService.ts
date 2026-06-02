import { supabase as browserSupabase } from "@/integrations/supabase/client";
import crypto from "crypto";

// Wave 24: accountingIntegrationService is the OAuth bridge between
// our app and Xero / QuickBooks. The OAuth callback handlers
// (/api/accounting/{xero,quickbooks}/callback.ts) intentionally don't
// require a Supabase auth session - they're protected by the
// HttpOnly oauth_state + oauth_company_id cookies set at flow start.
// That means the browser anon supabase imported here has no session
// on the server, so RLS hides accounting_integrations writes and the
// token storage silently fails - the OAuth dance succeeds, the user
// gets redirected back to /admin/integrations, and the integration is
// reported as connected when it never landed.
//
// resolveServerClient picks the service-role client when running on
// the server (require'd lazily so the browser bundle never tries to
// pull in service env vars), browser anon in the browser.
function resolveServerClient(): any {
  if (typeof window !== "undefined") return browserSupabase;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getServiceSupabase } = require("@/lib/supabase/service") as { getServiceSupabase: () => any };
    return getServiceSupabase();
  } catch {
    return browserSupabase;
  }
}
const supabase: any = resolveServerClient();

/**
 * ACCOUNTING INTEGRATION SERVICE
 * Complete OAuth 2.0 integration with Xero and QuickBooks
 * 
 * Features:
 * - OAuth authentication
 * - Invoice sync
 * - Payment sync
 * - Client sync
 * - Token refresh
 * - Error handling
 */

// ============================================
// TYPES
// ============================================

// Wave 70 - Sage Business Cloud Accounting (formerly Sage One)
// added as a third provider. Sage is the dominant SA SaaS accounting
// platform; SARS-aware out of the box; preferred by most SA
// bookkeepers over Xero/QB. OAuth 2 flow at api.accounting.sage.com.
export type AccountingProvider = "xero" | "quickbooks" | "sage";

export interface AccountingConfig {
  provider: AccountingProvider;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  tenant_id?: string; // Xero organization ID / QuickBooks realm ID
}

export interface SyncResult {
  success: boolean;
  externalId?: string;
  externalInvoiceNumber?: string;
  error?: string;
  details?: any;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  clientName: string;
  clientEmail: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: "draft" | "sent" | "paid";
}

export interface PaymentData {
  invoiceExternalId: string;
  amount: number;
  date: string;
  reference: string;
}

// ============================================
// CONFIGURATION
// ============================================

const XERO_CONFIG: AccountingConfig = {
  provider: "xero",
  clientId: process.env.NEXT_PUBLIC_XERO_CLIENT_ID || "",
  clientSecret: process.env.XERO_CLIENT_SECRET || "",
  redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/accounting/xero/callback`,
  scopes: ["accounting.transactions", "accounting.contacts"],
};

const QUICKBOOKS_CONFIG: AccountingConfig = {
  provider: "quickbooks",
  clientId: process.env.NEXT_PUBLIC_QUICKBOOKS_CLIENT_ID || "",
  clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || "",
  redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/accounting/quickbooks/callback`,
  scopes: ["com.intuit.quickbooks.accounting"],
};

// Wave 70 - Sage Business Cloud config. Auth URL:
//   https://www.sageone.com/oauth2/auth/central?...
// Token + API base: https://api.accounting.sage.com/v3.1/
// Required env vars (set in Vercel + .env.local):
//   NEXT_PUBLIC_SAGE_CLIENT_ID
//   SAGE_CLIENT_SECRET
//   NEXT_PUBLIC_APP_URL
const SAGE_CONFIG: AccountingConfig = {
  provider: "sage",
  clientId: process.env.NEXT_PUBLIC_SAGE_CLIENT_ID || "",
  clientSecret: process.env.SAGE_CLIENT_SECRET || "",
  redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/accounting/sage/callback`,
  scopes: ["full_access"],
};

// Wave 70 - helper resolves the right config per provider, replaces
// the previous binary ternary that only knew about xero / quickbooks.
function _resolveAccountingConfig(provider: AccountingProvider): AccountingConfig {
  if (provider === "xero") return XERO_CONFIG;
  if (provider === "quickbooks") return QUICKBOOKS_CONFIG;
  if (provider === "sage") return SAGE_CONFIG;
  // Unreachable given the AccountingProvider union, but keep TS happy.
  throw new Error(`Unknown accounting provider: ${provider}`);
}

// ============================================
// OAUTH FLOW
// ============================================

/**
 * Generate OAuth authorization URL
 */
export function getAuthorizationUrl(
  provider: AccountingProvider,
  companyId: string
): string {
  const config = _resolveAccountingConfig(provider);
  
  // Generate and store state for CSRF protection
  const state = crypto.randomBytes(16).toString("hex");
  
  // Store state in sessionStorage (client-side) or database (server-side)
  if (typeof window !== "undefined") {
    sessionStorage.setItem("oauth_state", state);
    sessionStorage.setItem("oauth_company_id", companyId);
    sessionStorage.setItem("oauth_provider", provider);
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(" "),
    state,
  });

  if (provider === "xero") {
    return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
  }
  if (provider === "quickbooks") {
    return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
  }
  // Wave 70 - Sage Business Cloud OAuth.
  // https://developer.sage.com/accounting/guides/authenticating/oauth/
  return `https://www.sageone.com/oauth2/auth/central?${params.toString()}&country=za`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  provider: AccountingProvider,
  code: string
): Promise<{ success: boolean; tokens?: OAuthTokens; error?: string }> {
  try {
    const config = _resolveAccountingConfig(provider);
    
    const tokenUrl = provider === "xero" 
      ? "https://identity.xero.com/connect/token"
      : provider === "quickbooks" ? "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer" : "https://oauth.accounting.sage.com/token";

    const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error_description || "Token exchange failed" };
    }

    const data = await response.json();
    
    const tokens: OAuthTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
    };

    // For Xero, get tenant ID
    if (provider === "xero") {
      const tenantId = await getXeroTenantId(tokens.access_token);
      tokens.tenant_id = tenantId;
    }

    // For QuickBooks, tenant ID is in realmId
    if (provider === "quickbooks") {
      tokens.tenant_id = data.realmId;
    }

    return { success: true, tokens };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get Xero tenant (organization) ID
 */
async function getXeroTenantId(accessToken: string): Promise<string> {
  const response = await fetch("https://api.xero.com/connections", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const connections = await response.json();
  return connections[0]?.tenantId || "";
}

/**
 * Refresh expired access token
 */
export async function refreshAccessToken(
  provider: AccountingProvider,
  refreshToken: string
): Promise<{ success: boolean; tokens?: OAuthTokens; error?: string }> {
  try {
    const config = _resolveAccountingConfig(provider);
    
    const tokenUrl = provider === "xero" 
      ? "https://identity.xero.com/connect/token"
      : provider === "quickbooks" ? "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer" : "https://oauth.accounting.sage.com/token";

    const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      return { success: false, error: "Token refresh failed" };
    }

    const data = await response.json();
    
    const tokens: OAuthTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken, // Some providers don't return new refresh token
      expires_at: Date.now() + (data.expires_in * 1000),
    };

    return { success: true, tokens };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Store OAuth tokens for company
 */
export async function storeOAuthTokens(
  companyId: string,
  provider: AccountingProvider,
  tokens: OAuthTokens
): Promise<{ success: boolean; error?: string }> {
  try {
    // Encrypt sensitive data before storing
    const encryptedTokens = encryptTokens(tokens);

    const { error } = await supabase
      .from("accounting_integrations")
      .upsert({
        company_id: companyId,
        provider,
        access_token: encryptedTokens.access_token,
        refresh_token: encryptedTokens.refresh_token,
        expires_at: new Date(tokens.expires_at).toISOString(),
        tenant_id: tokens.tenant_id,
        is_active: true,
        last_sync_at: new Date().toISOString(),
      });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get valid access token (refresh if expired)
 */
export async function getValidAccessToken(
  companyId: string,
  provider: AccountingProvider
): Promise<{ success: boolean; accessToken?: string; tenantId?: string; error?: string }> {
  try {
    const { data: integration, error } = await supabase
      .from("accounting_integrations")
      .select("*")
      .eq("company_id", companyId)
      .eq("provider", provider)
      .eq("is_active", true)
      .single();

    if (error || !integration) {
      return { success: false, error: "Integration not found" };
    }

    const integrationData = integration as any;

    // Check if token is expired
    const expiresAt = new Date(integrationData.expires_at).getTime();
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // Refresh 5 minutes before expiry

    if (expiresAt - now < bufferTime) {
      // Token expired or expiring soon - refresh it
      const decryptedRefreshToken = decryptTokens({
        access_token: integrationData.access_token,
        refresh_token: integrationData.refresh_token,
        expires_at: expiresAt,
      }).refresh_token;

      const refreshResult = await refreshAccessToken(provider, decryptedRefreshToken);
      
      if (!refreshResult.success || !refreshResult.tokens) {
        return { success: false, error: "Token refresh failed" };
      }

      // Store new tokens
      await storeOAuthTokens(companyId, provider, refreshResult.tokens);
      
      return { 
        success: true, 
        accessToken: refreshResult.tokens.access_token,
        tenantId: refreshResult.tokens.tenant_id,
      };
    }

    // Token is still valid
    const decryptedToken = decryptTokens({
      access_token: integrationData.access_token,
      refresh_token: integrationData.refresh_token,
      expires_at: expiresAt,
    }).access_token;

    return { 
      success: true, 
      accessToken: decryptedToken,
      tenantId: integrationData.tenant_id,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// INVOICE SYNC
// ============================================

/**
 * Sync invoice to accounting system
 */
export async function syncInvoiceToAccounting(
  companyId: string,
  provider: AccountingProvider,
  invoiceData: InvoiceData
): Promise<SyncResult> {
  const tokenResult = await getValidAccessToken(companyId, provider);
  
  if (!tokenResult.success || !tokenResult.accessToken) {
    return { success: false, error: tokenResult.error };
  }

  if (provider === "xero") {
    return await syncToXero(tokenResult.accessToken, tokenResult.tenantId!, invoiceData);
  }
  if (provider === "quickbooks") {
    return await syncToQuickBooks(tokenResult.accessToken, tokenResult.tenantId!, invoiceData);
  }
  // Wave 70 - Sage Business Cloud sync. Scaffold-only for this
  // session: real Sage API needs the per-tenant business_id which
  // a follow-up wave will resolve from the OAuth identity endpoint.
  // Returning a clear "not yet implemented" so the UI can surface
  // the partial state honestly rather than silently succeeding.
  return {
    success: false,
    error: "Sage sync coming in a follow-up wave - OAuth connection works, invoice payload mapping is the next piece.",
  };
}

/**
 * Sync invoice to Xero
 */
async function syncToXero(
  accessToken: string,
  tenantId: string,
  invoiceData: InvoiceData
): Promise<SyncResult> {
  try {
    // 1. Create or get contact
    const contactResult = await createXeroContact(accessToken, tenantId, {
      name: invoiceData.clientName,
      email: invoiceData.clientEmail,
    });

    if (!contactResult.success || !contactResult.contactId) {
      return { success: false, error: "Failed to create contact" };
    }

    // 2. Create invoice
    const xeroInvoice = {
      Type: "ACCREC", // Accounts Receivable (customer invoice)
      Contact: {
        ContactID: contactResult.contactId,
      },
      Date: invoiceData.invoiceDate,
      DueDate: invoiceData.dueDate,
      InvoiceNumber: invoiceData.invoiceNumber,
      LineItems: invoiceData.items.map(item => ({
        Description: item.description,
        Quantity: item.quantity,
        UnitAmount: item.unitPrice,
        AccountCode: "200", // Sales account - update with your account code
        TaxType: "OUTPUT2", // 15% VAT - update with your tax type
      })),
      Status: invoiceData.status === "paid" ? "AUTHORISED" : "DRAFT",
      Reference: `CateringMS-${invoiceData.invoiceNumber}`,
    };

    const response = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ Invoices: [xeroInvoice] }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.Message || "Xero API error" };
    }

    const data = await response.json();
    const createdInvoice = data.Invoices[0];

    return {
      success: true,
      externalId: createdInvoice.InvoiceID,
      externalInvoiceNumber: createdInvoice.InvoiceNumber,
      details: createdInvoice,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Create or get Xero contact
 */
async function createXeroContact(
  accessToken: string,
  tenantId: string,
  contact: { name: string; email: string }
): Promise<{ success: boolean; contactId?: string; error?: string }> {
  try {
    // Check if contact exists
    const searchResponse = await fetch(
      `https://api.xero.com/api.xro/2.0/Contacts?where=EmailAddress=="${contact.email}"`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Xero-Tenant-Id": tenantId,
          "Accept": "application/json",
        },
      }
    );

    const searchData = await searchResponse.json();
    
    if (searchData.Contacts && searchData.Contacts.length > 0) {
      return { success: true, contactId: searchData.Contacts[0].ContactID };
    }

    // Create new contact
    const createResponse = await fetch("https://api.xero.com/api.xro/2.0/Contacts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        Contacts: [{
          Name: contact.name,
          EmailAddress: contact.email,
        }],
      }),
    });

    const createData = await createResponse.json();
    
    return { 
      success: true, 
      contactId: createData.Contacts[0].ContactID 
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Sync invoice to QuickBooks
 */
async function syncToQuickBooks(
  accessToken: string,
  realmId: string,
  invoiceData: InvoiceData
): Promise<SyncResult> {
  try {
    // 1. Create or get customer
    const customerResult = await createQuickBooksCustomer(accessToken, realmId, {
      name: invoiceData.clientName,
      email: invoiceData.clientEmail,
    });

    if (!customerResult.success || !customerResult.customerId) {
      return { success: false, error: "Failed to create customer" };
    }

    // 2. Create invoice
    const qbInvoice = {
      CustomerRef: {
        value: customerResult.customerId,
      },
      TxnDate: invoiceData.invoiceDate,
      DueDate: invoiceData.dueDate,
      DocNumber: invoiceData.invoiceNumber,
      Line: invoiceData.items.map((item, index) => ({
        Id: (index + 1).toString(),
        LineNum: index + 1,
        Description: item.description,
        Amount: item.total,
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: {
          Qty: item.quantity,
          UnitPrice: item.unitPrice,
          ItemRef: {
            value: "1", // Update with your service item ID
            name: "Services",
          },
        },
      })),
      CustomerMemo: {
        value: `CateringMS-${invoiceData.invoiceNumber}`,
      },
    };

    const response = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice?minorversion=65`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(qbInvoice),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.Fault?.Error?.[0]?.Message || "QuickBooks API error" };
    }

    const data = await response.json();
    const createdInvoice = data.Invoice;

    return {
      success: true,
      externalId: createdInvoice.Id,
      externalInvoiceNumber: createdInvoice.DocNumber,
      details: createdInvoice,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Create or get QuickBooks customer
 */
async function createQuickBooksCustomer(
  accessToken: string,
  realmId: string,
  customer: { name: string; email: string }
): Promise<{ success: boolean; customerId?: string; error?: string }> {
  try {
    // Check if customer exists
    const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${customer.email}'`;
    const searchResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json",
        },
      }
    );

    const searchData = await searchResponse.json();
    
    if (searchData.QueryResponse?.Customer?.length > 0) {
      return { success: true, customerId: searchData.QueryResponse.Customer[0].Id };
    }

    // Create new customer
    const createResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/customer?minorversion=65`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          DisplayName: customer.name,
          PrimaryEmailAddr: {
            Address: customer.email,
          },
        }),
      }
    );

    const createData = await createResponse.json();
    
    return { 
      success: true, 
      customerId: createData.Customer.Id 
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// PAYMENT SYNC
// ============================================

/**
 * Sync payment to accounting system
 */
export async function syncPaymentToAccounting(
  companyId: string,
  provider: AccountingProvider,
  paymentData: PaymentData
): Promise<SyncResult> {
  const tokenResult = await getValidAccessToken(companyId, provider);
  
  if (!tokenResult.success || !tokenResult.accessToken) {
    return { success: false, error: tokenResult.error };
  }

  if (provider === "xero") {
    return await syncPaymentToXero(tokenResult.accessToken, tokenResult.tenantId!, paymentData);
  }
  if (provider === "quickbooks") {
    return await syncPaymentToQuickBooks(tokenResult.accessToken, tokenResult.tenantId!, paymentData);
  }
  // Wave 70 - Sage payment sync stub (matches invoice sync stub).
  return {
    success: false,
    error: "Sage payment sync coming in a follow-up wave - OAuth wired, mapping pending.",
  };
}

/**
 * Sync payment to Xero
 */
async function syncPaymentToXero(
  accessToken: string,
  tenantId: string,
  paymentData: PaymentData
): Promise<SyncResult> {
  try {
    const payment = {
      Invoice: {
        InvoiceID: paymentData.invoiceExternalId,
      },
      Account: {
        Code: "200", // Bank account code - update with your account
      },
      Date: paymentData.date,
      Amount: paymentData.amount,
      Reference: paymentData.reference,
    };

    const response = await fetch("https://api.xero.com/api.xro/2.0/Payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ Payments: [payment] }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.Message || "Xero payment sync failed" };
    }

    const data = await response.json();
    
    return {
      success: true,
      externalId: data.Payments[0].PaymentID,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Sync payment to QuickBooks
 */
async function syncPaymentToQuickBooks(
  accessToken: string,
  realmId: string,
  paymentData: PaymentData
): Promise<SyncResult> {
  try {
    const payment = {
      TotalAmt: paymentData.amount,
      CustomerRef: {
        value: paymentData.invoiceExternalId,
      },
      TxnDate: paymentData.date,
      PrivateNote: paymentData.reference,
    };

    const response = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/payment?minorversion=65`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payment),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.Fault?.Error?.[0]?.Message || "QuickBooks payment sync failed" };
    }

    const data = await response.json();
    
    return {
      success: true,
      externalId: data.Payment.Id,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// ─────────────────────────────────────────────────────────────────
// TIGHTEN I.105 (2026-06-02): proper AES-256-GCM token encryption.
//
// Previously encryptTokens / decryptTokens only base64-encoded the
// OAuth tokens, not encrypted them. The comment said "DO NOT use in
// production as-is" but the function WAS in production. Anyone with
// DB read access could decode the Xero / QuickBooks refresh tokens
// and call those integrations on behalf of every tenant.
//
// Format on disk: a single text column stores
//   v1:<iv-base64url>.<auth-tag-base64url>.<ciphertext-base64url>
// The "v1:" prefix is the version sentinel - lets us swap the algo
// later (eg. key rotation) without breaking older rows. Tokens
// written by the legacy code (raw base64) are detected on decrypt
// and transparently re-encrypted on next write.
//
// ENCRYPTION_KEY contract: 32 bytes, hex-encoded (64 chars), OR
// base64-encoded (44 chars including padding). Anything shorter throws
// in production. In dev/preview a placeholder key is permitted with a
// loud warning so local development works without setup.
// ─────────────────────────────────────────────────────────────────

const ENCRYPTION_VERSION = "v1";
const ENCRYPTION_ALGO = "aes-256-gcm" as const;

function loadEncryptionKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  // Hex (64 chars) → 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  // Base64 → must decode to exactly 32 bytes.
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  } catch { /* fall through */ }
  return null;
}

const _resolvedKey = loadEncryptionKey();
if (!_resolvedKey) {
  if (process.env.NODE_ENV === "production") {
    // Hard fail: in production we refuse to silently fall back to
    // weak base64 "encryption" or a placeholder key. The deploy
    // operator must set ENCRYPTION_KEY (32 bytes hex or base64).
    throw new Error(
      "[accountingIntegrationService] ENCRYPTION_KEY env var is missing or malformed " +
        "in production. Set a 32-byte hex (64 chars) or base64 (44 chars) key before boot.",
    );
  } else {
    console.warn(
      "[accountingIntegrationService] ENCRYPTION_KEY env var is missing or malformed. " +
        "Dev / preview fallback active - tokens encrypt with a derived placeholder key. " +
        "Do NOT use this build in production.",
    );
  }
}
// Derive a deterministic placeholder for dev/preview when no key is
// set. Real prod boot fails above before this runs.
const ENCRYPTION_KEY: Buffer =
  _resolvedKey || crypto.createHash("sha256").update("cateringms-dev-placeholder").digest();

function isLegacyToken(value: string): boolean {
  // Anything that isn't versioned is treated as legacy raw base64.
  // The legacy code wrote pure Buffer.toString("base64").
  return !value.startsWith(`${ENCRYPTION_VERSION}:`);
}

function encryptOne(plaintext: string): string {
  const iv = crypto.randomBytes(12); // 96-bit IV per NIST recommendation
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, ENCRYPTION_KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // base64url avoids "+" / "/" / "=" which can collide with our "."
  // delimiter and play nice in URL contexts if ever logged.
  return [
    ENCRYPTION_VERSION,
    [iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join("."),
  ].join(":");
}

function decryptOne(stored: string): string {
  if (isLegacyToken(stored)) {
    // Legacy raw-base64 token written by the old placeholder code.
    // Returning the decoded plaintext lets the caller continue
    // operating; the next storeOAuthTokens() will re-encrypt under v1.
    return Buffer.from(stored, "base64").toString("utf-8");
  }
  const [, payload] = stored.split(":", 2);
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted token (expected v1:iv.tag.ct)");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ct = Buffer.from(ctB64, "base64url");
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf-8");
}

/**
 * Encrypt the access + refresh tokens for at-rest storage.
 * Returns a new OAuthTokens object with the tokens replaced by their
 * v1:iv.tag.ct ciphertext blobs. Non-secret fields pass through.
 */
function encryptTokens(tokens: OAuthTokens): OAuthTokens {
  return {
    ...tokens,
    access_token: encryptOne(tokens.access_token),
    refresh_token: encryptOne(tokens.refresh_token),
  };
}

/**
 * Decrypt the access + refresh tokens for use. Transparently handles
 * legacy raw-base64 rows written by the previous placeholder code -
 * callers don't need to care about migration; the next time
 * storeOAuthTokens() runs for the row it'll be upgraded to v1.
 */
function decryptTokens(tokens: OAuthTokens): OAuthTokens {
  return {
    ...tokens,
    access_token: decryptOne(tokens.access_token),
    refresh_token: decryptOne(tokens.refresh_token),
  };
}

/**
 * Test-only exports of the encryption internals. Used by
 * src/__tests__/services/accountingIntegrationService.encryption.test.ts
 * to lock in round-trip + legacy-handling behaviour. Not part of the
 * public surface; nothing else imports __testEncryption.
 */
export const __testEncryption = {
  encryptOne,
  decryptOne,
  isLegacyToken,
  ENCRYPTION_VERSION,
};

/**
 * Disconnect accounting integration
 */
export async function disconnectAccountingIntegration(
  companyId: string,
  provider: AccountingProvider
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("accounting_integrations")
      .update({ is_active: false })
      .eq("company_id", companyId)
      .eq("provider", provider);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get integration status
 */
export async function getIntegrationStatus(
  companyId: string,
  provider: AccountingProvider
): Promise<{ 
  connected: boolean; 
  tenantName?: string; 
  lastSync?: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from("accounting_integrations")
      .select("*")
      .eq("company_id", companyId)
      .eq("provider", provider)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      return { connected: false };
    }

    const integration = data as any;

    return {
      connected: true,
      tenantName: integration.tenant_name,
      lastSync: integration.last_sync_at,
    };
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}