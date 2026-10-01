-- Isolated, one-time R5 PayFast flow test for the dedicated test tenant.
-- Keep this row inactive so generic pricing and tenant plan lists never show it.
-- The checkout and ITN handlers allow it only for raj267748-payfast-test.
DO $migration$
BEGIN
  IF to_regclass('public.platform_pricing_plans') IS NULL THEN
    RAISE NOTICE 'platform_pricing_plans is not installed; skipping PayFast test plan seed';
  ELSE
    INSERT INTO public.platform_pricing_plans (
      slug, name, sort_order, zar_price, usd_price, gbp_price, eur_price,
      features, active_clients_limit, orders_per_quarter_limit,
      is_recommended, is_active
    ) VALUES (
      'payfast-test',
      'PayFast Flow Test',
      999,
      5,
      5,
      5,
      5,
      '["One R5 payment only","Confirms PayFast notification and return","Test tenant access"]'::jsonb,
      50,
      150,
      false,
      false
    )
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      zar_price = EXCLUDED.zar_price,
      usd_price = EXCLUDED.usd_price,
      gbp_price = EXCLUDED.gbp_price,
      eur_price = EXCLUDED.eur_price,
      features = EXCLUDED.features,
      active_clients_limit = EXCLUDED.active_clients_limit,
      orders_per_quarter_limit = EXCLUDED.orders_per_quarter_limit,
      is_recommended = false,
      is_active = false,
      updated_at = now();
  END IF;
END
$migration$;
