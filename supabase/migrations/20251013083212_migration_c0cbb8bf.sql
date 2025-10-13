-- Drop the existing function
DROP FUNCTION IF EXISTS get_all_subscriptions_admin();

-- Create the function with correct return structure
CREATE OR REPLACE FUNCTION get_all_subscriptions_admin()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  plan_name TEXT,
  amount NUMERIC,
  currency TEXT,
  billing_cycle TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.user_id,
    s.plan_name,
    s.amount,
    s.currency,
    s.billing_cycle,
    s.status,
    s.created_at,
    s.cancelled_at
  FROM subscriptions s
  ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_all_subscriptions_admin() TO authenticated;