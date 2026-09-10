-- Add the order-amendment / cancellation / postponement values to the
-- notification_type enum.
--
-- Background: the broadcast for these three flows was inserting
-- 'amendment_requested' etc. into the text column `notification_type`
-- and leaving the enum column `type` NULL. The bell still picks the
-- row up because it reads from the text column, but reports that
-- group by the enum (admin dashboards, audit trails) skip these rows.
--
-- Adding the values + updating notificationService.broadcastNotification
-- to populate the enum closes the gap.
--
-- ALTER TYPE ... ADD VALUE can't run inside a transaction in older
-- Postgres, so each ADD is its own statement.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'amendment_requested';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'cancellation_requested';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'postponement_requested';
