-- Secrets never enter payment_attempts (which tenants can read). Keep the
-- checkout's exact merchant/mode/key bundle in a service-only version store.
CREATE TABLE IF NOT EXISTS public.payment_gateway_credential_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES public.payment_gateways(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  provider text NOT NULL,
  is_test boolean NOT NULL,
  credentials jsonb NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_id, fingerprint)
);
ALTER TABLE public.payment_gateway_credential_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_gateway_credential_versions FROM anon, authenticated;
GRANT ALL ON public.payment_gateway_credential_versions TO service_role;

CREATE OR REPLACE FUNCTION public.capture_checkout_gateway_credentials(
  p_gateway_id uuid, p_credentials jsonb, p_is_test boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gateway public.payment_gateways%ROWTYPE; v_id uuid; v_hash text;
BEGIN
  SELECT * INTO v_gateway FROM public.payment_gateways WHERE id = p_gateway_id;
  IF NOT FOUND OR p_credentials IS NULL OR p_is_test IS NULL THEN RAISE EXCEPTION 'Gateway unavailable'; END IF;
  v_hash := md5(p_credentials::text || ':' || p_is_test::text);
  INSERT INTO public.payment_gateway_credential_versions(gateway_id,company_id,provider,is_test,credentials,fingerprint)
    VALUES(p_gateway_id,v_gateway.company_id,v_gateway.provider,p_is_test,p_credentials,v_hash)
    ON CONFLICT (gateway_id,fingerprint) DO NOTHING;
  SELECT id INTO v_id FROM public.payment_gateway_credential_versions WHERE gateway_id = p_gateway_id AND fingerprint = v_hash;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_checkout_gateway_credentials(uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_checkout_gateway_credentials(uuid,jsonb,boolean) TO service_role;

-- Capture current keys too, so existing attempts have a recovery source when
-- an owner changes the merchant account after this migration.
INSERT INTO public.payment_gateway_credential_versions(gateway_id,company_id,provider,is_test,credentials,fingerprint)
SELECT g.id,g.company_id,g.provider,g.is_test,c.credentials,md5(c.credentials::text || ':' || g.is_test::text)
  FROM public.payment_gateways g JOIN public.payment_gateway_credentials c ON c.gateway_id = g.id
ON CONFLICT (gateway_id,fingerprint) DO NOTHING;
NOTIFY pgrst, 'reload schema';
