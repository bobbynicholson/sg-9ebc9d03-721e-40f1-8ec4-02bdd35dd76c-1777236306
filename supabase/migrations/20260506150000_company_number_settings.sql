-- Configurable per-tenant document numbering for invoices, quotes, orders.
--
-- Why this exists:
--  * invoiceGenerationService.getNextInvoiceNumber was a regex hack on
--    the newest row, with no per-tenant control and no race protection.
--  * Order numbers were generated as ORD-{first 8 chars of UUID},
--    flagged as a collision risk on retry by the running-todo audit.
--  * Quotes had a quote_number column but nothing populated it
--    consistently.
--  * Tenants migrating from another system need to carry their last
--    issued number forward (e.g. start at INV-005531). New tenants
--    don't want INV-000001 announcing they just signed up.
--
-- This migration ships:
--  1. company_number_settings (per company, per doc-type config row)
--  2. company_number_settings_audit (history of changes)
--  3. consume_next_document_number RPC (atomic increment)
--  4. bump_number_settings_on_insert helper for safety-net triggers
--  5. Backfill: one row per (company, doc_type) with next_number set
--     just past the highest existing parsed sequence, so existing
--     numbering keeps marching forward.
--  6. Spit Braai Delivery cutover: next invoice issues as INV-005531,
--     and the lone draft INV-000001 is removed.

-- ── 1. Settings table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_number_settings (
  company_id            uuid    NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type         text    NOT NULL CHECK (document_type IN ('invoice','quote','order')),
  prefix                text    NOT NULL DEFAULT '',
  padding               int     NOT NULL DEFAULT 6 CHECK (padding BETWEEN 3 AND 10),
  include_year          boolean NOT NULL DEFAULT false,
  year_separator        text    NOT NULL DEFAULT '-' CHECK (year_separator IN ('-','/')),
  resets_yearly         boolean NOT NULL DEFAULT false,
  last_reset_year       int,
  next_number           int     NOT NULL DEFAULT 1 CHECK (next_number >= 1),
  effective_from        date    NOT NULL DEFAULT CURRENT_DATE,
  notes                 text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id    uuid REFERENCES auth.users(id),
  PRIMARY KEY (company_id, document_type)
);

COMMENT ON TABLE public.company_number_settings IS
  'Per-tenant numbering config for invoices, quotes, orders. One row per (company, doc_type). Atomically consumed by consume_next_document_number().';

-- ── 2. Audit log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_number_settings_audit (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          uuid NOT NULL,
  document_type       text NOT NULL,
  changed_by_user_id  uuid REFERENCES auth.users(id),
  changed_at          timestamptz NOT NULL DEFAULT now(),
  before              jsonb,
  after               jsonb,
  reason              text
);

CREATE INDEX IF NOT EXISTS company_number_settings_audit_company_idx
  ON public.company_number_settings_audit (company_id, document_type, changed_at DESC);

-- ── 3. RLS ──────────────────────────────────────────────────────────
-- Mirrors the order_amendments / company audit patterns: company_admin
-- and owner read + write their own rows; super_admin all. Service role
-- bypasses RLS.
ALTER TABLE public.company_number_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_number_settings_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cns_company_select ON public.company_number_settings;
CREATE POLICY cns_company_select ON public.company_number_settings FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS cns_company_insert ON public.company_number_settings;
CREATE POLICY cns_company_insert ON public.company_number_settings FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
        AND COALESCE(active_role, role::text) IN ('owner','company_admin','admin')
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS cns_company_update ON public.company_number_settings;
CREATE POLICY cns_company_update ON public.company_number_settings FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
        AND COALESCE(active_role, role::text) IN ('owner','company_admin','admin')
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS cns_audit_select ON public.company_number_settings_audit;
CREATE POLICY cns_audit_select ON public.company_number_settings_audit FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Audit insert is restricted to the API route (service role) -- no
-- self-serve insert policy. Service role bypasses RLS so the validation
-- endpoint can write before/after diffs.

-- ── 4. Atomic consumer ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_next_document_number(
  p_company_id    uuid,
  p_document_type text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s              public.company_number_settings%ROWTYPE;
  current_year   int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  seq            int;
  formatted      text;
  default_prefix text;
BEGIN
  IF p_document_type NOT IN ('invoice','quote','order') THEN
    RAISE EXCEPTION 'invalid_document_type: %', p_document_type
      USING ERRCODE = 'P0001';
  END IF;

  default_prefix := CASE p_document_type
    WHEN 'invoice' THEN 'INV-'
    WHEN 'quote'   THEN 'QUO-'
    WHEN 'order'   THEN 'ORD-'
    ELSE ''
  END;

  -- Lock the row so two concurrent callers can't read the same seq.
  SELECT * INTO s
  FROM public.company_number_settings
  WHERE company_id = p_company_id
    AND document_type = p_document_type
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.company_number_settings
      (company_id, document_type, prefix, padding, next_number)
    VALUES
      (p_company_id, p_document_type, default_prefix, 6, 1)
    RETURNING * INTO s;
  END IF;

  -- Yearly reset: when include_year + resets_yearly are both on, and
  -- we've crossed into a new calendar year since the last reset, kick
  -- the sequence back to 1.
  IF s.resets_yearly AND s.include_year
     AND (s.last_reset_year IS NULL OR s.last_reset_year < current_year)
  THEN
    s.next_number := 1;
  END IF;

  seq := s.next_number;

  formatted := s.prefix
    || CASE WHEN s.include_year
            THEN current_year::text || s.year_separator
            ELSE '' END
    || lpad(seq::text, s.padding, '0');

  UPDATE public.company_number_settings
  SET next_number = seq + 1,
      last_reset_year = CASE WHEN s.include_year
                             THEN current_year
                             ELSE s.last_reset_year END,
      updated_at = now()
  WHERE company_id = p_company_id
    AND document_type = p_document_type;

  RETURN formatted;
END;
$$;

COMMENT ON FUNCTION public.consume_next_document_number(uuid, text) IS
  'Atomically returns and advances the next number for (company, doc_type). Auto-creates the settings row with sane defaults on first call.';

GRANT EXECUTE ON FUNCTION public.consume_next_document_number(uuid, text)
  TO authenticated, service_role;

-- ── 5. Insert-trigger safety net ───────────────────────────────────
-- If a row gets inserted with a number that exceeds the current
-- next_number (someone bypassed the RPC, or a backfill seed was set
-- low), bump the counter so we never re-issue an existing number.
CREATE OR REPLACE FUNCTION public.bump_number_settings_on_insert(
  p_doc_type   text,
  p_number     text,
  p_company_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parsed_match text[];
  parsed_big   bigint;
  parsed       int;
  s            public.company_number_settings%ROWTYPE;
BEGIN
  IF p_number IS NULL OR p_company_id IS NULL THEN
    RETURN;
  END IF;

  -- Only consider the TRAILING numeric run, not all digits in the
  -- string. Legacy formats like ORD-20260208-001 should be parsed as
  -- 1 (the sequence portion), not 20260208001 (which overflows int).
  parsed_match := regexp_match(p_number, '(\d+)$');
  IF parsed_match IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    parsed_big := parsed_match[1]::bigint;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  -- Clamp to int range. If the trailing run is still > int max
  -- (effectively never with a 6-10 digit pad), skip the bump rather
  -- than crash the insert. The settings counter is int by design --
  -- we never need more than ~2 billion documents per tenant.
  IF parsed_big < 1 OR parsed_big > 2147483646 THEN
    RETURN;
  END IF;
  parsed := parsed_big::int;

  SELECT * INTO s FROM public.company_number_settings
  WHERE company_id = p_company_id
    AND document_type = p_doc_type
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Auto-seed so the next consume call doesn't collide with this row.
    INSERT INTO public.company_number_settings
      (company_id, document_type, prefix, padding, next_number)
    VALUES
      (p_company_id, p_doc_type,
       CASE p_doc_type WHEN 'invoice' THEN 'INV-' WHEN 'quote' THEN 'QUO-' WHEN 'order' THEN 'ORD-' ELSE '' END,
       6, parsed + 1);
    RETURN;
  END IF;

  IF parsed >= s.next_number THEN
    UPDATE public.company_number_settings
    SET next_number = parsed + 1, updated_at = now()
    WHERE company_id = p_company_id
      AND document_type = p_doc_type;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_number_settings_on_insert(text, text, uuid)
  TO authenticated, service_role;

-- AFTER INSERT triggers on invoices / quotes / orders.
CREATE OR REPLACE FUNCTION public.trg_invoices_bump_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.company_id IS NOT NULL THEN
    PERFORM public.bump_number_settings_on_insert('invoice', NEW.invoice_number, NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_quotes_bump_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quote_number IS NOT NULL AND NEW.company_id IS NOT NULL THEN
    PERFORM public.bump_number_settings_on_insert('quote', NEW.quote_number, NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_orders_bump_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NOT NULL AND NEW.company_id IS NOT NULL THEN
    PERFORM public.bump_number_settings_on_insert('order', NEW.order_number, NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_bump_number_after_insert ON public.invoices;
CREATE TRIGGER invoices_bump_number_after_insert
  AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_invoices_bump_number();

DROP TRIGGER IF EXISTS quotes_bump_number_after_insert ON public.quotes;
CREATE TRIGGER quotes_bump_number_after_insert
  AFTER INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_quotes_bump_number();

DROP TRIGGER IF EXISTS orders_bump_number_after_insert ON public.orders;
CREATE TRIGGER orders_bump_number_after_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_bump_number();

-- ── 6. Backfill ────────────────────────────────────────────────────
-- Seed one row per (company, doc_type) using the max parsed numeric
-- portion of any existing document number. Safety net: ON CONFLICT DO
-- NOTHING means re-running this migration won't reset live counters.

-- Backfill helper: pull the TRAILING numeric run only, clamped to int.
-- Legacy ORD-YYYYMMDD-NNN gets parsed as NNN (the seq), not the date+seq
-- mash-up which overflows int.
CREATE OR REPLACE FUNCTION public.cms_parse_doc_seq(p_number text)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  m text[];
  v bigint;
BEGIN
  IF p_number IS NULL THEN RETURN 0; END IF;
  m := regexp_match(p_number, '(\d+)$');
  IF m IS NULL THEN RETURN 0; END IF;
  BEGIN
    v := m[1]::bigint;
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;
  IF v < 1 OR v > 2147483646 THEN RETURN 0; END IF;
  RETURN v::int;
END;
$$;

WITH max_inv AS (
  SELECT
    company_id,
    COALESCE(MAX(public.cms_parse_doc_seq(invoice_number)), 0) AS max_seq
  FROM public.invoices
  WHERE company_id IS NOT NULL
  GROUP BY company_id
)
INSERT INTO public.company_number_settings (company_id, document_type, prefix, next_number)
SELECT c.id, 'invoice', 'INV-', COALESCE(m.max_seq, 0) + 1
FROM public.companies c
LEFT JOIN max_inv m ON m.company_id = c.id
WHERE c.deleted_at IS NULL
ON CONFLICT (company_id, document_type) DO NOTHING;

WITH max_quo AS (
  SELECT
    company_id,
    COALESCE(MAX(public.cms_parse_doc_seq(quote_number)), 0) AS max_seq
  FROM public.quotes
  WHERE company_id IS NOT NULL
  GROUP BY company_id
)
INSERT INTO public.company_number_settings (company_id, document_type, prefix, next_number)
SELECT c.id, 'quote', 'QUO-', COALESCE(m.max_seq, 0) + 1
FROM public.companies c
LEFT JOIN max_quo m ON m.company_id = c.id
WHERE c.deleted_at IS NULL
ON CONFLICT (company_id, document_type) DO NOTHING;

WITH max_ord AS (
  SELECT
    company_id,
    COALESCE(MAX(public.cms_parse_doc_seq(order_number)), 0) AS max_seq
  FROM public.orders
  WHERE company_id IS NOT NULL
  GROUP BY company_id
)
INSERT INTO public.company_number_settings (company_id, document_type, prefix, next_number)
SELECT c.id, 'order', 'ORD-', COALESCE(m.max_seq, 0) + 1
FROM public.companies c
LEFT JOIN max_ord m ON m.company_id = c.id
WHERE c.deleted_at IS NULL
ON CONFLICT (company_id, document_type) DO NOTHING;

-- ── 7. Spit Braai Delivery cutover ─────────────────────────────────
-- Bobby asked for SBD's next invoice to issue as INV-005531 (carrying
-- forward from their previous tool). Plus drop the lone draft
-- INV-000001 left over from earlier testing -- invoice_status enum
-- has no 'cancelled' value, so we delete the draft outright. Safe
-- because it's a draft (no payment, no client comms).
DO $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE slug = 'spit-braai-delivery'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'spit-braai-delivery company not found, skipping cutover';
    RETURN;
  END IF;

  UPDATE public.company_number_settings
  SET next_number = 5531,
      updated_at  = now()
  WHERE document_type = 'invoice'
    AND company_id = v_company_id;

  DELETE FROM public.invoices
  WHERE company_id = v_company_id
    AND status = 'draft'
    AND invoice_number = 'INV-000001';
END $$;
