-- Bobby's brief: drivers had no notification path when a new
-- claimable order landed. The AvailableJobsCard polls every 60s
-- and listens to postgres_changes, but a driver only sees it if
-- they're already on the dashboard. New notification type
-- broadcasts to all drivers in the region the moment the order
-- becomes claimable so they get the bell + the notifications
-- page entry with a deep-link back to the dashboard.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'new_job_available';
