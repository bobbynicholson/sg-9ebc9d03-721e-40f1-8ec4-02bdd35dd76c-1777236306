-- FIX (2026-06-12): "function mint_client_order_token(uuid, uuid, text)
-- is not unique".
--
-- TIGHTEN I.123 (20260603140000) re-declared mint_client_order_token
-- with a new p_ttl_hours integer DEFAULT 1440 parameter. CREATE OR
-- REPLACE only replaces a function with the SAME argument list, so
-- Postgres kept the original 3-param overload and created the 4-param
-- one beside it. Every existing 3-argument call (customerLinksServer
-- mintOrderCustomerLink, status-change emails, the public quote accept
-- confirmation) now matches BOTH overloads - the 4-param one via its
-- default - and fails with "is not unique" instead of minting a token.
-- Net effect: client order links in emails silently degraded to the
-- tokenless fallback URL.
--
-- Drop the legacy 3-param overload; the 4-param version with defaults
-- serves every caller.

DROP FUNCTION IF EXISTS public.mint_client_order_token(uuid, uuid, text);
