-- Closes two running-todo entries:
--   "Add 18 missing order_id indexes on child tables"
--   "Add 20 missing user_id / driver_id indexes"
--
-- Child-table order_id and user_id/driver_id indexes accelerate
-- the everyday joins (every page that opens an order then pulls
-- its history / damages / reminders, every dashboard that filters
-- by signed-in user, every driver-portal page that filters by
-- driver_id). All IF NOT EXISTS so re-runs are no-ops.

-- order_id child tables
CREATE INDEX IF NOT EXISTS idx_client_access_log_order_id        ON public.client_access_log(order_id);
CREATE INDEX IF NOT EXISTS idx_complaints_order_id               ON public.complaints(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_route_stops_order_id     ON public.delivery_route_stops(order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_bookings_order_id       ON public.equipment_bookings(order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_damages_order_id        ON public.equipment_damages(order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_order_id ON public.equipment_shortage_flags(order_id);
CREATE INDEX IF NOT EXISTS idx_gamification_points_order_id      ON public.gamification_points(order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_duty_shifts_order_id      ON public.kitchen_duty_shifts(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id     ON public.order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_order_id        ON public.payment_reminders(order_id);

-- user_id tables
CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_user_id ON public.account_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id                ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_user_id     ON public.cancellation_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_user_id                ON public.complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_email_settings_user_id            ON public.email_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_user_id                 ON public.equipment(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_bookings_user_id        ON public.equipment_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_user_id  ON public.equipment_shortage_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_gamification_achievements_user_id ON public.gamification_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_gamification_points_user_id       ON public.gamification_points(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_user_id              ON public.integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_user_id                 ON public.inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_user_id         ON public.payment_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id                  ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_user_id          ON public.purchase_history(user_id);
CREATE INDEX IF NOT EXISTS idx_regions_user_id                   ON public.regions(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_user_id       ON public.shopping_list_items(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_id            ON public.shopping_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_user_id         ON public.staff_invitations(user_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_user_id   ON public.support_ticket_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_user_id          ON public.user_departments(user_id);

-- driver_id tables (assigned driver lookups)
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id              ON public.deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_route_stops_driver_id    ON public.delivery_route_stops(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_routes_driver_id         ON public.delivery_routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_rest_logs_driver_id        ON public.driver_rest_logs(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_bookings_driver_id        ON public.vehicle_bookings(driver_id);
