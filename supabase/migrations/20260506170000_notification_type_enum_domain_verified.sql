-- Add the domain_verified value to the notification_type enum so the
-- post-verify hook in /api/admin/resend/verify-domain can populate the
-- enum column on the notifications row, not just the text mirror. Bell
-- reads from the text column either way; this keeps reports that group
-- by enum honest.
--
-- ALTER TYPE ... ADD VALUE can't run inside a transaction in older
-- Postgres, so each ADD is its own statement.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'domain_verified';
