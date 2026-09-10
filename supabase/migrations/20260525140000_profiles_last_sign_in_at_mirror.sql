-- USR2-A: mirror auth.users.last_sign_in_at onto public.profiles so the
-- /admin/users staff list can render "Active 3h ago" / "Hasn't signed
-- in for 14 days" / "Never signed in" without needing service-role
-- access to auth.users from the browser. Trigger keeps the mirror
-- fresh on every login (Supabase Auth updates auth.users on each
-- session refresh).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

COMMENT ON COLUMN public.profiles.last_sign_in_at IS
  'Mirror of auth.users.last_sign_in_at, kept fresh by the auth_users_last_sign_in_mirror trigger. Lets tenant-side admin UI show staff activity without service-role access.';

-- Trigger function: on every UPDATE to auth.users where last_sign_in_at
-- changed, copy the value to the matching profile row. SECURITY
-- DEFINER so the trigger can write to public.profiles regardless of
-- the calling user.
CREATE OR REPLACE FUNCTION public.mirror_auth_last_sign_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    UPDATE public.profiles
       SET last_sign_in_at = NEW.last_sign_in_at
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_users_last_sign_in_mirror ON auth.users;
CREATE TRIGGER auth_users_last_sign_in_mirror
AFTER UPDATE OF last_sign_in_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.mirror_auth_last_sign_in();

-- Backfill from existing auth.users so the column is populated for
-- staff who've already logged in at least once.
UPDATE public.profiles p
   SET last_sign_in_at = u.last_sign_in_at
  FROM auth.users u
 WHERE p.id = u.id
   AND u.last_sign_in_at IS NOT NULL
   AND p.last_sign_in_at IS DISTINCT FROM u.last_sign_in_at;
