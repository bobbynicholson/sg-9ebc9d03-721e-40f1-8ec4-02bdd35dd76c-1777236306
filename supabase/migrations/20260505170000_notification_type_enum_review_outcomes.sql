-- Add the approval / rejection outcomes for amendment, cancellation and
-- postponement requests to the notification_type enum.
--
-- Background: amendment-review and cancellation-review now notify the
-- client when admin approves / rejects / partly-approves their request.
-- Without these enum values, the bell still picks the row up via the
-- text column (notification_type) but reports that group by the enum
-- column (audit trails, dashboard rollups) skip the rows.
--
-- ALTER TYPE ... ADD VALUE can't run inside a transaction in older
-- Postgres, so each ADD is its own statement.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'amendment_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'amendment_partial_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'amendment_rejected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'cancellation_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'cancellation_rejected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'postponement_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'postponement_rejected';
