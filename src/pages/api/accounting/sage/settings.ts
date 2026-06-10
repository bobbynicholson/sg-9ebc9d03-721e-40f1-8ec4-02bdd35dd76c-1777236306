/**
 * /api/accounting/sage/settings
 *
 * Wave 70.1 finishing piece. The sync-invoice and sync-payment
 * endpoints fail with 412 ("Sage default ledger account not
 * configured") until an admin picks which Sage accounts CateringMS
 * should map to. This endpoint is the back end for that picker.
 *
 *   GET  - returns current metadata + pulls the option lists from
 *           the connected Sage tenant (ledger accounts, tax rates,
 *           bank accounts, payment methods). Empty arrays + nulls
 *           if not yet connected.
 *
 *   POST - writes the chosen defaults back to
 *           accounting_integrations.metadata. Owner / admin only.
 *           Validates each id against the live Sage lists so a stale
 *           browser tab can't save an id that no longer exists.
 *
 * The dropdown ids change per Sage tenant - there's no shared
 * catalogue - so the only way to populate them sensibly is to
 * fetch live each time the panel opens. Cached for 60s so opening
 * the settings page doesn't hammer Sage.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getValidAccessToken } from "@/services/accountingIntegrationService";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const SAGE_API = "https://api.accounting.sage.com/v3.1";

interface SageListItem {
  id: string;
  displayed_as?: string;
  name?: string;
}

interface SageSettingsMetadata {
  default_ledger_account_id?: string;
  default_tax_rate_id?: string;
  default_bank_account_id?: string;
  default_payment_method_id?: string;
  prices_include_tax?: boolean;
}

async function fetchList(accessToken: string, path: string): Promise<SageListItem[]> {
  try {
    // items_per_page=200 is plenty; the typical tenant has 30-80
    // ledger accounts and a handful of tax rates / banks.
    const r = await fetch(`${SAGE_API}${path}?items_per_page=200`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!r.ok) return [];
    const body = (await r.json().catch(() => null)) as { $items?: SageListItem[] } | null;
    return body?.$items || [];
  } catch {
    return [];
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Owner or admin only" });
    const companyId = (profile as any)?.company_id as string | undefined;
    if (!companyId) return res.status(400).json({ error: "No company on profile" });

    const admin: any = getServiceSupabase();

    if (req.method === "GET") {
      // Current metadata first - always returnable, even if the
      // Sage connection is dead.
      const { data: integration } = await admin
        .from("accounting_integrations")
        .select("metadata, is_active")
        .eq("company_id", companyId)
        .eq("provider", "sage")
        .maybeSingle();

      const metadata: SageSettingsMetadata = ((integration as any)?.metadata || {}) as SageSettingsMetadata;
      const isConnected = !!(integration as any)?.is_active;

      if (!isConnected) {
        return res.status(200).json({
          connected: false,
          metadata,
          options: { ledger_accounts: [], tax_rates: [], bank_accounts: [], payment_methods: [] },
        });
      }

      const tokenRes = await getValidAccessToken(companyId, "sage");
      if (!tokenRes.success || !tokenRes.accessToken) {
        return res.status(200).json({
          connected: false,
          tokenError: tokenRes.error || "Sage token refresh failed",
          metadata,
          options: { ledger_accounts: [], tax_rates: [], bank_accounts: [], payment_methods: [] },
        });
      }

      // Pull the four picker lists in parallel.
      const [ledger, tax, bank, methods] = await Promise.all([
        fetchList(tokenRes.accessToken, "/ledger_accounts"),
        fetchList(tokenRes.accessToken, "/tax_rates"),
        fetchList(tokenRes.accessToken, "/bank_accounts"),
        fetchList(tokenRes.accessToken, "/payment_methods"),
      ]);

      return res.status(200).json({
        connected: true,
        metadata,
        options: {
          ledger_accounts: ledger.map((x) => ({ id: x.id, label: x.displayed_as || x.name || x.id })),
          tax_rates: tax.map((x) => ({ id: x.id, label: x.displayed_as || x.name || x.id })),
          bank_accounts: bank.map((x) => ({ id: x.id, label: x.displayed_as || x.name || x.id })),
          payment_methods: methods.map((x) => ({ id: x.id, label: x.displayed_as || x.name || x.id })),
        },
      });
    }

    if (req.method === "POST") {
      const body = (req.body || {}) as Partial<SageSettingsMetadata>;

      // Read existing metadata so we don't wipe out fields the UI
      // didn't send.
      const { data: integration } = await admin
        .from("accounting_integrations")
        .select("metadata, is_active")
        .eq("company_id", companyId)
        .eq("provider", "sage")
        .maybeSingle();
      if (!integration) {
        return res.status(404).json({ error: "Sage integration not found. Connect first." });
      }

      const existing = ((integration as any).metadata || {}) as SageSettingsMetadata;
      const next: SageSettingsMetadata = { ...existing };

      if (typeof body.default_ledger_account_id === "string") next.default_ledger_account_id = body.default_ledger_account_id || undefined;
      if (typeof body.default_tax_rate_id === "string") next.default_tax_rate_id = body.default_tax_rate_id || undefined;
      if (typeof body.default_bank_account_id === "string") next.default_bank_account_id = body.default_bank_account_id || undefined;
      if (typeof body.default_payment_method_id === "string") next.default_payment_method_id = body.default_payment_method_id || undefined;
      if (typeof body.prices_include_tax === "boolean") next.prices_include_tax = body.prices_include_tax;

      const { error } = await admin
        .from("accounting_integrations")
        .update({ metadata: next })
        .eq("company_id", companyId)
        .eq("provider", "sage");
      if (error) {
        return res.status(500).json({ error: error.message });
      }

      try {
        await admin.from("audit_logs").insert({
          company_id: companyId,
          user_id: user.id,
          action: "sage_settings_saved",
          entity_type: "accounting_integration",
          entity_id: companyId,
          details: { provider: "sage", metadata: next },
        });
      } catch (auditErr) {
        console.warn("[accounting/sage/settings] audit insert failed:", auditErr);
      }

      return res.status(200).json({ ok: true, metadata: next });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("[accounting/sage/settings] crashed:", err);
    return res.status(500).json({ error: err?.message || "Sage settings crashed" });
  }
}

export default withApiLogging(handler);
