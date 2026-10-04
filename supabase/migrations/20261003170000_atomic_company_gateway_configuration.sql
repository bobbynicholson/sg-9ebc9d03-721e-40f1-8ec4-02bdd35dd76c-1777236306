-- Gateway mode/metadata/credentials must not be partially saved on a crash.
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
    ON CONFLICT (gateway_id) DO UPDATE SET credentials = public.payment_gateway_credentials.credentials || EXCLUDED.credentials;
  RETURN to_jsonb(v_gateway);
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_company_payment_gateway(p_company_id uuid,p_gateway_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gateway public.payment_gateways%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('company-gateway:' || p_company_id::text,0));
  SELECT * INTO v_gateway FROM public.payment_gateways WHERE id = p_gateway_id AND company_id = p_company_id
    AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gateway not found for this company'; END IF;
  UPDATE public.payment_gateways SET is_active = false, updated_by_user_id = p_actor_id
    WHERE company_id = p_company_id AND id <> p_gateway_id AND is_active IS TRUE;
  UPDATE public.payment_gateways SET is_active = true, updated_by_user_id = p_actor_id
    WHERE id = p_gateway_id RETURNING * INTO v_gateway;
  RETURN to_jsonb(v_gateway);
END;
$$;

-- One SQL snapshot avoids reading old metadata followed by newly rotated
-- keys in two separate HTTP requests while an owner saves configuration.
CREATE OR REPLACE FUNCTION public.read_payment_gateway_configuration(
  p_company_id uuid DEFAULT NULL,p_gateway_id uuid DEFAULT NULL,p_include_deleted boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('gateway',to_jsonb(g),'credentials',COALESCE(c.credentials,'{}'::jsonb))
    FROM public.payment_gateways g LEFT JOIN public.payment_gateway_credentials c ON c.gateway_id = g.id
   WHERE (p_company_id IS NULL OR g.company_id = p_company_id)
     AND (p_gateway_id IS NULL OR g.id = p_gateway_id)
     AND (p_include_deleted OR g.deleted_at IS NULL)
     AND (p_gateway_id IS NOT NULL OR g.is_active IS TRUE)
   ORDER BY g.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.configure_company_payment_gateway(uuid,uuid,text,boolean,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.activate_company_payment_gateway(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.read_payment_gateway_configuration(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_company_payment_gateway(uuid,uuid,text,boolean,jsonb,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_company_payment_gateway(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_payment_gateway_configuration(uuid,uuid,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
