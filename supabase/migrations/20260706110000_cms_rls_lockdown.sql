-- Marketing CMS RLS lockdown (blog_posts + cms_pages).
--
-- Confirmed against prod 2026-07-06 by live probe:
--   * anon could SELECT unpublished blog_posts rows (policy
--     "public_read" USING (true)) -> drafts leak at /blog/<slug>.
--   * "auth_all" FOR ALL USING (auth.role() = 'authenticated') let ANY
--     signed-in user (tenant staff, clients) create/update/delete
--     marketing blog posts on cateringms.com.
--   * cms_pages carried "company_access_cms_pages" allowing tenant
--     users to manage rows via company_id - combined with the public
--     /page/<slug> renderer this was a tenant-to-marketing-site
--     content-injection path. The marketing CMS is platform scope;
--     only super_admin may write.
--
-- The app code reads published rows anonymously (public renderers) and
-- writes via the super_admin-gated editors using the browser client, so
-- the write policies below key on profiles.role/active_role.

-- ── blog_posts ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read" ON public.blog_posts;
DROP POLICY IF EXISTS "auth_all" ON public.blog_posts;
DROP POLICY IF EXISTS "super_admin_manage_posts" ON public.blog_posts;

-- Public (anon + authenticated) may read PUBLISHED posts only.
CREATE POLICY "blog_posts_public_read_published" ON public.blog_posts
  FOR SELECT USING (is_published = true);

-- Super admins manage everything (drafts included).
CREATE POLICY "blog_posts_super_admin_all" ON public.blog_posts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.active_role = 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.active_role = 'super_admin')
    )
  );

-- ── cms_pages ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "company_access_cms_pages" ON public.cms_pages;
DROP POLICY IF EXISTS "public_read_cms_pages" ON public.cms_pages;
DROP POLICY IF EXISTS "auth_all_cms_pages" ON public.cms_pages;

CREATE POLICY "cms_pages_public_read_published" ON public.cms_pages
  FOR SELECT USING (is_published = true);

CREATE POLICY "cms_pages_super_admin_all" ON public.cms_pages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.active_role = 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.active_role = 'super_admin')
    )
  );

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;

-- Concurrency guard for the platform email templates editor (audit
-- finding: two concurrent saves can insert duplicate rows, after which
-- maybeSingle() reads throw and template resolution silently falls back).
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_global_key_unique
  ON public.email_templates (template_type)
  WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_company_key_unique
  ON public.email_templates (company_id, template_type)
  WHERE company_id IS NOT NULL;
