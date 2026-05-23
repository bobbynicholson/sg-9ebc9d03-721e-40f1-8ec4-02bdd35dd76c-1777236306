-- Contacts soft-delete cascade in a single transaction.
--
-- Pre-fix the delete button fired five sequential .update() calls
-- (clients, leads, quotes, orders, invoices) plus a sixth insert
-- to blocked_contacts. If call 3 failed, calls 1 + 2 had already
-- committed and the operator was left with a half-deleted graph.
-- The toast surfaced "Partly failed" but no rollback path.
--
-- soft_delete_contact_cascade does the whole tree in one
-- transaction. Failure on any branch rolls back the lot.
--
-- Auth: SECURITY DEFINER + explicit caller-company check. Caller
-- must be authenticated AND belong to the same tenant as the
-- supplied IDs. RLS would normally block cross-tenant updates
-- but we re-check here as belt-and-braces in case a future RLS
-- relax accidentally widens write access.

CREATE OR REPLACE FUNCTION public.soft_delete_contact_cascade(
  p_company_id uuid,
  p_client_id uuid,
  p_lead_ids uuid[],
  p_quote_ids uuid[],
  p_order_ids uuid[],
  p_invoice_ids uuid[],
  p_block_email text,
  p_block_phone text,
  p_block_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_company uuid;
  v_stamp timestamptz := now();
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- Authentication gate.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Tenant scope: caller must belong to the same company.
  SELECT company_id INTO v_caller_company
  FROM public.profiles
  WHERE id = auth.uid();
  IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
    RAISE EXCEPTION 'wrong company';
  END IF;

  -- Soft-delete each branch. Each UPDATE re-asserts company_id so
  -- a forged ID list can't reach other tenants' rows.
  IF p_client_id IS NOT NULL THEN
    UPDATE public.clients
      SET deleted_at = v_stamp
      WHERE id = p_client_id AND company_id = p_company_id;
  END IF;

  IF array_length(p_lead_ids, 1) > 0 THEN
    UPDATE public.leads
      SET deleted_at = v_stamp
      WHERE id = ANY(p_lead_ids) AND company_id = p_company_id;
  END IF;

  IF array_length(p_quote_ids, 1) > 0 THEN
    UPDATE public.quotes
      SET deleted_at = v_stamp
      WHERE id = ANY(p_quote_ids) AND company_id = p_company_id;
  END IF;

  IF array_length(p_order_ids, 1) > 0 THEN
    UPDATE public.orders
      SET deleted_at = v_stamp
      WHERE id = ANY(p_order_ids) AND company_id = p_company_id;
  END IF;

  IF array_length(p_invoice_ids, 1) > 0 THEN
    UPDATE public.invoices
      SET deleted_at = v_stamp
      WHERE id = ANY(p_invoice_ids) AND company_id = p_company_id;
  END IF;

  -- Optional block-list insert. ON CONFLICT DO NOTHING so a
  -- repeat block doesn't fail the whole cascade. Catches the
  -- existing duplicate-unique error path more cleanly than the
  -- previous regex-match on the error message.
  IF p_block_email IS NOT NULL AND length(trim(p_block_email)) > 0 THEN
    INSERT INTO public.blocked_contacts (company_id, email_lower, phone, reason)
    VALUES (
      p_company_id,
      lower(trim(p_block_email)),
      NULLIF(p_block_phone, ''),
      COALESCE(p_block_reason, 'Soft-deleted contact')
    )
    ON CONFLICT DO NOTHING;
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'deleted_at', v_stamp
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_contact_cascade(uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_contact_cascade(uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, text, text) TO authenticated;
