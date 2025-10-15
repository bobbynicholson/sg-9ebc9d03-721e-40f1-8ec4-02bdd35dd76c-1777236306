-- Add a policy that allows profile creation during signup with anon role
-- This is needed because during signup, the user might still have anon role
CREATE POLICY "Allow profile creation during signup"
ON profiles
FOR INSERT
TO anon
WITH CHECK (auth.uid() = id);