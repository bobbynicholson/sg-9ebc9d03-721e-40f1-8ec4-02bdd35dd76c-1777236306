-- Ensure blog_posts table exists
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT NOT NULL,
  meta_description TEXT,
  is_published BOOLEAN DEFAULT false,
  author TEXT,
  author_id UUID,
  published_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  category TEXT DEFAULT 'General',
  tags TEXT[] DEFAULT '{}',
  cover_image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Allow public read access (Required for Next.js getStaticProps/getStaticPaths)
DROP POLICY IF EXISTS "public_read_blog_posts" ON blog_posts;
CREATE POLICY "public_read_blog_posts" ON blog_posts FOR SELECT USING (true);

-- Allow authenticated users (super admins) to manage posts
DROP POLICY IF EXISTS "admin_manage_blog_posts" ON blog_posts;
CREATE POLICY "admin_manage_blog_posts" ON blog_posts FOR ALL USING (auth.role() = 'authenticated');