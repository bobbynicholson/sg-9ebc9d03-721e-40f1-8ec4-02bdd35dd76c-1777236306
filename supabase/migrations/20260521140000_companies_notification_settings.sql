-- Notifications backbone follow-up (docs/notifications.md 6.2):
-- per-tenant type-level mute. Some notification types are useful
-- on day one but become noise once the tenant has settled in
-- (e.g. `domain_verified` after the first verification, or
-- `subscription_renewed` for tenants on annual billing).
--
-- Shape:
--   {
--     "mutedTypes": ["domain_verified", "subscription_renewed", ...]
--   }
-- broadcastNotification looks this up before fan-out and skips
-- the whole broadcast (returns 0) when the target type is muted.
-- Empty / null / missing column = no mutes (default behaviour).
--
-- The choice of jsonb (vs a side-table) is so future per-tenant
-- knobs can land in the same blob - e.g. quiet hours, per-role
-- mutes - without per-knob migrations.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS notification_settings jsonb;

COMMENT ON COLUMN public.companies.notification_settings IS
  'Tenant-level notification configuration. Today carries mutedTypes[]: notification_type values that broadcastNotification skips. Reserved for future per-tenant knobs (quiet hours, per-role mutes, etc).';
