ALTER TABLE IF EXISTS blog_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read" ON blog_posts;
CREATE POLICY "public_read" ON blog_posts FOR SELECT USING (true);