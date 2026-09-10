-- Add indexes to foreign keys for better performance
-- This will dramatically improve query performance

-- Blog posts
CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON blog_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_company ON blog_posts(company_id);

-- Cleaning
CREATE INDEX IF NOT EXISTS idx_cleaning_duty_logs_user ON cleaning_duty_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_completed ON cleaning_schedules(completed_by);

-- Clients
CREATE INDEX IF NOT EXISTS idx_clients_account_manager ON clients(account_manager);

-- Complaints
CREATE INDEX IF NOT EXISTS idx_complaint_tickets_client ON complaint_tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_complaint_tickets_order ON complaint_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_complaint_tickets_resolved ON complaint_tickets(resolved_by);

-- Deliveries
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON deliveries(order_id);

-- Feedback
CREATE INDEX IF NOT EXISTS idx_feedback_followed_up ON delivery_feedback(followed_up_by);

-- Driver replacements
CREATE INDEX IF NOT EXISTS idx_driver_rep_original ON driver_replacement_requests(original_driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_rep_replacement ON driver_replacement_requests(replacement_driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_rep_resolved ON driver_replacement_requests(resolved_by);
CREATE INDEX IF NOT EXISTS idx_driver_rep_accepted ON driver_replacements(accepted_by_driver_id);

-- Email
CREATE INDEX IF NOT EXISTS idx_email_prefs_company ON email_notification_preferences(company_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_user ON email_templates(user_id);

-- Equipment
CREATE INDEX IF NOT EXISTS idx_equip_handover_handed ON equipment_handovers(handed_over_by);
CREATE INDEX IF NOT EXISTS idx_equip_handover_received ON equipment_handovers(received_by);
CREATE INDEX IF NOT EXISTS idx_equip_handover_received_user ON equipment_handovers(received_by_user_id);
CREATE INDEX IF NOT EXISTS idx_equip_shortage_flags_resolved ON equipment_shortage_flags(resolved_by);
CREATE INDEX IF NOT EXISTS idx_equip_shortage_order ON equipment_shortage_reports(order_id);
CREATE INDEX IF NOT EXISTS idx_equip_shortage_reported ON equipment_shortage_reports(reported_by);
CREATE INDEX IF NOT EXISTS idx_equip_shortage_resolved ON equipment_shortage_reports(resolved_by);

-- GPS
CREATE INDEX IF NOT EXISTS idx_gps_driver ON gps_tracking(driver_id);
CREATE INDEX IF NOT EXISTS idx_gps_order ON gps_tracking(order_id);

-- Inventory
CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory_items(preferred_supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_trans_performed ON inventory_transactions(performed_by);
CREATE INDEX IF NOT EXISTS idx_inventory_trans_supplier ON inventory_transactions(supplier_id);

-- Kitchen
CREATE INDEX IF NOT EXISTS idx_kitchen_shifts_user ON kitchen_duty_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_user ON kitchen_task_completions(user_id);

-- Leads
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_chef ON orders(assigned_chef_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver_assigned ON orders(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_quote ON orders(quote_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

-- Prep
CREATE INDEX IF NOT EXISTS idx_prep_items_completed ON prep_list_items(completed_by);
CREATE INDEX IF NOT EXISTS idx_prep_items_menu ON prep_list_items(menu_item_id);

-- Quotes
CREATE INDEX IF NOT EXISTS idx_quotes_prepared ON quotes(prepared_by);
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id);

-- Recipe
CREATE INDEX IF NOT EXISTS idx_recipe_scaling_user ON recipe_scaling_history(adjusted_by_user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_company ON recipes(company_id);

-- Shopping
CREATE INDEX IF NOT EXISTS idx_shopping_lists_shopper ON shopping_lists(shopper_id);

-- Staff
CREATE INDEX IF NOT EXISTS idx_staff_ledger_user ON staff_payment_ledger(user_id);

-- Support
CREATE INDEX IF NOT EXISTS idx_support_assigned ON support_tickets(assigned_to);

-- Time
CREATE INDEX IF NOT EXISTS idx_time_clock_user ON time_clock_entries(user_id);