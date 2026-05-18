/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCY_CONFIG, type CurrencyCode } from "@/lib/currencyUtils";

/**
 * Phase 5 #10: tenant currency hook. Reads companies.currency for
 * the current tenant and returns the code + symbol + a money
 * formatter. Defaults to ZAR/R so any caller that mounts before
 * the row resolves still renders a sensible value.
 *
 * Cached per tenant in module scope so the second hook call doesn't
 * re-query Supabase. Cache invalidates when companyId changes.
 */
const cache = new Map<string, CurrencyCode>();

export interface TenantCurrency {
  code: CurrencyCode;
  symbol: string;
  /** Format a number as the tenant's currency. */
  format: (n: number, decimals?: number) => string;
  /** True when the value is still defaulting (the DB read hasn't
   *  resolved yet) - callers can render a skeleton if they want
   *  to avoid showing a temporary 'R' when the real currency is
   *  'GBP'. */
  loading: boolean;
}

const DEFAULT: CurrencyCode = "ZAR";

export function useTenantCurrency(
  companyId: string | null | undefined,
): TenantCurrency {
  const [code, setCode] = useState<CurrencyCode>(
    companyId && cache.has(companyId) ? cache.get(companyId)! : DEFAULT,
  );
  const [loading, setLoading] = useState<boolean>(
    !companyId || !cache.has(companyId),
  );

  useEffect(() => {
    if (!companyId) {
      setCode(DEFAULT);
      setLoading(false);
      return;
    }
    if (cache.has(companyId)) {
      setCode(cache.get(companyId)!);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("companies")
          .select("currency")
          .eq("id", companyId)
          .maybeSingle();
        if (error) {
          console.error("[useTenantCurrency] companies fetch failed:", error);
        }
        if (cancelled) return;
        const raw = (data as any)?.currency as string | undefined;
        const next: CurrencyCode =
          raw && raw in CURRENCY_CONFIG ? (raw as CurrencyCode) : DEFAULT;
        cache.set(companyId, next);
        setCode(next);
      } catch {
        // Default already in place.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const symbol = CURRENCY_CONFIG[code].symbol;
  const format = (n: number, decimals = 2): string =>
    `${symbol} ${Number(n || 0).toFixed(decimals)}`;

  return { code, symbol, format, loading };
}
