ALTER TABLE public.staff_work_sessions
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

CREATE INDEX IF NOT EXISTS staff_work_sessions_company_active_clock_idx
  ON public.staff_work_sessions (company_id, clock_in)
  WHERE voided_at IS NULL;

CREATE OR REPLACE FUNCTION public.void_staff_work_session(p_session_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_status text;
  v_clock_out timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before voiding a clock entry.'; END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Enter a reason with at least 5 characters.';
  END IF;

  SELECT company_id, payment_status, clock_out
    INTO v_company_id, v_status, v_clock_out
    FROM public.staff_work_sessions
    WHERE id = p_session_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clock entry not found.'; END IF;

  IF v_company_id <> public.get_user_company_id(auth.uid())
     OR NOT public.is_daily_operations_company_admin(auth.uid(), v_company_id) THEN
    RAISE EXCEPTION 'Only an administrator in this company can void this clock entry.';
  END IF;

  IF COALESCE(v_status, 'unpaid') <> 'unpaid' THEN
    RAISE EXCEPTION 'Only unpaid clock entries can be voided here. Paid entries need a settlement adjustment.';
  END IF;
  IF v_clock_out IS NULL THEN RAISE EXCEPTION 'Clock out this entry before voiding it.'; END IF;

  UPDATE public.staff_work_sessions
  SET payment_status = 'voided',
      voided_at = now(),
      voided_by_user_id = auth.uid(),
      void_reason = btrim(p_reason),
      updated_at = now()
  WHERE id = p_session_id AND voided_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This clock entry has already been voided.'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.void_staff_work_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_staff_work_session(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.void_staff_work_session(uuid, text) IS
  'Admin-only audited void for completed unpaid clock entries; keeps the source row and excludes it from unpaid wage totals.';
