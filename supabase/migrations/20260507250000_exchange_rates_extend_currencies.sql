-- P2F-4: extend exchange_rates to cover EUR / GBP / AUD pairs
--
-- The table previously only had usd_to_zar_rate. Phase 1 P0-13 wired
-- a server-side refresh that hydrates CURRENCY_CONFIG.USD.rate from
-- this column; EUR / GBP / AUD stayed on the starter constants.
--
-- Add nullable rate columns for the other three pairs. Cron extension
-- to populate them is in src/services/currencyMonitoringService.ts.
-- Existing single-currency rows keep working (the new columns default
-- NULL until the cron starts writing them).

ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS eur_to_zar_rate NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS gbp_to_zar_rate NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS aud_to_zar_rate NUMERIC NULL;

COMMENT ON COLUMN public.exchange_rates.eur_to_zar_rate IS
  'EUR to ZAR conversion. NULL until the daily currency-check cron has populated it.';
COMMENT ON COLUMN public.exchange_rates.gbp_to_zar_rate IS
  'GBP to ZAR conversion. NULL until the daily currency-check cron has populated it.';
COMMENT ON COLUMN public.exchange_rates.aud_to_zar_rate IS
  'AUD to ZAR conversion. NULL until the daily currency-check cron has populated it.';
