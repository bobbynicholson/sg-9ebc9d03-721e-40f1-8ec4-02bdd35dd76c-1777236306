-- 1. Create payment_schedules table
CREATE TABLE IF NOT EXISTS public.payment_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    total_amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    deposit_amount NUMERIC(10, 2) NOT NULL,
    deposit_percentage NUMERIC(5, 2) NOT NULL,
    deposit_paid BOOLEAN DEFAULT FALSE,
    deposit_paid_at TIMESTAMPTZ,
    deposit_transaction_id TEXT,
    balance_amount NUMERIC(10, 2) NOT NULL,
    balance_due_date DATE NOT NULL,
    balance_paid BOOLEAN DEFAULT FALSE,
    balance_paid_at TIMESTAMPTZ,
    balance_transaction_id TEXT,
    final_order_change_date DATE NOT NULL,
    event_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own payment schedules
CREATE POLICY "Users can view their own payment schedules"
ON public.payment_schedules FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.orders o WHERE o.id = public.payment_schedules.order_id AND o.user_id = auth.uid()
));

-- Allow authenticated users to insert payment schedules
CREATE POLICY "Authenticated users can insert payment schedules"
ON public.payment_schedules FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Allow users to update their own payment schedules
CREATE POLICY "Users can update their own payment schedules"
ON public.payment_schedules FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.orders o WHERE o.id = public.payment_schedules.order_id AND o.user_id = auth.uid()
));

-- 2. Create payment_reminders table
CREATE TABLE IF NOT EXISTS public.payment_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reminder_date DATE NOT NULL,
    reminder_type TEXT NOT NULL,
    days_before_due INTEGER,
    sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    is_urgent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

-- Allow users to access their own payment reminders
CREATE POLICY "Users can access their own payment reminders"
ON public.payment_reminders FOR ALL
USING (auth.uid() = user_id);

-- 3. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    action_url TEXT,
    metadata JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Allow users to access their own notifications
CREATE POLICY "Users can access their own notifications"
ON public.notifications FOR ALL
USING (auth.uid() = recipient_id);