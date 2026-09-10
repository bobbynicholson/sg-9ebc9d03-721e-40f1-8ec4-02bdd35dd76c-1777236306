/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * cleaningSettingsService - company-wide cleaning portal defaults.
 *
 * Persists to companies.cleaning_settings (jsonb, migration
 * 20260706120000). Degrades to localStorage when that column isn't
 * present yet (pre-migration) so the settings page keeps working and
 * automatically upgrades to synced storage once the migration lands.
 *
 * Shared DEFAULTS + type so consumers (schedules default time, damage
 * notify gate, low-stock notify gate) read the same shape the settings
 * page writes.
 */
import { supabase } from "@/integrations/supabase/client";

export interface CleaningSettings {
  photoRequiredForVerify: boolean;
  photoRequiredForDamage: boolean;
  autoBillMissing: boolean;
  defaultDailyTime: string;
  defaultReplacementCostMultiplier: number;
  notifyAdminOnDamage: boolean;
  notifyShoppingOnLowStock: boolean;
  damageThresholdR: number;
}

export const CLEANING_SETTINGS_DEFAULTS: CleaningSettings = {
  photoRequiredForVerify: false,
  photoRequiredForDamage: true,
  autoBillMissing: true,
  defaultDailyTime: "09:00",
  defaultReplacementCostMultiplier: 1.0,
  notifyAdminOnDamage: true,
  notifyShoppingOnLowStock: true,
  damageThresholdR: 500,
};

const storageKey = (companyId: string) => `cms_cleaning_settings_${companyId}`;

function readLocal(companyId: string): Partial<CleaningSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocal(companyId: string, settings: CleaningSettings) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(storageKey(companyId), JSON.stringify(settings)); } catch { /* quota / private mode */ }
}

/**
 * Load merged settings for a company. Prefers the DB column; if it's
 * missing (pre-migration) or the read fails, falls back to the local
 * cache. Always returns a complete object (DEFAULTS filled in).
 * `synced` reports whether the value came from the shared DB column.
 */
export async function getCleaningSettings(
  companyId: string,
): Promise<{ settings: CleaningSettings; synced: boolean }> {
  try {
    const { data, error } = await (supabase as any)
      .from("companies")
      .select("cleaning_settings")
      .eq("id", companyId)
      .maybeSingle();
    if (error) throw error;
    const stored = (data?.cleaning_settings || {}) as Partial<CleaningSettings>;
    const settings = { ...CLEANING_SETTINGS_DEFAULTS, ...readLocal(companyId), ...stored };
    // Keep the local cache warm for offline / next paint.
    writeLocal(companyId, settings);
    return { settings, synced: true };
  } catch {
    // Column missing (pre-migration) or transient failure: use cache.
    return { settings: { ...CLEANING_SETTINGS_DEFAULTS, ...readLocal(companyId) }, synced: false };
  }
}

/**
 * Persist settings company-wide. Writes the DB column when available and
 * always mirrors to the local cache. Returns whether the DB write landed.
 */
export async function saveCleaningSettings(
  companyId: string,
  settings: CleaningSettings,
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  writeLocal(companyId, settings);
  try {
    const { error } = await (supabase as any)
      .from("companies")
      .update({ cleaning_settings: settings })
      .eq("id", companyId);
    if (error) throw error;
    return { ok: true, synced: true };
  } catch (e: any) {
    // Pre-migration: the local write above still succeeded, so the page
    // keeps this device's value; report not-synced so the UI can say so.
    return { ok: true, synced: false, error: e?.message };
  }
}
