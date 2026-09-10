-- Grant underlying Postgres permissions to the Supabase roles
GRANT SELECT ON blog_posts TO anon;
GRANT ALL ON blog_posts TO authenticated;
GRANT ALL ON blog_posts TO service_role;

-- Ensure RLS is active and public read is allowed
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Drop any old policies to be safe
DROP POLICY IF EXISTS "public_read" ON blog_posts;
DROP POLICY IF EXISTS "public_read_blog_posts" ON blog_posts;
DROP POLICY IF EXISTS "admin_manage_blog_posts" ON blog_posts;

-- Create fresh, definitive policies
CREATE POLICY "public_read" ON blog_posts FOR SELECT USING (true);
CREATE POLICY "auth_all" ON blog_posts FOR ALL USING (auth.role() = 'authenticated');