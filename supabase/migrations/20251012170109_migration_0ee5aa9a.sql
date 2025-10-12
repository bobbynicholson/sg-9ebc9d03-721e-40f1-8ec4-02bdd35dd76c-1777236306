ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS plan_id TEXT,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancellation_feedback TEXT,
ADD COLUMN IF NOT EXISTS active_clients_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS orders_this_quarter INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_price_change BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS new_amount NUMERIC,
ADD COLUMN IF NOT EXISTS price_change_effective_date TIMESTAMP WITH TIME ZONE;

CREATE OR REPLACE FUNCTION accept_price_change(p_subscription_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE subscriptions
    SET
        amount = new_amount,
        pending_price_change = FALSE,
        new_amount = NULL,
        price_change_effective_date = NULL,
        updated_at = NOW()
    WHERE
        id = p_subscription_id
        AND pending_price_change = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;