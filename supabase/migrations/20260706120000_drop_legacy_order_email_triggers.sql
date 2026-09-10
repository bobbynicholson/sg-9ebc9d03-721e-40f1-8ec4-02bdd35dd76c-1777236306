-- Retire the two legacy DB triggers that queue order/driver emails as
-- status='pending' rows in email_automation_log.
--
-- The problem: nothing drains that pending queue.
--   * emailNotificationService.processPendingEmails() is the only code that
--     flips these pending rows to sent, and NO cron calls it.
--   * The process-email-queue cron drains a DIFFERENT table
--     (outgoing_email_queue), not email_automation_log.
-- So every row these triggers write sits 'pending' forever and never sends.
--
-- Why it's safe to drop them: in normal operation the modern
-- orderWorkflow.updateOrderStatus path (sendStatusNotifications ->
-- emailService) already emails the client on each status change
-- (order_confirmed / preparing / ready / in_transit / delivered), logged
-- as a real 'sent' row. The triggers only produce dead duplicate rows for
-- the client, and driver-facing emails that never left the queue (drivers
-- are reached in-app + WhatsApp instead). Removing the triggers stops the
-- cruft without changing any delivered email.
--
-- send_order_status_email(): trigger_send_order_status_email on orders,
--   AFTER UPDATE OF status -> 'order_status_*' client email (pending).
-- send_driver_assignment_email(): trigger_send_driver_assignment_email on
--   orders -> 'driver_assigned' / 'order_ready_pickup' driver email (pending).

DROP TRIGGER IF EXISTS trigger_send_order_status_email ON orders;
DROP FUNCTION IF EXISTS send_order_status_email();

DROP TRIGGER IF EXISTS trigger_send_driver_assignment_email ON orders;
DROP FUNCTION IF EXISTS send_driver_assignment_email();

-- Neutralise the rows already stuck in the dead queue so the log stops
-- reading as "emails waiting to go out" and the confirmation_email_sent
-- readiness signal isn't fed half-truths. Idempotent on re-run.
UPDATE email_automation_log
   SET status = 'failed',
       error_message = 'legacy trigger queue retired (never drained; superseded by orderWorkflow email path)',
       updated_at = now()
 WHERE status = 'pending'
   AND template_type IN ('order_status_update', 'driver_assigned', 'order_ready_pickup');
