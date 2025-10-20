-- Fix the infinite recursion in profiles RLS policy
-- by making the handle_new_user trigger function use SECURITY DEFINER

-- Drop and recreate the trigger function with SECURITY DEFINER
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- ✅ This bypasses RLS during automatic profile creation
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NOW(),
    NOW()
  );
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log error but don't block user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Verify the RLS policies are still simple and correct
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd,
  qual as using_expression
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;