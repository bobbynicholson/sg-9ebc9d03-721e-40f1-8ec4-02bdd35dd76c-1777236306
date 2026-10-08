-- Restore the SBD PDF archive from its immutable import_rows.source_data.
--
-- The import was verified on 2026-10-06, but later reconciliation/UI edits
-- left a number of historic payment, VAT and quote-line fields inconsistent
-- with the archived PDFs.  The original PDF parse in import_rows is the
-- authoritative source.  No payment-ledger rows are invented: the PDFs do
-- not include payment dates, methods or transaction references.
BEGIN;

DO $$
DECLARE
  v_job_id constant uuid := 'a623e88a-287d-44e0-98c6-f02bffe65e03';
  v_source_rows integer;
  v_quotes integer;
  v_orders integer;
BEGIN
  -- Other environments do not carry this one-off production archive.
  IF NOT EXISTS (SELECT 1 FROM public.import_jobs WHERE id = v_job_id) THEN
    RAISE NOTICE 'SBD legacy-PDF import job is not present; nothing to restore.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_source_rows FROM public.import_rows WHERE job_id = v_job_id;
  SELECT count(*) INTO v_quotes FROM public.quotes WHERE import_job_id = v_job_id;
  SELECT count(*) INTO v_orders FROM public.orders WHERE import_job_id = v_job_id;
  IF v_source_rows <> 26 OR v_quotes <> 26 OR v_orders <> 26 THEN
    RAISE EXCEPTION
      'Refusing SBD restore: expected 26 source rows, quotes and orders; found %, %, %',
      v_source_rows, v_quotes, v_orders;
  END IF;
END
$$;

-- Restore every source-derived quote total, event value, VAT mirror and
-- original banking/legal wording.  The current company terms remain on the
-- company profile; this preserves the wording printed on these historic PDFs.
WITH source AS (
  SELECT ir.source_data AS data, q.id AS quote_id
  FROM public.import_rows ir
  JOIN public.quotes q
    ON q.import_job_id = ir.job_id
   AND q.quote_number = ir.source_data->>'quote_number'
  WHERE ir.job_id = 'a623e88a-287d-44e0-98c6-f02bffe65e03'
)
UPDATE public.quotes q
SET quote_name = s.data->>'quote_name',
    client_name = s.data->>'client_name',
    contact_name = s.data->>'client_name',
    client_email = s.data->>'client_email',
    client_phone = s.data->>'client_phone',
    event_date = (s.data->>'valid_until')::date,
    event_time = NULLIF(s.data->>'event_time', '')::time,
    guest_count = (s.data->>'inferred_guest_count')::integer,
    subtotal = (s.data->>'subtotal')::numeric,
    tax_amount = (s.data->>'tax_amount')::numeric,
    tax = (s.data->>'tax_amount')::numeric,
    total_amount = (s.data->>'total_amount')::numeric,
    total = (s.data->>'total_amount')::numeric,
    delivery_fee = (s.data->>'delivery_fee')::numeric,
    -- Delivery and collection remain priced source line items.  Do not copy
    -- collection into this separate fee field as that would double charge it.
    collection_fee = 0,
    initial_payment_amount = NULLIF(s.data->'payments'->0->>'amount', '')::numeric,
    valid_until = (s.data->>'valid_until')::date,
    sent_at = ((s.data->>'estimate_date') || 'T00:00:00+00:00')::timestamptz,
    terms_and_conditions = concat_ws(E'\n\n',
      NULLIF(s.data->>'terms', ''),
      'Please note that all prices are subject to change without notice or prior approval.',
      'Please go to the following web address to view our Terms & Conditions; https://spitbraaidelivery.co.za/terms-of-service/'
    ),
    comms_paused_until = '2099-12-31T23:59:59+00:00'::timestamptz
FROM source s
WHERE q.id = s.quote_id;

-- Restore the three quote JSON menus that were edited away from the source.
-- Preserve catalogue links where the original imported row has a match.
WITH source AS (
  SELECT ir.source_data AS data, q.id AS quote_id, q.menu_items AS current_items
  FROM public.import_rows ir
  JOIN public.quotes q
    ON q.import_job_id = ir.job_id
   AND q.quote_number = ir.source_data->>'quote_number'
  WHERE ir.job_id = 'a623e88a-287d-44e0-98c6-f02bffe65e03'
    AND q.quote_number IN ('QUO0035549', 'QUO0035627', 'QUO0035709')
), rebuilt AS (
  SELECT s.quote_id,
    jsonb_agg(
      jsonb_build_object(
        'id', COALESCE(existing.item->>'id', 'legacy-' || (s.data->>'quote_number') || '-' || source_item.position::text),
        'name', source_item.item->>'item_name',
        'item_name', source_item.item->>'item_name',
        'description', source_item.item->>'description',
        'quantity', (source_item.item->>'quantity')::integer,
        'unit_price', (source_item.item->>'unit_price')::numeric,
        'price', (source_item.item->>'unit_price')::numeric,
        'line_total', (source_item.item->>'line_total')::numeric,
        'total', (source_item.item->>'line_total')::numeric,
        'pricing_mode', CASE WHEN (source_item.item->>'quantity')::integer = 1 THEN 'flat' ELSE 'per_person' END,
        'menu_item_id', COALESCE(existing.item->'menu_item_id', 'null'::jsonb),
        'source', 'legacy_pdf_import'
      )
      ORDER BY source_item.position
    ) AS menu_items
  FROM source s
  CROSS JOIN LATERAL jsonb_array_elements(s.data->'items') WITH ORDINALITY AS source_item(item, position)
  LEFT JOIN LATERAL (
    SELECT current_item.item
    FROM jsonb_array_elements(s.current_items) AS current_item(item)
    WHERE current_item.item->>'item_name' = source_item.item->>'item_name'
    LIMIT 1
  ) existing ON true
  GROUP BY s.quote_id
)
UPDATE public.quotes q
SET menu_items = rebuilt.menu_items
FROM rebuilt
WHERE q.id = rebuilt.quote_id;

-- Restore every operational line from the archived source.  This repairs the
-- three edited orders' quantities and descriptions without deleting records.
WITH source_lines AS (
  SELECT (ir.mapped_data->>'order_id')::uuid AS order_id, item.value AS item
  FROM public.import_rows ir
  CROSS JOIN LATERAL jsonb_array_elements(ir.source_data->'items') AS item(value)
  WHERE ir.job_id = 'a623e88a-287d-44e0-98c6-f02bffe65e03'
)
UPDATE public.order_items oi
SET description = NULLIF(source_lines.item->>'description', ''),
    quantity = (source_lines.item->>'quantity')::integer,
    unit_price = (source_lines.item->>'unit_price')::numeric,
    line_total = (source_lines.item->>'line_total')::numeric
FROM source_lines
WHERE oi.order_id = source_lines.order_id
  AND oi.item_name = source_lines.item->>'item_name';

-- Keep the historic amounts as a non-ledger opening balance.  This makes
-- future reconciliation add only real payment rows instead of erasing the
-- confirmed payments evidenced in the source PDFs.
WITH source AS (
  SELECT ir.source_data AS data, (ir.mapped_data->>'order_id')::uuid AS order_id
  FROM public.import_rows ir
  WHERE ir.job_id = 'a623e88a-287d-44e0-98c6-f02bffe65e03'
), calculated AS (
  SELECT data, order_id,
    COALESCE((
      SELECT sum((payment.value->>'amount')::numeric)
      FROM jsonb_array_elements(COALESCE(data->'payments', '[]'::jsonb)) AS payment(value)
      WHERE COALESCE((payment.value->>'is_paid')::boolean, false)
    ), 0)::numeric AS opening_paid,
    COALESCE(NULLIF(data->'payments'->0->>'amount', '')::numeric, 0)::numeric AS deposit_amount
  FROM source
)
UPDATE public.orders o
SET event_name = c.data->>'quote_name',
    event_date = (c.data->>'valid_until')::date,
    event_end_date = (c.data->>'valid_until')::date,
    event_time = NULLIF(c.data->>'event_time', '')::time,
    guest_count = (c.data->>'inferred_guest_count')::integer,
    subtotal = (c.data->>'subtotal')::numeric,
    tax_amount = (c.data->>'tax_amount')::numeric,
    tax = (c.data->>'tax_amount')::numeric,
    total_amount = (c.data->>'total_amount')::numeric,
    delivery_fee = (c.data->>'delivery_fee')::numeric,
    collection_fee = 0,
    deposit_amount = NULLIF(c.data->'payments'->0->>'amount', '')::numeric,
    payment_opening_paid = c.opening_paid,
    amount_paid = c.opening_paid,
    balance_amount = GREATEST(0, (c.data->>'total_amount')::numeric - c.opening_paid),
    deposit_paid = c.opening_paid >= c.deposit_amount AND c.deposit_amount > 0,
    balance_paid = c.opening_paid >= (c.data->>'total_amount')::numeric,
    payment_status = CASE
      WHEN c.opening_paid >= (c.data->>'total_amount')::numeric THEN 'paid'::public.payment_status
      WHEN c.opening_paid > 0 THEN 'partial'::public.payment_status
      ELSE 'pending'::public.payment_status
    END,
    payment_method = 'eft'::public.payment_method,
    balance_due_date = CASE
      WHEN c.data->>'raw_text' ~* E'48\\s*hrs?\\s+prior'
        THEN ((c.data->>'valid_until')::date - 2)::timestamptz
      ELSE NULL
    END,
    special_instructions = CASE
      WHEN NULLIF(c.data->>'customer_reference', '') IS NULL THEN NULL
      ELSE 'Legacy customer reference: ' || (c.data->>'customer_reference')
    END,
    comms_paused_until = '2099-12-31T23:59:59+00:00'::timestamptz
FROM calculated c
WHERE o.id = c.order_id;

UPDATE public.import_jobs
SET review_notes = concat_ws(E'\n', review_notes,
  '2026-10-08: Restored all 26 quotes/orders from the immutable imported PDF data. Historic paid totals are retained as payment_opening_paid; no payment ledger rows were created because the PDFs do not provide payment dates, methods or references.'),
    summary = jsonb_set(
      COALESCE(summary, '{}'::jsonb),
      '{source_repair}',
      jsonb_build_object(
        'at', now(),
        'source', 'import_rows.source_data',
        'quotes_restored', 26,
        'orders_restored', 26,
        'payment_ledger_rows_created', 0
      ),
      true
    )
WHERE id = 'a623e88a-287d-44e0-98c6-f02bffe65e03';

COMMIT;
