-- Wave 66 -- saved views persisted per user in DB instead of
-- localStorage per browser.

CREATE TABLE IF NOT EXISTS public.user_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  surface text NOT NULL,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_saved_views_user_surface
  ON public.user_saved_views (user_id, surface);

ALTER TABLE public.user_saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_views_owner_select" ON public.user_saved_views;
CREATE POLICY "saved_views_owner_select"
  ON public.user_saved_views FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_views_owner_insert" ON public.user_saved_views;
CREATE POLICY "saved_views_owner_insert"
  ON public.user_saved_views FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_views_owner_update" ON public.user_saved_views;
CREATE POLICY "saved_views_owner_update"
  ON public.user_saved_views FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_views_owner_delete" ON public.user_saved_views;
CREATE POLICY "saved_views_owner_delete"
  ON public.user_saved_views FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.user_saved_views IS
  'Wave 66 -- per-user named saved view configs. Replaces the per-browser localStorage approach so a bookkeeper switching devices keeps their chips. surface discriminator: "invoices" / "orders" / "quotes" / "leads". config jsonb shape varies per surface.';
