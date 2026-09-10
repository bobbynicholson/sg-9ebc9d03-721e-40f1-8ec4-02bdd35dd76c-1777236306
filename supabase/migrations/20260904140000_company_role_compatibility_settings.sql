-- Tenant-level role compatibility switches.
--
-- These settings describe which cross-role assignments are valid for a
-- company. They are intentionally separate from user_departments: the
-- company switch is the policy gate, while a future user-role picker will
-- store the individual user's selected roles.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS role_compatibility_settings jsonb NOT NULL
    DEFAULT '{
      "allow_driver_waiter_overlap": false,
      "allow_kitchen_cleaning_overlap": false
    }'::jsonb;

COMMENT ON COLUMN public.companies.role_compatibility_settings IS
  'Tenant policy for cross-role staff assignments. Current keys: allow_driver_waiter_overlap and allow_kitchen_cleaning_overlap.';
