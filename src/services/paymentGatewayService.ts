/**
 * Payment gateway service (tenant-scoped).
 *
 * Owns the per-company payment gateway configuration - which provider
 * (PayFast / Yoco / Peach) is wired up for receiving event-client
 * payments, whether it's in test or live mode, the success / cancel /
 * notify URLs, and the secret credentials for signing requests.
 *
 * Hard rule: this service NEVER reads credential JSON via the
 * authenticated browser client. The metadata table is RLS-scoped so
 * company_admin can read/write metadata; the credentials sibling
 * table has RLS enabled with no permissive policy, so only
 * service-role server code can ever touch it. The browser's "edit"
 * dialog blanks credential fields on every open - write-once,
 * full re-entry on update.
 *
 * The actual payment-routing handler (deferred phase 2 work) reads
 * credentials via /lib/supabase/service.ts (service-role client),
 * never via this module on the browser.
 *
 * One-active-per-tenant is enforced at the DB level via a partial
 * unique index, not in app code.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PaymentGatewayProvider = "payfast" | "yoco" | "stripe";

export const PAYMENT_GATEWAY_PROVIDERS: ReadonlyArray<PaymentGatewayProvider> =
  Object.freeze(["payfast", "yoco", "stripe"] as const);

export type PaymentGatewayMetadata =
  Database["public"]["Tables"]["payment_gateways"]["Row"];

/**
 * What we send back to browser callers. Real credentials never appear
 * here - credential_hints carries only a last-4 string per field key
 * so the operator can confirm the correct keys are saved without ever
 * exposing the secret. Empty record when the gateway hasn't been
 * configured yet, or when the caller used the browser-safe `list()`
 * (which doesn't read the credentials sibling).
 */
export interface PaymentGatewayConfigDTO {
  id: string;
  company_id: string;
  provider: PaymentGatewayProvider;
  is_active: boolean;
  is_test: boolean;
  success_url: string | null;
  cancel_url: string | null;
  notify_url: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
  /** Per-field display hint, never the real secret. e.g. {merchantKey: "····3287"}. */
  credential_hints: Record<string, string>;
}

/**
 * Build a display-only hint for a credential value. Last 4 chars for
 * anything 6+ chars (typical of merchant IDs and secret keys), a
 * generic "set" badge for shorter values so we never leak meaningful
 * portions of e.g. a 5-char passphrase.
 */
function buildHint(value: string): string {
  const trimmed = (value ?? "").toString().trim();
  if (!trimmed) return "";
  if (trimmed.length < 6) return "set";
  return "····" + trimmed.slice(-4);
}

export interface PaymentGatewayUpsertInput {
  provider: PaymentGatewayProvider;
  is_test: boolean;
  success_url?: string | null;
  cancel_url?: string | null;
  notify_url?: string | null;
  /** Whole credential bundle, written to the credentials sibling table. */
  credentials: Record<string, string>;
}

type SbAny = SupabaseClient<Database> | any;

const TABLE = "payment_gateways";
const CREDS_TABLE = "payment_gateway_credentials";

function toDTO(
  row: PaymentGatewayMetadata,
  credentialHints: Record<string, string> = {},
): PaymentGatewayConfigDTO {
  return {
    id: row.id,
    company_id: row.company_id,
    provider: row.provider as PaymentGatewayProvider,
    is_active: row.is_active,
    is_test: row.is_test,
    success_url: row.success_url,
    cancel_url: row.cancel_url,
    notify_url: row.notify_url,
    last_verified_at: row.last_verified_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    credential_hints: credentialHints,
  };
}

export const paymentGatewayService = {
  /**
   * List every non-deleted gateway row for the company. Browser-safe:
   * RLS on payment_gateways scopes by company_id, and the credentials
   * sibling table is never selected.
   */
  async list(companyId: string, client: SbAny = defaultClient): Promise<PaymentGatewayConfigDTO[]> {
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("provider", { ascending: true });
    if (error) {
      console.error("[paymentGatewayService.list]", error);
      return [];
    }
    return (data || []).map((r: PaymentGatewayMetadata) => toDTO(r));
  },

  /**
   * Server-only variant of list() that also reads the credentials
   * sibling (using the supplied service-role client) and attaches a
   * last-4 hint per field so the configure dialog can show "Merchant
   * Key ····3287" without ever letting the real value leave the server.
   *
   * The browser-safe list() never reads the credentials table - this
   * method exists specifically for the API endpoint to enrich the
   * response, since RLS denies authenticated reads on credentials.
   */
  async listWithCredentialHints(
    companyId: string,
    serviceClient: SbAny,
  ): Promise<PaymentGatewayConfigDTO[]> {
    const { data: gateways, error } = await serviceClient
      .from(TABLE)
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("provider", { ascending: true });
    if (error) {
      console.error("[paymentGatewayService.listWithCredentialHints]", error);
      return [];
    }
    const rows = (gateways || []) as PaymentGatewayMetadata[];
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const { data: creds, error: credErr } = await serviceClient
      .from(CREDS_TABLE)
      .select("gateway_id, credentials")
      .in("gateway_id", ids);
    if (credErr) {
      console.error("[paymentGatewayService.listWithCredentialHints] creds:", credErr);
      // Soft-fail: still return the metadata, just without hints.
      return rows.map((r) => toDTO(r));
    }

    const hintsByGateway = new Map<string, Record<string, string>>();
    for (const row of (creds || []) as Array<{
      gateway_id: string;
      credentials: Record<string, string> | null;
    }>) {
      const hints: Record<string, string> = {};
      for (const [k, v] of Object.entries(row.credentials || {})) {
        const hint = buildHint(String(v ?? ""));
        if (hint) hints[k] = hint;
      }
      hintsByGateway.set(row.gateway_id, hints);
    }

    return rows.map((r) => toDTO(r, hintsByGateway.get(r.id) || {}));
  },

  /**
   * Server-only. Upsert the metadata row + credentials row for a
   * (company, provider) pair. Caller must pass a service-role client.
   *
   * Strategy: try insert first (most common path); on the
   * payment_gateways_company_provider_unique constraint we update
   * the existing row. Either way, the credentials row gets upserted
   * by gateway_id.
   */
  async upsertWithCredentials(
    companyId: string,
    actorUserId: string | null,
    input: PaymentGatewayUpsertInput,
    serviceClient: SbAny,
  ): Promise<{ ok: boolean; gateway?: PaymentGatewayConfigDTO; error?: string }> {
    if (!PAYMENT_GATEWAY_PROVIDERS.includes(input.provider)) {
      return { ok: false, error: `Unsupported provider: ${input.provider}` };
    }

    const { data, error } = await serviceClient.rpc("configure_company_payment_gateway", {
      p_company_id: companyId, p_actor_id: actorUserId, p_provider: input.provider,
      p_is_test: input.is_test, p_credentials: input.credentials,
      p_success_url: input.success_url || null, p_cancel_url: input.cancel_url || null, p_notify_url: input.notify_url || null,
    });
    if (error || !data) return { ok: false, error: error?.message || "Gateway save did not commit" };
    return { ok: true, gateway: toDTO(data as PaymentGatewayMetadata) };
  },

  /**
   * Atomically flip this gateway active and all sibling rows for the
   * same company inactive. The DB partial unique index would reject
   * a duplicate active row, so we deactivate first then activate.
   * Server-only - accepts a service-role client.
   */
  async activate(
    companyId: string,
    gatewayId: string,
    actorUserId: string | null,
    serviceClient: SbAny,
  ): Promise<{ ok: boolean; gateway?: PaymentGatewayConfigDTO; error?: string }> {
    const { data, error } = await serviceClient.rpc("activate_company_payment_gateway", {
      p_company_id: companyId, p_gateway_id: gatewayId, p_actor_id: actorUserId,
    });
    if (error || !data) return { ok: false, error: error?.message || "Gateway activation did not commit" };
    return { ok: true, gateway: toDTO(data as PaymentGatewayMetadata) };
  },

  /**
   * Soft-delete via deleted_at. Frees the (company, provider) slot
   * so the operator can re-configure that provider from scratch.
   * If the deleted gateway was active, no other row activates --
   * the operator must explicitly pick a replacement.
   */
  async softDelete(
    companyId: string,
    gatewayId: string,
    actorUserId: string | null,
    serviceClient: SbAny,
  ): Promise<{ ok: boolean; error?: string }> {
    const { data: row, error: lookupErr } = await serviceClient
      .from(TABLE)
      .select("id, company_id, deleted_at")
      .eq("id", gatewayId)
      .maybeSingle();
    if (lookupErr) return { ok: false, error: lookupErr.message };
    if (!row || row.company_id !== companyId || row.deleted_at) {
      return { ok: false, error: "Gateway not found for this company" };
    }

    const { error } = await serviceClient
      .from(TABLE)
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by_user_id: actorUserId,
      })
      .eq("id", gatewayId);
    if (error) return { ok: false, error: error.message };

    return { ok: true };
  },

  /**
   * Provider catalogue - the field shape every provider needs the
   * operator to enter. Drives the configure dialog. Single source of
   * truth: page imports this rather than hard-coding its own list.
   */
  getProviderCatalogue(): Array<{
    provider: PaymentGatewayProvider;
    name: string;
    description: string;
    fields: Array<{ key: string; label: string; type: "text" | "password"; required: boolean }>;
  }> {
    return [
      {
        provider: "payfast",
        name: "PayFast",
        description: "South Africa's leading payment gateway",
        fields: [
          { key: "merchantId", label: "Merchant ID", type: "text", required: true },
          { key: "merchantKey", label: "Merchant Key", type: "password", required: true },
          { key: "passphrase", label: "Passphrase", type: "password", required: false },
        ],
      },
      {
        provider: "yoco",
        name: "Yoco",
        description: "Simple, affordable card payments for South African businesses",
        fields: [
          { key: "secretKey", label: "Secret Key", type: "password", required: true },
          { key: "publicKey", label: "Public Key", type: "text", required: true },
          { key: "webhookSecret", label: "Webhook Signing Secret (auto-registered if blank)", type: "password", required: false },
        ],
      },
      {
        provider: "stripe",
        name: "Stripe",
        description: "International card payments via Stripe Checkout",
        fields: [
          { key: "secretKey", label: "Secret Key (sk_...)", type: "password", required: true },
          { key: "publishableKey", label: "Publishable Key (pk_...)", type: "text", required: true },
          { key: "webhookSigningSecret", label: "Webhook Signing Secret (whsec_...)", type: "password", required: true },
        ],
      },
    ];
  },

  /**
   * Server-only. Resolve the active gateway for a company AND read its
   * raw credentials. Used by the runtime payment dispatcher and by
   * webhook handlers that need the per-tenant signing secret. Caller
   * MUST pass a service-role client - RLS denies authenticated reads
   * on payment_gateway_credentials by design.
   */
  async getActiveWithCredentials(
    companyId: string,
    serviceClient: SbAny,
  ): Promise<{
    gateway: PaymentGatewayMetadata;
    credentials: Record<string, string>;
  } | null> {
    const { data, error } = await serviceClient.rpc("read_payment_gateway_configuration", {
      p_company_id: companyId, p_gateway_id: null, p_include_deleted: false,
    });
    if (error) throw new Error("Could not load company payment configuration");
    return data || null;
  },

  /**
   * Server-only. Read raw credentials for a specific gateway id (any
   * provider, regardless of active flag). Used by webhook handlers that
   * already know which gateway received the callback (e.g. Stripe
   * dispatches via the per-account webhook signing secret - the route
   * looks the gateway up by metadata.gatewayId).
   */
  async getByIdWithCredentials(
    gatewayId: string,
    serviceClient: SbAny,
    includeDeleted = false,
  ): Promise<{
    gateway: PaymentGatewayMetadata;
    credentials: Record<string, string>;
  } | null> {
    const { data, error } = await serviceClient.rpc("read_payment_gateway_configuration", {
      p_company_id: null, p_gateway_id: gatewayId, p_include_deleted: includeDeleted,
    });
    if (error) throw new Error("Could not load saved payment configuration");
    return data || null;
  },

  /**
   * Read every saved config for a tenant/provider pair, including
   * soft-deleted rows when requested. PayFast notifications may arrive
   * after a company switches gateways or removes an old one, so webhook
   * verification must be able to use the account that created the checkout.
   */
  async listCompanyProviderWithCredentials(
    companyId: string,
    provider: PaymentGatewayProvider,
    serviceClient: SbAny,
    includeDeleted = false,
  ): Promise<Array<{
    gateway: PaymentGatewayMetadata;
    credentials: Record<string, string>;
  }>> {
    let gatewayQuery = serviceClient
      .from(TABLE)
      .select("*")
      .eq("company_id", companyId)
      .eq("provider", provider)
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false });
    if (!includeDeleted) gatewayQuery = gatewayQuery.is("deleted_at", null);

    const { data: gateways, error } = await gatewayQuery;
    if (error) {
      console.error("[paymentGatewayService.listCompanyProviderWithCredentials] gateways:", error);
      return [];
    }
    const rows = (gateways || []) as PaymentGatewayMetadata[];
    if (rows.length === 0) return [];

    const { data: creds, error: credErr } = await serviceClient
      .from(CREDS_TABLE)
      .select("gateway_id, credentials")
      .in("gateway_id", rows.map((row) => row.id));
    if (credErr) {
      console.error("[paymentGatewayService.listCompanyProviderWithCredentials] credentials:", credErr);
      return [];
    }

    const credentialsByGateway = new Map<string, Record<string, string>>();
    for (const row of (creds || []) as Array<{
      gateway_id: string;
      credentials: Record<string, string> | null;
    }>) {
      credentialsByGateway.set(row.gateway_id, row.credentials || {});
    }

    return rows.map((gateway) => ({
      gateway,
      credentials: credentialsByGateway.get(gateway.id) || {},
    }));
  },

  /**
   * Server-only. Stamp last_verified_at after a successful provider
   * "Test connection" ping so the admin UI can show the operator when
   * they last confirmed the credentials work.
   */
  async markVerified(
    gatewayId: string,
    serviceClient: SbAny,
  ): Promise<{ ok: boolean; verified_at?: string; error?: string }> {
    const nowIso = new Date().toISOString();
    const { error } = await serviceClient
      .from(TABLE)
      .update({ last_verified_at: nowIso })
      .eq("id", gatewayId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, verified_at: nowIso };
  },
};
