-- Stage 1: create service-only vaults and copy legacy values without breaking
-- the currently deployed application. The follow-up migration removes the
-- old columns only after the new code and vault backfill are live.

CREATE TABLE IF NOT EXISTS public.platform_billing_credentials (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'payfast' CHECK (provider = 'payfast'),
  token_ciphertext text,
  token_hash text UNIQUE,
  legacy_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_billing_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_billing_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_billing_credentials TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies'
      AND column_name = 'payfast_subscription_token'
  ) THEN
    INSERT INTO public.platform_billing_credentials(company_id, legacy_token)
    SELECT id, payfast_subscription_token FROM public.companies
    WHERE payfast_subscription_token IS NOT NULL AND payfast_subscription_token <> ''
    ON CONFLICT (company_id) DO UPDATE SET legacy_token = EXCLUDED.legacy_token
      WHERE public.platform_billing_credentials.token_ciphertext IS NULL
        AND public.platform_billing_credentials.legacy_token IS NULL;
  END IF;
END $$;

-- Legacy supplier account numbers are preserved in a service-role-only table.
CREATE TABLE IF NOT EXISTS public.supplier_bank_details (
  supplier_id uuid PRIMARY KEY REFERENCES public.suppliers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_number text,
  account_number_ciphertext text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_bank_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_bank_details FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.supplier_bank_details TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers'
      AND column_name = 'account_number'
  ) THEN
    INSERT INTO public.supplier_bank_details(supplier_id, company_id, account_number)
    SELECT id, company_id, account_number FROM public.suppliers
    WHERE account_number IS NOT NULL AND account_number <> ''
    ON CONFLICT (supplier_id) DO UPDATE SET account_number = EXCLUDED.account_number
      WHERE public.supplier_bank_details.account_number_ciphertext IS NULL
        AND public.supplier_bank_details.account_number IS NULL;
  END IF;
END $$;

-- Preserve the legacy merge behavior for already-deployed callers. New
-- encrypted bundles are complete snapshots and replace legacy JSON so no
-- plaintext credential keys remain beside the ciphertext envelope.
CREATE OR REPLACE FUNCTION public.configure_company_payment_gateway(
  p_company_id uuid, p_actor_id uuid, p_provider text, p_is_test boolean,
  p_credentials jsonb, p_success_url text DEFAULT NULL, p_cancel_url text DEFAULT NULL,
  p_notify_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gateway public.payment_gateways%ROWTYPE;
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('payfast','yoco','stripe') OR p_is_test IS NULL
    OR p_credentials IS NULL OR jsonb_typeof(p_credentials) <> 'object' THEN RAISE EXCEPTION 'Invalid gateway configuration'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('company-gateway:' || p_company_id::text,0));
  SELECT * INTO v_gateway FROM public.payment_gateways WHERE company_id = p_company_id
    AND provider = p_provider AND deleted_at IS NULL FOR UPDATE;
  IF FOUND THEN
    UPDATE public.payment_gateways SET is_test = p_is_test, success_url = p_success_url,
      cancel_url = p_cancel_url, notify_url = p_notify_url, last_verified_at = NULL, updated_by_user_id = p_actor_id
      WHERE id = v_gateway.id RETURNING * INTO v_gateway;
  ELSE
    INSERT INTO public.payment_gateways(company_id,provider,is_active,is_test,success_url,cancel_url,notify_url,created_by_user_id,updated_by_user_id)
      VALUES(p_company_id,p_provider,false,p_is_test,p_success_url,p_cancel_url,p_notify_url,p_actor_id,p_actor_id)
      RETURNING * INTO v_gateway;
  END IF;
  INSERT INTO public.payment_gateway_credentials(gateway_id,credentials) VALUES(v_gateway.id,p_credentials)
    ON CONFLICT (gateway_id) DO UPDATE SET
      credentials = CASE
        WHEN EXCLUDED.credentials ? '__encrypted_v1' THEN EXCLUDED.credentials
        ELSE public.payment_gateway_credentials.credentials || EXCLUDED.credentials
      END,
      updated_at = now();
  RETURN to_jsonb(v_gateway);
END;
$$;
REVOKE ALL ON FUNCTION public.configure_company_payment_gateway(uuid,uuid,text,boolean,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_company_payment_gateway(uuid,uuid,text,boolean,jsonb,text,text,text) TO service_role;

-- New checkouts pass an encrypted envelope. Its keyed fingerprint makes
-- snapshots deduplicate without storing a plaintext-derived MD5 digest.
CREATE OR REPLACE FUNCTION public.capture_checkout_gateway_credentials(
  p_gateway_id uuid, p_credentials jsonb, p_is_test boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gateway public.payment_gateways%ROWTYPE; v_id uuid; v_hash text;
BEGIN
  SELECT * INTO v_gateway FROM public.payment_gateways WHERE id = p_gateway_id;
  IF NOT FOUND OR p_credentials IS NULL OR p_is_test IS NULL THEN RAISE EXCEPTION 'Gateway unavailable'; END IF;
  v_hash := COALESCE(p_credentials->>'__fingerprint', md5(p_credentials::text || ':' || p_is_test::text));
  INSERT INTO public.payment_gateway_credential_versions(gateway_id,company_id,provider,is_test,credentials,fingerprint)
    VALUES(p_gateway_id,v_gateway.company_id,v_gateway.provider,p_is_test,p_credentials,v_hash)
    ON CONFLICT (gateway_id,fingerprint) DO NOTHING;
  SELECT id INTO v_id FROM public.payment_gateway_credential_versions WHERE gateway_id = p_gateway_id AND fingerprint = v_hash;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_checkout_gateway_credentials(uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_checkout_gateway_credentials(uuid,jsonb,boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
