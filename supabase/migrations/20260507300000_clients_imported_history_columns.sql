-- Imported history rollup columns. When a tenant onboards from another
-- system, their old CRM usually has aggregated history per client
-- ("Total events: 42, Lifetime spend: R125,000, Last event: 2024-08")
-- but no per-event breakdown to recreate as orders. These columns
-- carry that rollup so the contact card doesn't look like a fresh
-- signup on day one.
--
-- Distinct from real orders: the dashboard sums historical_lifetime_
-- spend INTO the lifetime value calculation alongside real orders, but
-- doesn't fake out the order list / kitchen prep / dispatch.
--
-- Audit follow-up to the 2026-05 megaprogramme: client import "Feature
-- B" -- smart event-history extraction.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS historical_total_events integer,
  ADD COLUMN IF NOT EXISTS historical_lifetime_spend numeric(12, 2),
  ADD COLUMN IF NOT EXISTS historical_last_event_date date,
  ADD COLUMN IF NOT EXISTS historical_last_event_type text,
  ADD COLUMN IF NOT EXISTS historical_notes text;

COMMENT ON COLUMN public.clients.historical_total_events IS
  'Imported lifetime event count from a previous system. Sums into the dashboard LTV display alongside real orders.';
COMMENT ON COLUMN public.clients.historical_lifetime_spend IS
  'Imported lifetime ZAR spend from a previous system.';
COMMENT ON COLUMN public.clients.historical_last_event_date IS
  'Most recent event date imported from a previous system.';
