-- Phase 4 notifications backbone: the /admin/notification-settings UI
-- has a richer shape than the per-event boolean columns on
-- email_notification_preferences (which only covers a fixed list of
-- events). Add a `preferences jsonb` column so the UI can persist its
-- full shape end-to-end without forcing a column-per-toggle migration
-- every time the UI gains a new category.
--
-- The existing boolean columns stay in place for backward compatibility
-- with any consumer-side code that reads them today (none verified in
-- the audit, but defence in depth). When the consumer-side wiring
-- lands in a follow-up PR, it should prefer `preferences` and fall
-- back to the booleans for legacy rows.

ALTER TABLE public.email_notification_preferences
  ADD COLUMN IF NOT EXISTS preferences jsonb;

COMMENT ON COLUMN public.email_notification_preferences.preferences IS
  'JSONB blob mirroring the /admin/notification-settings UI shape (email/push/sms category trees). Source of truth for new code; legacy boolean columns kept for backward compatibility.';
