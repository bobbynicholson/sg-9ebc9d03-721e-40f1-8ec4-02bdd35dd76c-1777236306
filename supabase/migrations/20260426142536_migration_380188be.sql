-- C. Notification Security
DROP POLICY IF EXISTS "system_create_notifications" ON notifications;
CREATE POLICY "system_create_notifications" ON notifications FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' OR auth.role() = 'service_role'
);