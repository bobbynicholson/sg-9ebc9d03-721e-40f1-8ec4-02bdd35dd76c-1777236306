-- Lock profiles.company_id and profiles.role from user-driven escalation.
--
-- Original users_update_own_profile RLS policy had USING(id = auth.uid())
-- but no WITH CHECK -- a logged-in user could UPDATE their own row to set
-- company_id to any tenant or role to super_admin. Tenant-isolation gap.
--
-- Two-layer fix:
--   1. Add WITH CHECK (id = auth.uid()) to the RLS policy so a user can't
--      hand the row to another id either.
--   2. BEFORE UPDATE trigger that:
--        - Bypasses for service_role + super_admin (server-side ops).
--        - Allows the initial signup linkage (OLD.company_id IS NULL).
--        - Otherwise locks company_id from change.
--        - Allows role change only by tenant admins acting within their own
--          tenant.
--
-- Trigger lives in the same plane as RLS so service-role admin paths
-- (auth.uid() IS NULL) sail through untouched.

-- 1. RLS policy gains WITH CHECK
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 2. Column-immutability trigger
CREATE OR REPLACE FUNCTION public.enforce_profile_immutable_columns()
RETURNS TRIGGER AS $$
DECLARE
  caller_role     text;
  caller_company  uuid;
BEGIN
  -- Service-role / system context bypasses (no JWT, no auth.uid())
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lookup caller's current role + company. SECURITY DEFINER lets us read
  -- profiles regardless of RLS.
  SELECT role::text, company_id
    INTO caller_role, caller_company
    FROM public.profiles
   WHERE id = auth.uid();

  -- Super admin: full bypass
  IF caller_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  -- Initial signup linkage: NULL company_id -> first value. Only allowed
  -- when the row being updated is the caller's own row (you can lift
  -- yourself out of pending-company state, you can't lift someone else).
  IF OLD.company_id IS NULL AND OLD.id = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Lock company_id once set
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'profiles.company_id is immutable once set'
      USING ERRCODE = '42501';
  END IF;

  -- Role change rules: only company admins, only within their own tenant
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF caller_role NOT IN ('admin', 'company_admin', 'owner') THEN
      RAISE EXCEPTION 'profiles.role can only be changed by tenant admins'
        USING ERRCODE = '42501';
    END IF;
    IF caller_company IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'cannot change role of profile outside your tenant'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_profile_immutable ON public.profiles;
CREATE TRIGGER trg_enforce_profile_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_immutable_columns();

COMMENT ON FUNCTION public.enforce_profile_immutable_columns() IS
  'Prevents non-admin users from escalating tenant or privilege via profile UPDATE. Allows initial signup linkage (NULL -> value) and tenant admins managing their own staff.';
