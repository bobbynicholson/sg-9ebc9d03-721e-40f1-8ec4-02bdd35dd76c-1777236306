-- ============================================================================
-- Reset ONE company's sales data: all quotes, orders, invoices and payments
-- (incl. refunds, store-credit rows, checkout attempts) plus every row that
-- hangs off them. Same scope as scripts/reset-company-sales-data.mjs.
--
-- KEEPS: the company, users, clients, leads, menu/recipes, equipment,
-- inventory, vehicles, payment-gateway setup, plan subscription, templates.
-- Other companies are never touched.
--
-- HOW TO RUN (Supabase -> SQL Editor):
--   1. Optional preview: run only STEP 0 (select it and run) to see counts.
--   2. Run the whole file. It is one transaction: it either completes fully
--      or changes nothing.
--   3. To rehearse without deleting, change the final COMMIT to ROLLBACK.
--
-- This cannot be undone once committed. Take a backup first if unsure.
-- To use for another company, change the slug in BOTH places below.
-- ============================================================================

-- STEP 0 (preview only, read-only) -------------------------------------------
SELECT 'quotes' AS what, count(*) FROM public.quotes q JOIN public.companies c ON c.id = q.company_id WHERE c.slug = 'spit-braai-delivery'
UNION ALL SELECT 'orders',   count(*) FROM public.orders o   JOIN public.companies c ON c.id = o.company_id WHERE c.slug = 'spit-braai-delivery'
UNION ALL SELECT 'invoices', count(*) FROM public.invoices i JOIN public.companies c ON c.id = i.company_id WHERE c.slug = 'spit-braai-delivery'
UNION ALL SELECT 'payments', count(*) FROM public.payments p JOIN public.companies c ON c.id = p.company_id WHERE c.slug = 'spit-braai-delivery';

-- STEP 1 (delete) -------------------------------------------------------------
BEGIN;

DO $$
DECLARE
  v_slug       constant text := 'spit-braai-delivery';
  v_company_id uuid;
  v_quotes     uuid[];
  v_orders     uuid[];
  v_invoices   uuid[];
  v_payments   uuid[];
  v_step       record;
  v_ids        uuid[];
  v_count      bigint;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug = v_slug;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company with slug %', v_slug;
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_quotes   FROM public.quotes   WHERE company_id = v_company_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_orders   FROM public.orders   WHERE company_id = v_company_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_invoices FROM public.invoices WHERE company_id = v_company_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_payments FROM public.payments WHERE company_id = v_company_id;
  RAISE NOTICE 'Company % (%): % quotes, % orders, % invoices, % payments',
    v_slug, v_company_id, cardinality(v_quotes), cardinality(v_orders), cardinality(v_invoices), cardinality(v_payments);

  -- Clear links that would block deletes or dangle afterwards.
  FOR v_step IN SELECT * FROM (VALUES
      ('payments', 'refund_original_payment_id'),
      ('quotes',   'converted_to_order_id'),
      ('quotes',   'parent_quote_id'),
      ('orders',   'quote_id'),
      ('leads',    'source_order_id')
    ) AS t(tbl, col)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = v_step.tbl AND column_name = v_step.col)
       AND EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = v_step.tbl AND column_name = 'company_id') THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE company_id = $1 AND %I IS NOT NULL',
                     v_step.tbl, v_step.col, v_step.col) USING v_company_id;
    END IF;
  END LOOP;

  -- Children first, then the spine. kind: o=order ids, q=quote ids,
  -- i=invoice ids, p=payment ids, c=company id. Missing tables/columns skip.
  FOR v_step IN SELECT * FROM (VALUES
      -- order children
      ('order_items','order_id','o'), ('order_status_history','order_id','o'), ('order_attachments','order_id','o'),
      ('order_chat_messages','order_id','o'), ('order_amendment_requests','order_id','o'),
      ('order_assignment_audit','order_id','o'), ('order_driver_interest','order_id','o'),
      ('order_reviews','order_id','o'), ('order_work_contributors','order_id','o'),
      ('driver_assignments','order_id','o'), ('driver_confirmations','order_id','o'),
      ('driver_replacement_requests','order_id','o'), ('driver_shifts','order_id','o'), ('driver_earnings','order_id','o'),
      ('deliveries','order_id','o'), ('delivery_feedback','order_id','o'), ('delivery_stops','order_id','o'),
      ('delivery_route_stops','order_id','o'), ('route_stops','order_id','o'), ('dispatch_messages','order_id','o'),
      ('gps_tracking','order_id','o'), ('proximity_alerts','order_id','o'), ('vehicle_bookings','order_id','o'),
      ('kitchen_prep_tasks','order_id','o'), ('kitchen_duty_shifts','order_id','o'), ('kitchen_shifts','order_id','o'),
      ('kitchen_task_completions','order_id','o'), ('prep_lists','order_id','o'),
      ('recipe_scaling_history','order_id','o'), ('inventory_transactions','order_id','o'),
      ('cleaning_event_checklists','order_id','o'), ('cleaning_event_handovers','order_id','o'),
      ('equipment_bookings','order_id','o'), ('equipment_damages','order_id','o'), ('equipment_handovers','order_id','o'),
      ('equipment_hire_orders','order_id','o'), ('equipment_shortage_flags','order_id','o'),
      ('equipment_shortage_reports','order_id','o'), ('equipment_assignments','order_id','o'),
      ('outsource_assignments','order_id','o'), ('after_sales_schedules','order_id','o'),
      ('event_attendance','order_id','o'), ('pending_reviews','order_id','o'), ('cancellation_requests','order_id','o'),
      ('complaints','order_id','o'), ('complaint_tickets','order_id','o'),
      ('client_access_log','order_id','o'), ('client_access_tokens','order_id','o'),
      ('email_automation_log','order_id','o'), ('gamification_points','order_id','o'),
      ('role_work_sessions','order_id','o'), ('payment_reminders','order_id','o'), ('payment_schedules','order_id','o'),
      ('shopping_list_items','source_order_id','o'),
      -- quote children
      ('quote_items','quote_id','q'), ('quote_acceptances','quote_id','q'), ('quote_change_requests','quote_id','q'),
      ('quote_followup_log','quote_id','q'), ('equipment_hire_orders','quote_id','q'),
      -- money children
      ('payment_receipt_outbox','payment_id','p'), ('refund_reconciliation_events','payment_id','p'),
      ('payment_credit_redemptions','invoice_id','i'), ('payment_credit_redemptions','order_id','o'),
      ('payment_credit_redemptions','company_id','c'), ('recurring_invoice_runs','invoice_id','i'),
      ('payment_attempts','company_id','c'), ('payment_gateway_events','company_id','c'),
      -- the spine
      ('payments','company_id','c'), ('invoices','company_id','c'),
      ('orders','company_id','c'), ('quotes','company_id','c')
    ) AS t(tbl, col, kind)
  LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_step.tbl AND column_name = v_step.col);
    v_ids := CASE v_step.kind
      WHEN 'o' THEN v_orders WHEN 'q' THEN v_quotes WHEN 'i' THEN v_invoices
      WHEN 'p' THEN v_payments ELSE ARRAY[v_company_id] END;
    CONTINUE WHEN cardinality(v_ids) = 0;
    EXECUTE format('DELETE FROM public.%I WHERE %I = ANY($1)', v_step.tbl, v_step.col) USING v_ids;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE NOTICE 'deleted % from %.%', v_count, v_step.tbl, v_step.col;
    END IF;
  END LOOP;

  -- Safety check: abort (and roll everything back) if anything remains.
  IF EXISTS (SELECT 1 FROM public.quotes   WHERE company_id = v_company_id)
  OR EXISTS (SELECT 1 FROM public.orders   WHERE company_id = v_company_id)
  OR EXISTS (SELECT 1 FROM public.invoices WHERE company_id = v_company_id)
  OR EXISTS (SELECT 1 FROM public.payments WHERE company_id = v_company_id) THEN
    RAISE EXCEPTION 'Rows remain for % - nothing was deleted', v_slug;
  END IF;
  RAISE NOTICE 'Done: % has no quotes, orders, invoices or payments left.', v_slug;
END $$;

COMMIT;   -- change to ROLLBACK to rehearse without deleting
