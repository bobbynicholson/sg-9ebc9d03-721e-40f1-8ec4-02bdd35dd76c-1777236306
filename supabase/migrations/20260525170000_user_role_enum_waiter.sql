-- WTR-A: waiter / on-site server role. Bobby's call from the
-- cross-system audit (task #259): combined field-staff portal,
-- role-aware. A user with role 'driver' sees driver UI; 'waiter'
-- sees waiter UI; both roles = both sets of widgets on the same
-- /team-portal/driver dashboard (same login, contextual UI).
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'waiter';
