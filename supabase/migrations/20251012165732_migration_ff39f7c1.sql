CREATE TABLE IF NOT EXISTS email_logs (
    id BIGSERIAL PRIMARY KEY,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT,
    email_type TEXT,
    status TEXT, -- e.g., 'sent', 'failed'
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Allow service roles to manage email logs
CREATE POLICY "Allow service role full access to email logs" ON email_logs
FOR ALL
USING (true)
WITH CHECK (true);

-- Add missing columns to subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT;


CREATE OR REPLACE FUNCTION get_quarterly_usage(p_user_id UUID)
RETURNS TABLE (
    clients_count BIGINT,
    orders_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(DISTINCT o.client_id)
         FROM orders o
         WHERE o.user_id = p_user_id AND o.created_at >= date_trunc('quarter', NOW()))::BIGINT,
        
        (SELECT COUNT(*)
         FROM orders o
         WHERE o.user_id = p_user_id AND o.created_at >= date_trunc('quarter', NOW()))::BIGINT;
END;
$$ LANGUAGE plpgsql;