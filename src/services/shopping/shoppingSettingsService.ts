/**
 * shoppingSettingsService - per-tenant shopping/procurement policy.
 *
 * Backed by public.company_shopping_settings (one row per company,
 * migration 20260705130000). Replaces the old browser-localStorage blob
 * so the values (1) sync across the team, (2) are readable by server-side
 * consumers, and (3) update live via Supabase realtime.
 *
 * The consumers that honour these settings today:
 *   - receiptRequiredOnComplete -> useActiveShoppingList.completeList gate
 *   - varianceAlertPct           -> recordShoppingCostVariance threshold
 *   - notifyAdminOnVariance      -> recordShoppingCostVariance admin notify
 *   - defaultLeadTimeDays        -> inventoryService reorder-suggestion default
 *
 * The rest (autoNotifyOnLowStock, preferRatedSuppliers,
 * autoCreateListFromUpcoming/upcomingHorizonDays) persist here for the
 * background jobs that will consume them next; they are labelled
 * "coming soon" in the UI so they are never presented as live controls.
 */

export interface ShoppingSettings {
  receiptRequiredOnComplete: boolean;
  varianceAlertPct: number;
  autoNotifyOnLowStock: boolean;
  defaultLeadTimeDays: number;
  preferRatedSuppliers: boolean;
  autoCreateListFromUpcoming: boolean;
  upcomingHorizonDays: number;
  notifyAdminOnVariance: boolean;
}

export interface ShoppingSettingsMeta {
  updatedAt: string | null;
  updatedByUserId: string | null;
}

export const SHOPPING_SETTINGS_DEFAULTS: ShoppingSettings = {
  receiptRequiredOnComplete: true,
  varianceAlertPct: 15,
  autoNotifyOnLowStock: true,
  defaultLeadTimeDays: 2,
  preferRatedSuppliers: true,
  autoCreateListFromUpcoming: false,
  upcomingHorizonDays: 7,
  notifyAdminOnVariance: true,
};

/** Table columns are snake_case; the UI/consumers speak camelCase. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSettings(row: any): ShoppingSettings {
  if (!row) return { ...SHOPPING_SETTINGS_DEFAULTS };
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    receiptRequiredOnComplete: bool(row.receipt_required_on_complete, SHOPPING_SETTINGS_DEFAULTS.receiptRequiredOnComplete),
    varianceAlertPct: num(row.variance_alert_pct, SHOPPING_SETTINGS_DEFAULTS.varianceAlertPct),
    autoNotifyOnLowStock: bool(row.auto_notify_on_low_stock, SHOPPING_SETTINGS_DEFAULTS.autoNotifyOnLowStock),
    defaultLeadTimeDays: num(row.default_lead_time_days, SHOPPING_SETTINGS_DEFAULTS.defaultLeadTimeDays),
    preferRatedSuppliers: bool(row.prefer_rated_suppliers, SHOPPING_SETTINGS_DEFAULTS.preferRatedSuppliers),
    autoCreateListFromUpcoming: bool(row.auto_create_list_from_upcoming, SHOPPING_SETTINGS_DEFAULTS.autoCreateListFromUpcoming),
    upcomingHorizonDays: num(row.upcoming_horizon_days, SHOPPING_SETTINGS_DEFAULTS.upcomingHorizonDays),
    notifyAdminOnVariance: bool(row.notify_admin_on_variance, SHOPPING_SETTINGS_DEFAULTS.notifyAdminOnVariance),
  };
}

function settingsToRow(s: ShoppingSettings): Record<string, unknown> {
  return {
    receipt_required_on_complete: s.receiptRequiredOnComplete,
    variance_alert_pct: clampInt(s.varianceAlertPct, 0, 100, SHOPPING_SETTINGS_DEFAULTS.varianceAlertPct),
    auto_notify_on_low_stock: s.autoNotifyOnLowStock,
    default_lead_time_days: clampInt(s.defaultLeadTimeDays, 0, 30, SHOPPING_SETTINGS_DEFAULTS.defaultLeadTimeDays),
    prefer_rated_suppliers: s.preferRatedSuppliers,
    auto_create_list_from_upcoming: s.autoCreateListFromUpcoming,
    upcoming_horizon_days: clampInt(s.upcomingHorizonDays, 1, 60, SHOPPING_SETTINGS_DEFAULTS.upcomingHorizonDays),
    notify_admin_on_variance: s.notifyAdminOnVariance,
  };
}

function clampInt(v: number, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** True when the error means the settings table isn't migrated yet, so
 *  callers can fall back to defaults instead of surfacing a scary error
 *  before the DDL is applied. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMissingTable(error: any): boolean {
  const msg = `${error?.message || ""} ${error?.code || ""}`;
  return /company_shopping_settings/.test(msg) && /(does not exist|could not find|PGRST205|42P01|404)/i.test(msg);
}

export interface LoadedShoppingSettings {
  settings: ShoppingSettings;
  meta: ShoppingSettingsMeta;
  /** True when no row existed yet (defaults returned). */
  isDefault: boolean;
  /** True when the table itself is missing (pre-migration). */
  tableMissing: boolean;
}

/**
 * Read a company's shopping settings. Returns defaults (never throws)
 * when the row is absent or the table isn't migrated yet, so every
 * consumer gets a usable value.
 */
export async function getShoppingSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  companyId: string | null | undefined,
): Promise<LoadedShoppingSettings> {
  const fallback: LoadedShoppingSettings = {
    settings: { ...SHOPPING_SETTINGS_DEFAULTS },
    meta: { updatedAt: null, updatedByUserId: null },
    isDefault: true,
    tableMissing: false,
  };
  if (!companyId) return fallback;
  try {
    const { data, error } = await sb
      .from("company_shopping_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) return { ...fallback, tableMissing: true };
      return fallback;
    }
    if (!data) return fallback;
    return {
      settings: rowToSettings(data),
      meta: { updatedAt: data.updated_at ?? null, updatedByUserId: data.updated_by_user_id ?? null },
      isDefault: false,
      tableMissing: false,
    };
  } catch {
    return fallback;
  }
}

export interface SaveShoppingSettingsResult {
  ok: boolean;
  error?: string;
  tableMissing?: boolean;
}

/**
 * Upsert a company's shopping settings. Stamps updated_by/updated_at.
 * RLS restricts writes to owner/company_admin/admin/super_admin.
 */
export async function saveShoppingSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  companyId: string,
  userId: string | null,
  settings: ShoppingSettings,
): Promise<SaveShoppingSettingsResult> {
  try {
    const { error } = await sb
      .from("company_shopping_settings")
      .upsert(
        {
          company_id: companyId,
          ...settingsToRow(settings),
          updated_by_user_id: userId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );
    if (error) {
      if (isMissingTable(error)) return { ok: false, tableMissing: true, error: error.message };
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save settings" };
  }
}
