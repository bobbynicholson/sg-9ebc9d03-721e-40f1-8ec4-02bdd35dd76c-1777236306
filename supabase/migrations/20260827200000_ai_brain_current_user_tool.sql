-- Allow the safe signed-in-profile tool to be managed like every other
-- approved live-data tool. It returns only the current user's profile and
-- never accepts an arbitrary user id.

ALTER TABLE public.ai_brain_tool_policies
  DROP CONSTRAINT IF EXISTS ai_brain_tool_policies_tool_id_check;

ALTER TABLE public.ai_brain_tool_policies
  ADD CONSTRAINT ai_brain_tool_policies_tool_id_check CHECK (tool_id IN (
    'current_user_profile', 'company_profile', 'dashboard_stats', 'customer_profile',
    'customer_bookings', 'customer_invoices', 'assigned_deliveries',
    'delivery_orders', 'kitchen_orders', 'kitchen_prep_tasks',
    'kitchen_inventory', 'shopping_inventory', 'shopping_lists',
    'cleaning_equipment', 'cleaning_damage_reports', 'sales_orders',
    'sales_quotes', 'sales_leads', 'operations_orders',
    'operations_inventory', 'admin_invoices', 'team_members', 'staff_orders',
    'user_notifications'
  ));

COMMENT ON CONSTRAINT ai_brain_tool_policies_tool_id_check ON public.ai_brain_tool_policies IS
  'Only application-owned, read-only assistant tools may be configured here.';
