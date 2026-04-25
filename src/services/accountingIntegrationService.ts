import { supabase } from "@/integrations/supabase/client";
import crypto from "crypto";

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

export type AccountingProvider = "xero" | "quickbooks";

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
  const config = provider === "xero" ? XERO_CONFIG : QUICKBOOKS_CONFIG;
  
  // Generate and store state for CSRF protection
  const state = crypto.randomBytes(16).toString("hex");
  
  // Store state in sessionStorage (client-side) or database (server-side)
  if (typeof window !== "undefined") {
    sessionStorage.setItem("oauth_state", state);
    sessionStorage.setItem("oauth_company_id", companyId);
    sessionStorage.setItem("oauth_provider", provider);
  }

  if (provider === "xero") {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(" "),
      state,
    });
    return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
  } else {
    // QuickBooks
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(" "),
      state,
    });
    return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
  }
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  provider: AccountingProvider,
  code: string
): Promise<{ success: boolean; tokens?: OAuthTokens; error?: string }> {
  try {
    const config = provider === "xero" ? XERO_CONFIG : QUICKBOOKS_CONFIG;
    
    const tokenUrl = provider === "xero" 
      ? "https://identity.xero.com/connect/token"
      : "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

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
    const config = provider === "xero" ? XERO_CONFIG : QUICKBOOKS_CONFIG;
    
    const tokenUrl = provider === "xero" 
      ? "https://identity.xero.com/connect/token"
      : "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

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
  } else {
    return await syncToQuickBooks(tokenResult.accessToken, tokenResult.tenantId!, invoiceData);
  }
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
  } else {
    return await syncPaymentToQuickBooks(tokenResult.accessToken, tokenResult.tenantId!, paymentData);
  }
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

/**
 * Simple encryption for tokens (use proper encryption in production)
 */
function encryptTokens(tokens: OAuthTokens): OAuthTokens {
  // TODO: Implement proper encryption using a secure key
  // For now, this is a placeholder - DO NOT use in production as-is
  const key = process.env.ENCRYPTION_KEY || "change-this-key-in-production";
  
  return {
    ...tokens,
    access_token: Buffer.from(tokens.access_token).toString("base64"),
    refresh_token: Buffer.from(tokens.refresh_token).toString("base64"),
  };
}

/**
 * Decrypt tokens
 */
function decryptTokens(tokens: OAuthTokens): OAuthTokens {
  // TODO: Implement proper decryption
  return {
    ...tokens,
    access_token: Buffer.from(tokens.access_token, "base64").toString("utf-8"),
    refresh_token: Buffer.from(tokens.refresh_token, "base64").toString("utf-8"),
  };
}

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