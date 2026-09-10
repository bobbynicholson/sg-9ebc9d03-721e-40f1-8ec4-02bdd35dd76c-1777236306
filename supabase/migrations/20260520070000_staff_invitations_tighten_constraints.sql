-- Closes the running-todo "ALTER staff_invitations company_id NOT
-- NULL + role to enum". Table is currently empty (0 rows) so both
-- ALTERs are safe without a backfill pass.
--
-- 1. company_id NOT NULL: every invitation is tenant-scoped by
--    definition - the inviting admin's company decides which
--    portal the invite lands in. Allowing NULL was a leftover
--    from the pre-multi-tenant era.
-- 2. role -> user_role enum: prevents typo'd strings like
--    "kitchen" vs "kitchen_staff" landing in invitations and
--    then breaking the assignDepartments flow when the new
--    user signs up.

ALTER TABLE public.staff_invitations
  ALTER COLUMN company_id SET NOT NULL;

-- Convert role from text to the user_role enum. The USING cast
-- maps any pre-existing text values 1:1 since the table is empty.
ALTER TABLE public.staff_invitations
  ALTER COLUMN role TYPE public.user_role
  USING role::public.user_role;
