-- FINAL FIX: Ultra-simple RLS policies with ZERO recursion possibility

-- Drop ALL existing policies
DROP POLICY IF EXISTS "view_same_company" ON profiles;
DROP POLICY IF EXISTS "view_own_profile" ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;

-- Drop the helper function (we won't use it)
DROP FUNCTION IF EXISTS get_user_company_id(UUID);

-- Create the simplest possible policies
-- These use ONLY direct auth.uid() comparisons - no recursion possible

-- 1. Users can view their own profile (most important - this is what login needs)
CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT
USING (id = auth.uid());

-- 2. Users can insert their own profile (during signup)
CREATE POLICY "Users can insert own profile" ON profiles
FOR INSERT
WITH CHECK (id = auth.uid());

-- 3. Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 4. Super admins can view all profiles (using app-level check, not RLS)
-- We'll handle this in application code instead of RLS to avoid recursion

-- That's it! No company_id checks, no subqueries, no functions.
-- Just simple, direct auth.uid() comparisons that can't recurse.