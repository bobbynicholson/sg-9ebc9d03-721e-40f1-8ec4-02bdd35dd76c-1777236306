-- Preserve client and quote currency choices through checkout and invoices,
-- and make sure every public document has a usable, unique share token.
BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS preferred_currency text;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS public_token uuid;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS public_token uuid;

-- Earlier production schema versions had the token column but did not
-- consistently define its default or backfill rows. Preserve the existing
-- column type (UUID or text), repair NULL/duplicate tokens, then enforce the
-- same unique-token contract for quotes and invoices.
DO $$
DECLARE
  v_table text;
  v_data_type text;
  v_token_expr text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['quotes', 'invoices'] LOOP
    SELECT data_type
      INTO v_data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = v_table
       AND column_name = 'public_token';

    IF v_data_type = 'uuid' THEN
      v_token_expr := 'gen_random_uuid()';
    ELSIF v_data_type IN ('text', 'character varying', 'character') THEN
      v_token_expr := 'gen_random_uuid()::text';
    ELSE
      RAISE EXCEPTION 'Unsupported public.% public_token type: %', v_table, v_data_type;
    END IF;

    EXECUTE format(
      'WITH duplicates AS (
         SELECT id, row_number() OVER (PARTITION BY public_token ORDER BY id) AS token_rank
           FROM public.%I
          WHERE public_token IS NOT NULL
       )
       UPDATE public.%I AS row_to_fix
          SET public_token = %s
         FROM duplicates
        WHERE row_to_fix.id = duplicates.id
          AND duplicates.token_rank > 1',
      v_table, v_table, v_token_expr
    );
    EXECUTE format(
      'UPDATE public.%I SET public_token = %s WHERE public_token IS NULL OR length(BTRIM(public_token::text)) = 0',
      v_table, v_token_expr
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN public_token SET DEFAULT %s',
      v_table, v_token_expr
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN public_token SET NOT NULL',
      v_table
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (public_token)',
      v_table || '_public_token_key', v_table
    );
  END LOOP;
END $$;

-- A NULL client preference inherits the company default. Do not put a
-- database default on this field because that would force every new client
-- to ZAR, including clients of companies whose default is another currency.
UPDATE public.clients
   SET preferred_currency = NULLIF(UPPER(BTRIM(preferred_currency)), '')
 WHERE preferred_currency IS NOT NULL;

UPDATE public.quotes AS q
   SET currency = COALESCE(
     NULLIF(UPPER(BTRIM(q.currency)), ''),
     (SELECT NULLIF(UPPER(BTRIM(cl.preferred_currency)), '')
        FROM public.clients AS cl WHERE cl.id = q.client_id),
     (SELECT NULLIF(UPPER(BTRIM(co.currency)), '')
        FROM public.companies AS co WHERE co.id = q.company_id),
     'ZAR'
   )
 WHERE q.currency IS NULL OR BTRIM(q.currency) = '';

UPDATE public.invoices AS i
   SET currency = COALESCE(
     NULLIF(UPPER(BTRIM(i.currency)), ''),
     (SELECT NULLIF(UPPER(BTRIM(o.currency)), '')
        FROM public.orders AS o WHERE o.id = i.order_id),
     (SELECT NULLIF(UPPER(BTRIM(q.currency)), '')
        FROM public.orders AS o JOIN public.quotes AS q ON q.id = o.quote_id
       WHERE o.id = i.order_id),
     (SELECT NULLIF(UPPER(BTRIM(cl.preferred_currency)), '')
        FROM public.clients AS cl WHERE cl.id = i.client_id),
     (SELECT NULLIF(UPPER(BTRIM(co.currency)), '')
        FROM public.companies AS co WHERE co.id = i.company_id),
     'ZAR'
   )
 WHERE i.currency IS NULL OR BTRIM(i.currency) = '';

COMMIT;
