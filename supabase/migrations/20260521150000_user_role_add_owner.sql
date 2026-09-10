-- Owner role scaffold (deferred dashboard).
--
-- Adds 'owner' to public.user_role so the role can be assigned to a
-- tenant's founder / director profile ahead of the owner-specific
-- dashboard build. Until that ships, anything gated on owner falls
-- through to the company_admin / admin code paths (they always
-- include 'owner' in the role allowlist), so an owner-role user
-- sees the same UI an admin does. No behaviour change for existing
-- tenants.
--
-- Why scaffold now: the tool is moving ahead and any new RLS policy
-- or role-allowlist that doesn't include 'owner' is a future
-- migration we'd otherwise have to backfill. Adding the enum value
-- early lets every new policy / gate include 'owner' from the start.
--
-- IDEMPOTENT - ADD VALUE IF NOT EXISTS is a no-op if 'owner' already
-- exists (some test branches inherit the older complete_schema dump
-- which already had it). Safe to apply on every environment.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'owner';

-- Backfill comment for future audit. The role is registered but no
-- profiles get auto-promoted; assignment happens manually via
-- /admin/staff once the owner UI lands.
COMMENT ON TYPE public.user_role IS
  'Application user roles. owner = tenant founder/director; treated as company_admin for permission checks until the owner-specific dashboard ships.';
