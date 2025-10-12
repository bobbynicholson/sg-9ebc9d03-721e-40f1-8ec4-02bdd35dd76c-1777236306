ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS drive_time_to_kitchen_minutes INTEGER,
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS vehicle_details TEXT;

ALTER TABLE public.driver_assignments
ADD COLUMN IF NOT EXISTS estimated_drive_time_minutes INTEGER;

CREATE TABLE IF NOT EXISTS public.order_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'policy_select_order_reviews' AND polrelid = 'public.order_reviews'::regclass) THEN
        CREATE POLICY "policy_select_order_reviews" ON public.order_reviews FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'policy_insert_order_reviews' AND polrelid = 'public.order_reviews'::regclass) THEN
        CREATE POLICY "policy_insert_order_reviews" ON public.order_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END;
$$;

ALTER TABLE public.order_reviews ENABLE ROW LEVEL SECURITY;