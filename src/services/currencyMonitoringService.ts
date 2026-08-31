/**
 * Currency monitoring service.
 *
 * Owns the read side of the platform-level USD/ZAR watch:
 *
 *   - getLatestStoredRate / getHistoricalRates pull from the
 *     exchange_rates table populated by the daily cron.
 *   - getUnresolvedAlerts / resolveAlert manage rows in
 *     currency_fluctuation_alerts.
 *   - runDailyCheck is the one-shot routine: fetch live rate from
 *     exchangerate-api.com, upsert today's row, and if the 90-day
 *     rolling change crosses 15% raise an alert (de-duped to one
 *     per 7 days). Called server-side from /api/cron/currency-check
 *     (Vercel cron + admin "Run Check Now" button); never invoked
 *     from browser code now that the cron path exists.
 *
 * Note on the 15% threshold: it's a *review trigger*, not an
 * automated re-peg. Pricing in /admin/platform/pricing-management
 * uses fixed conversion rates (18.5 / 23.5 / 20.0). When this
 * service raises an alert, an admin manually decides whether to
 * adjust the ZAR-pegged tier prices - pricing policy then sends
 * 30 days advance notice to existing customers.
 */
import { supabase as defaultClient } from "@/integrations/supabase/client";

export interface ExchangeRateRow {
  id: string;
  date: string;
  usd_to_zar_rate: number;
  /** Phase 4 #2: extended currency support. NULL on historical
   *  rows logged before the cron started populating these. */
  eur_to_zar_rate?: number | null;
  gbp_to_zar_rate?: number | null;
  aud_to_zar_rate?: number | null;
  created_at: string;
}

export interface LiveRates {
  usd: number;
  eur: number;
  gbp: number;
  aud: number;
}

export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
  sources: string[];
}

export interface LatestCurrencyRate {
  from: string;
  to: string;
  rate: number;
  date: string;
}

export interface FluctuationAlertRow {
  id: string;
  check_date: string;
  start_rate: number;
  end_rate: number;
  percentage_change: number;
  days_period: number;
  alert_sent: boolean;
  resolved: boolean;
  created_at: string;
}

/** Caller can inject a service-role client when invoked from a cron route. */
type SbLike = typeof defaultClient | any;

const FALLBACK_RATE = 18.5;
const DEFAULT_HISTORY_DAYS = 90;
const FLUCTUATION_THRESHOLD_PCT = 15;
const ALERT_DEDUPE_DAYS = 7;
const EXCHANGE_API_URL = "https://api.exchangerate-api.com/v4/latest/USD";

export const currencyMonitoringService = {
  /**
   * Resolve the currencies the platform currently knows about from the same
   * records used by the portal. Region currency settings describe currencies
   * currently configured for tenants; exchange-rate columns describe pairs
   * that the platform can monitor. No currency list is embedded in the
   * assistant or portal response.
   */
  async getSupportedCurrencies(client: SbLike = defaultClient): Promise<SupportedCurrency[]> {
    try {
      const [regionsResult, ratesResult, catalogResult] = await Promise.all([
        client.from("regions").select("currency").eq("is_active", true).limit(5000),
        client.from("exchange_rates").select("*").order("date", { ascending: false }).limit(1).maybeSingle(),
        client
          .from("platform_supported_currencies")
          .select("code, name, symbol")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("code", { ascending: true }),
      ]);

      // Once the catalog migration is present it is authoritative. The
      // fallback below keeps older deployments readable while they roll the
      // migration out and still derives values from portal records.
      if (!catalogResult?.error && Array.isArray(catalogResult.data)) {
        return catalogResult.data
          .map((row: any) => ({
            code: String(row?.code || "").trim().toUpperCase(),
            name: String(row?.name || row?.code || "").trim(),
            symbol: String(row?.symbol || row?.code || "").trim(),
            sources: ["platform currency catalog"],
          }))
          .filter((row: SupportedCurrency) => /^[A-Z]{3}$/.test(row.code) && row.name.length > 0);
      }

      const byCode = new Map<string, Set<string>>();
      const add = (value: unknown, source: string) => {
        const code = String(value || "").trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(code)) return;
        if (!byCode.has(code)) byCode.set(code, new Set<string>());
        byCode.get(code)!.add(source);
      };

      for (const row of (Array.isArray(regionsResult?.data) ? regionsResult.data : [])) {
        add(row?.currency, "active region settings");
      }

      const latestRate = ratesResult?.data && typeof ratesResult.data === "object" ? ratesResult.data : null;
      if (latestRate) {
        for (const [column, value] of Object.entries(latestRate)) {
          const match = column.match(/^([a-z]{3})_to_zar_rate$/i);
          if (match && Number.isFinite(Number(value)) && Number(value) > 0) {
            add(match[1], "exchange-rate monitoring");
            add("ZAR", "exchange-rate monitoring");
          }
        }
      }

      return [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, sources]) => {
        let name = code;
        let symbol = code;
        try {
          name = new Intl.DisplayNames(["en"], { type: "currency" }).of(code) || code;
          const parts = new Intl.NumberFormat("en", {
            style: "currency",
            currency: code,
            currencyDisplay: "narrowSymbol",
          }).formatToParts(0);
          symbol = parts.find((part) => part.type === "currency")?.value || code;
        } catch {
          // Keep the ISO code when the runtime does not know the currency.
        }
        return { code, name, symbol, sources: [...sources] };
      });
    } catch (error) {
      console.error("[currency] getSupportedCurrencies failed:", error);
      return [];
    }
  },

  /** Read the latest stored currency pairs without assuming a fixed list. */
  async getLatestRates(client: SbLike = defaultClient): Promise<{ date: string | null; rates: LatestCurrencyRate[] }> {
    try {
      const { data, error } = await client
        .from("exchange_rates")
        .select("*")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return { date: null, rates: [] };

      const date = String(data.date || "");
      const rates = Object.entries(data)
        .map(([column, value]) => {
          const match = column.match(/^([a-z]{3})_to_zar_rate$/i);
          const rate = Number(value);
          return match && Number.isFinite(rate) && rate > 0
            ? { from: match[1].toUpperCase(), to: "ZAR", rate, date }
            : null;
        })
        .filter((item): item is LatestCurrencyRate => Boolean(item))
        .sort((a, b) => a.from.localeCompare(b.from));
      return { date: date || null, rates };
    } catch (error) {
      console.error("[currency] getLatestRates failed:", error);
      return { date: null, rates: [] };
    }
  },

  /** Return the current 90-day review-trigger state as plain data. */
  async getThresholdStatus(client: SbLike = defaultClient) {
    const fluctuation = await this.checkForSignificantFluctuation(client);
    return {
      pair: "USD/ZAR",
      thresholdPercent: FLUCTUATION_THRESHOLD_PCT,
      reviewRequired: fluctuation.hasFluctuation,
      percentageChange: fluctuation.percentageChange,
      startRate: fluctuation.startRate,
      endRate: fluctuation.endRate,
      startDate: fluctuation.startDate,
      endDate: fluctuation.endDate,
      dataPoints: fluctuation.dataPoints,
      as_of: new Date().toISOString(),
    };
  },

  /**
   * Live USD->ZAR fetch. Used inside runDailyCheck so today's row
   * always reflects the live API. Falls back to FALLBACK_RATE on
   * network failure so the cron never crashes.
   */
  async fetchLiveRate(): Promise<number> {
    try {
      const r = await fetch(EXCHANGE_API_URL);
      const j = await r.json();
      const rate = Number(j?.rates?.ZAR);
      return Number.isFinite(rate) && rate > 0 ? rate : FALLBACK_RATE;
    } catch (e) {
      console.error("[currency] fetchLiveRate failed:", e);
      return FALLBACK_RATE;
    }
  },

  /**
   * Phase 4 #2: extended live fetch returning every supported
   * currency's *-to-ZAR rate in one round trip. exchangerate-api
   * returns rates from USD base; we derive EUR-to-ZAR / GBP-to-ZAR
   * / AUD-to-ZAR using rates.ZAR / rates.X. Falls back to FALLBACK_
   * RATE per leg on partial response failures.
   */
  async fetchLiveRates(): Promise<LiveRates> {
    try {
      const r = await fetch(EXCHANGE_API_URL);
      const j = await r.json();
      const zar = Number(j?.rates?.ZAR);
      const eur = Number(j?.rates?.EUR);
      const gbp = Number(j?.rates?.GBP);
      const aud = Number(j?.rates?.AUD);
      const usdToZar = Number.isFinite(zar) && zar > 0 ? zar : FALLBACK_RATE;
      // X-to-ZAR = ZAR / X (both quoted off USD).
      const eurToZar = Number.isFinite(eur) && eur > 0 ? usdToZar / eur : FALLBACK_RATE * 1.07;
      const gbpToZar = Number.isFinite(gbp) && gbp > 0 ? usdToZar / gbp : FALLBACK_RATE * 1.25;
      const audToZar = Number.isFinite(aud) && aud > 0 ? usdToZar / aud : FALLBACK_RATE * 0.65;
      return {
        usd: usdToZar,
        eur: +eurToZar.toFixed(4),
        gbp: +gbpToZar.toFixed(4),
        aud: +audToZar.toFixed(4),
      };
    } catch (e) {
      console.error("[currency] fetchLiveRates failed:", e);
      return {
        usd: FALLBACK_RATE,
        eur: +(FALLBACK_RATE * 1.07).toFixed(4),
        gbp: +(FALLBACK_RATE * 1.25).toFixed(4),
        aud: +(FALLBACK_RATE * 0.65).toFixed(4),
      };
    }
  },

  /**
   * Look up the *-to-ZAR rate for a given source currency from the
   * most recent stored row. Used by quote-builder / invoice display
   * paths that want to show a USD/EUR/GBP/AUD equivalent next to a
   * ZAR amount without reaching for the live API every time. Returns
   * null if no rates have been stored yet.
   */
  async getCachedRate(
    currency: "USD" | "EUR" | "GBP" | "AUD",
    client: SbLike = defaultClient,
  ): Promise<{ rate: number; date: string } | null> {
    try {
      const col =
        currency === "USD" ? "usd_to_zar_rate" :
        currency === "EUR" ? "eur_to_zar_rate" :
        currency === "GBP" ? "gbp_to_zar_rate" :
        "aud_to_zar_rate";
      const { data, error } = await client
        .from("exchange_rates")
        .select(`date, ${col}`)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data || (data as any)[col] == null) return null;
      return { rate: Number((data as any)[col]), date: (data as any).date };
    } catch (e) {
      console.error("[currency] getCachedRate failed:", e);
      return null;
    }
  },

  /**
   * Latest stored rate (from exchange_rates), used by the dashboard
   * "Current Rate" tile so it agrees with the history list. Returns
   * null if no rates have ever been stored.
   */
  async getLatestStoredRate(client: SbLike = defaultClient): Promise<{ rate: number; date: string } | null> {
    try {
      const { data, error } = await client
        .from("exchange_rates")
        .select("date, usd_to_zar_rate")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return { rate: Number(data.usd_to_zar_rate), date: data.date };
    } catch (e) {
      console.error("[currency] getLatestStoredRate failed:", e);
      return null;
    }
  },

  /**
   * Upsert today's rate row. Used by runDailyCheck. Accepts either
   * a number (legacy USD-only path) or a full LiveRates object.
   */
  async storeRate(rate: number | LiveRates, client: SbLike = defaultClient): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const payload: Record<string, number> =
      typeof rate === "number"
        ? { usd_to_zar_rate: rate }
        : {
            usd_to_zar_rate: rate.usd,
            eur_to_zar_rate: rate.eur,
            gbp_to_zar_rate: rate.gbp,
            aud_to_zar_rate: rate.aud,
          };
    try {
      const { data: existing, error: readErr } = await client
        .from("exchange_rates")
        .select("id")
        .eq("date", today)
        .maybeSingle();
      if (readErr) throw readErr;

      if (existing?.id) {
        await client
          .from("exchange_rates")
          .update(payload)
          .eq("id", existing.id);
      } else {
        await client
          .from("exchange_rates")
          .insert({ date: today, ...payload });
      }
    } catch (e) {
      console.error("[currency] storeRate failed:", e);
    }
  },

  async getHistoricalRates(days = DEFAULT_HISTORY_DAYS, client: SbLike = defaultClient): Promise<ExchangeRateRow[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startIso = startDate.toISOString().slice(0, 10);
      const { data, error } = await client
        .from("exchange_rates")
        .select("*")
        .gte("date", startIso)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as ExchangeRateRow[];
    } catch (e) {
      console.error("[currency] getHistoricalRates failed:", e);
      return [];
    }
  },

  calculatePercentageChange(startRate: number, endRate: number): number {
    if (!startRate) return 0;
    return ((endRate - startRate) / startRate) * 100;
  },

  /**
   * Look at the 90-day window: oldest stored row vs newest. Returns
   * the rolling change and a flag for whether it crosses the 15%
   * review trigger.
   */
  async checkForSignificantFluctuation(client: SbLike = defaultClient) {
    const rates = await this.getHistoricalRates(DEFAULT_HISTORY_DAYS, client);
    if (rates.length < 2) {
      return {
        hasFluctuation: false,
        percentageChange: 0,
        startRate: 0,
        endRate: 0,
        startDate: "",
        endDate: "",
        dataPoints: rates.length,
      };
    }
    const oldest = rates[0];
    const latest = rates[rates.length - 1];
    const percentageChange = this.calculatePercentageChange(
      Number(oldest.usd_to_zar_rate),
      Number(latest.usd_to_zar_rate),
    );
    return {
      hasFluctuation: Math.abs(percentageChange) >= FLUCTUATION_THRESHOLD_PCT,
      percentageChange,
      startRate: Number(oldest.usd_to_zar_rate),
      endRate: Number(latest.usd_to_zar_rate),
      startDate: oldest.date,
      endDate: latest.date,
      dataPoints: rates.length,
    };
  },

  async createFluctuationAlert(f: {
    startRate: number;
    endRate: number;
    percentageChange: number;
    startDate: string;
    endDate: string;
  }, client: SbLike = defaultClient): Promise<void> {
    try {
      const daysPeriod = Math.max(
        1,
        Math.floor(
          (new Date(f.endDate).getTime() - new Date(f.startDate).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );
      await client.from("currency_fluctuation_alerts").insert({
        check_date: new Date().toISOString().slice(0, 10),
        start_rate: f.startRate,
        end_rate: f.endRate,
        percentage_change: f.percentageChange,
        days_period: daysPeriod,
        alert_sent: false,
        resolved: false,
      });
    } catch (e) {
      console.error("[currency] createFluctuationAlert failed:", e);
    }
  },

  async getUnresolvedAlerts(client: SbLike = defaultClient): Promise<FluctuationAlertRow[]> {
    try {
      const { data, error } = await client
        .from("currency_fluctuation_alerts")
        .select("*")
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as FluctuationAlertRow[];
    } catch (e) {
      console.error("[currency] getUnresolvedAlerts failed:", e);
      return [];
    }
  },

  async resolveAlert(alertId: string, client: SbLike = defaultClient): Promise<void> {
    try {
      await client
        .from("currency_fluctuation_alerts")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", alertId);
    } catch (e) {
      console.error("[currency] resolveAlert failed:", e);
    }
  },

  /**
   * Drop a high-priority admin notification when a new fluctuation
   * alert is raised. Body links to /admin/platform/dashboard (the
   * old /admin/catering-ms-dashboard route never existed).
   */
  async notifyAdminOfFluctuation(f: {
    percentageChange: number;
    startRate: number;
    endRate: number;
    startDate: string;
    endDate: string;
  }, client: SbLike = defaultClient): Promise<void> {
    const sign = f.percentageChange > 0 ? "+" : "";
    const message = [
      "CURRENCY FLUCTUATION ALERT",
      "",
      `The ZAR has moved by ${f.percentageChange.toFixed(2)}% over the last 90 days.`,
      "",
      "Details:",
      `- Start Date: ${f.startDate}`,
      `- Start Rate: 1 USD = ${f.startRate.toFixed(2)} ZAR`,
      `- End Date: ${f.endDate}`,
      `- Current Rate: 1 USD = ${f.endRate.toFixed(2)} ZAR`,
      `- Change: ${sign}${f.percentageChange.toFixed(2)}%`,
      "",
      "ACTION REQUIRED:",
      "Review ZAR pricing in /admin/platform/pricing-management. The 15% threshold is a manual review trigger - pricing pegs are fixed and only change when an admin updates them.",
      "",
      "Policy reminder:",
      "Our ZAR pricing is pegged to USD. We may adjust ZAR prices when the rolling 90-day move exceeds 15%, with 30 days notice to customers.",
      "",
      "Open the platform dashboard: /admin/platform/dashboard",
    ].join("\n");

    try {
      await client.from("admin_notifications").insert({
        type: "currency_fluctuation",
        title: "Currency Fluctuation Alert: Review Pricing",
        message,
        priority: "high",
        read: false,
      });
    } catch (e) {
      console.error("[currency] notifyAdminOfFluctuation failed:", e);
    }
  },

  /**
   * One-shot daily check. Pulls live rate, stores it, and if the
   * 90-day move crosses 15% (and we haven't already alerted in the
   * last 7 days) raises an alert + admin notification.
   *
   * Server-only now - called by /api/cron/currency-check.
   */
  async runDailyCheck(client: SbLike = defaultClient): Promise<{
    rate: number;
    fluctuation: number;
    alertCreated: boolean;
  }> {
    // Phase 4 #2: fetch all four currencies in one round trip and
    // store them together so the cron populates eur/gbp/aud columns
    // alongside the existing USD rate. fluctuation detection still
    // keys off the USD-to-ZAR pair (the 15% threshold policy doesn't
    // extend to the other currencies, by design).
    const rates = await this.fetchLiveRates();
    const rate = rates.usd;
    await this.storeRate(rates, client);

    const fluctuation = await this.checkForSignificantFluctuation(client);
    let alertCreated = false;

    if (fluctuation.hasFluctuation) {
      const unresolved = await this.getUnresolvedAlerts(client);
      const recent = unresolved.find((a) => {
        const days = Math.floor(
          (Date.now() - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24),
        );
        return days < ALERT_DEDUPE_DAYS;
      });
      if (!recent) {
        await this.createFluctuationAlert(fluctuation, client);
        await this.notifyAdminOfFluctuation(fluctuation, client);
        alertCreated = true;
      }
    }

    return {
      rate,
      fluctuation: fluctuation.percentageChange,
      alertCreated,
    };
  },

  getCurrencyPolicyText() {
    return {
      short: "Prices in ZAR. USD, GBP, EUR are approximate. All payments processed in ZAR.",
      full:
        "Currency Display: Prices shown in ZAR (South African Rand). USD, GBP and EUR are approximate conversions for reference only. All payments are processed in ZAR.\n\n" +
        "USD-Pegged Pricing: Our ZAR pricing is pegged to USD. We reserve the right to adjust ZAR prices to maintain USD equivalency when the rolling 90-day rate move exceeds 15%. Customers receive 30 days advance notice of any price change. The 15% threshold is a manual review trigger, not an automated re-peg.",
    };
  },
};
