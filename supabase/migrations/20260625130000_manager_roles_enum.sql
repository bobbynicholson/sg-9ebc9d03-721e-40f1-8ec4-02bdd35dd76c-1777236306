-- Manager roles for operational team leads.
-- Kept in its own migration so later policy files can safely reference
-- the new enum values after this transaction commits.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'kitchen_manager';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'cleaning_manager';
