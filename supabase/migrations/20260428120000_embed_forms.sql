-- ============================================================================
-- Embeddable Quote-Request Form System
-- ----------------------------------------------------------------------------
-- Adds public-facing embed token and pricing tiers to companies, plus three
-- new tables powering form configuration, submissions, and rate limiting.
--
-- NOTE: rows in embed_rate_limits older than 24h should be pruned by a
-- scheduled job (pg_cron or external worker). No cron is created here -- this
-- migration only defines the schema. Bobby will wire up the schedule once the
-- table is live.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Companies: public embed token + pricing tiers
-- ----------------------------------------------------------------------------

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS embed_token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS embed_pricing_tiers jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN companies.embed_token IS
  'Public token used in embed URLs. Rotatable. Empty array of pricing tiers means the live estimate feature is hidden for this tenant.';
COMMENT ON COLUMN companies.embed_pricing_tiers IS
  'Array of {id, name, price_per_person_min, price_per_person_max, currency} powering the live estimate feature on embedded forms.';

-- ----------------------------------------------------------------------------
-- B. embed_form_configs
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS embed_form_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id text NOT NULL CHECK (template_id IN (
    'quick-card',
    'modern-inline',
    'luxe-vertical',
    'floating-widget',
    'detailed-multi-step',
    'pricing-calculator',
    'wedding-specialist',
    'corporate-catering',
    'event-estimator',
    'spit-braai-quick'
  )),
  name text NOT NULL,
  slug text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  redirect_url text,
  success_message text,
  is_active boolean NOT NULL DEFAULT true,
  views_count integer NOT NULL DEFAULT 0,
  submissions_count integer NOT NULL DEFAULT 0,
  last_submission_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT embed_form_configs_company_slug_unique UNIQUE (company_id, slug),
  CONSTRAINT embed_form_configs_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' OR slug ~ '^[a-z0-9]$')
);

COMMENT ON TABLE embed_form_configs IS
  'Per-tenant configuration for embeddable quote-request forms. A company may have many forms, each addressable by slug.';
COMMENT ON COLUMN embed_form_configs.fields IS
  'Array of EmbedField objects (see src/types/embedForms.ts). Includes label, required, visible, order, options, validation, conditional logic, and lead-mapping hints.';
COMMENT ON COLUMN embed_form_configs.theme IS
  'White-label override: {primary_color, secondary_color, font_family, button_radius, layout}.';

-- ----------------------------------------------------------------------------
-- C. embed_form_submissions
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS embed_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embed_form_id uuid NOT NULL REFERENCES embed_form_configs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  ip_hash text,
  user_agent text,
  referrer text,
  turnstile_score numeric,
  is_spam boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE embed_form_submissions IS
  'Audit trail of every embed-form submission. company_id is denormalised for fast tenant-scoped queries. ip_hash is SHA-256 -- raw IPs are never stored.';
COMMENT ON COLUMN embed_form_submissions.ip_hash IS
  'SHA-256 hex digest of the submitter IP. Used for rate-limiting and abuse tracking. Never store raw IPs here.';
COMMENT ON COLUMN embed_form_submissions.turnstile_score IS
  'Cloudflare Turnstile score if Turnstile is configured for this form. NULL when not wired.';

-- ----------------------------------------------------------------------------
-- D. embed_rate_limits
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS embed_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embed_token uuid NOT NULL,
  ip_hash text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  count integer NOT NULL DEFAULT 1,
  CONSTRAINT embed_rate_limits_unique_window UNIQUE (embed_token, ip_hash, window_start)
);

COMMENT ON TABLE embed_rate_limits IS
  'Hourly rate-limit counters keyed by (embed_token, ip_hash). embed_token is intentionally not a foreign key so that token rotation does not cascade-delete history. Prune rows older than 24h via a scheduled job.';

-- ----------------------------------------------------------------------------
-- E. Indexes
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_embed_token
  ON companies (embed_token);

CREATE INDEX IF NOT EXISTS idx_embed_form_configs_company_active
  ON embed_form_configs (company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_embed_form_configs_company_slug
  ON embed_form_configs (company_id, slug);

CREATE INDEX IF NOT EXISTS idx_embed_form_submissions_form_created
  ON embed_form_submissions (embed_form_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_embed_form_submissions_company_created
  ON embed_form_submissions (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_embed_rate_limits_lookup
  ON embed_rate_limits (embed_token, ip_hash, window_start);

-- ----------------------------------------------------------------------------
-- F. Row-level security
-- ----------------------------------------------------------------------------

ALTER TABLE embed_form_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE embed_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE embed_rate_limits ENABLE ROW LEVEL SECURITY;

-- embed_form_configs: super_admin all; company_admin / admin / owner only their company
DROP POLICY IF EXISTS "super_admin_all_embed_configs" ON embed_form_configs;
CREATE POLICY "super_admin_all_embed_configs" ON embed_form_configs
  FOR ALL USING (user_has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "company_access_embed_configs" ON embed_form_configs;
CREATE POLICY "company_access_embed_configs" ON embed_form_configs
  FOR ALL USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      user_has_role(auth.uid(), 'company_admin')
      OR user_has_role(auth.uid(), 'admin')
      OR user_has_role(auth.uid(), 'owner')
    )
  );

-- embed_form_submissions: super_admin all; company scoped for company_admin / admin / owner
DROP POLICY IF EXISTS "super_admin_all_embed_submissions" ON embed_form_submissions;
CREATE POLICY "super_admin_all_embed_submissions" ON embed_form_submissions
  FOR ALL USING (user_has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "company_access_embed_submissions" ON embed_form_submissions;
CREATE POLICY "company_access_embed_submissions" ON embed_form_submissions
  FOR ALL USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      user_has_role(auth.uid(), 'company_admin')
      OR user_has_role(auth.uid(), 'admin')
      OR user_has_role(auth.uid(), 'owner')
    )
  );

-- service_role bypasses RLS automatically, but be explicit so writes from the
-- public submission edge function are unambiguous.
DROP POLICY IF EXISTS "service_role_all_embed_submissions" ON embed_form_submissions;
CREATE POLICY "service_role_all_embed_submissions" ON embed_form_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- embed_rate_limits: service_role only. Never readable from a browser client.
DROP POLICY IF EXISTS "service_role_only_embed_rate_limits" ON embed_rate_limits;
CREATE POLICY "service_role_only_embed_rate_limits" ON embed_rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- G. Triggers
-- ----------------------------------------------------------------------------

-- updated_at auto-bump on embed_form_configs
DROP TRIGGER IF EXISTS trg_embed_form_configs_updated_at ON embed_form_configs;
CREATE TRIGGER trg_embed_form_configs_updated_at
  BEFORE UPDATE ON embed_form_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Submission insert: bump submissions_count and last_submission_at on parent config
CREATE OR REPLACE FUNCTION embed_form_submissions_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE embed_form_configs
     SET submissions_count = submissions_count + 1,
         last_submission_at = NEW.created_at
   WHERE id = NEW.embed_form_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_embed_form_submissions_after_insert ON embed_form_submissions;
CREATE TRIGGER trg_embed_form_submissions_after_insert
  AFTER INSERT ON embed_form_submissions
  FOR EACH ROW EXECUTE FUNCTION embed_form_submissions_after_insert();

-- leads.source is a plain TEXT column in this schema (not an enum), so no
-- enum value needs to be added. Application code may freely write the
-- string 'embed' into leads.source to flag embed-originated leads.

-- ============================================================================
-- End of embed forms migration
-- ============================================================================
