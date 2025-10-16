-- src/supabase/migrations/YYYYMMDDHHMMSS_create_handle_new_user_trigger.sql

-- Drop the existing trigger and function if they exist to ensure a clean setup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Creates a public.profiles table for a new user.
-- This function is called by a trigger when a new user is created in auth.users.
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Insert a new row into the public.profiles table, taking data from the new user record
  INSERT INTO public.profiles (id, email, full_name, role, currency, phone_number, company_name, subscription_plan, subscription_status, trial_ends_at)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'role',
    new.raw_user_meta_data->>'currency',
    new.raw_user_meta_data->>'phone_number',
    new.raw_user_meta_data->>'company_name',
    'trial', -- Default subscription plan on sign-up
    'trialing', -- Default subscription status on sign-up
    (now() + interval '14 days') -- Set trial to expire in 14 days
  );
  RETURN new;
END;
$$;

-- trigger the function every time a user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Grant usage on the uuid-ossp extension to the postgres user
-- This is necessary because the security definer function needs permission
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
    GRANT USAGE ON SCHEMA public TO postgres;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;
  END IF;
END;
$$;

-- Add a comment to the function for clarity
COMMENT ON FUNCTION public.handle_new_user() IS 'Creates a profile for a new user and sets up a 14-day trial.';