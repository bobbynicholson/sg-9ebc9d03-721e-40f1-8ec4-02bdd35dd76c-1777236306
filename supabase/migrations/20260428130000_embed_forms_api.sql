-- =============================================================================
-- Embed forms: public API support
-- =============================================================================
-- Adds:
--   * companies.auto_reply_to_embed_submissions (bool, default false)
--   * helper RPC increment_embed_form_views(p_form_id) for atomic view counting
--
-- Safe to re-run: every change is guarded with IF NOT EXISTS / OR REPLACE.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS auto_reply_to_embed_submissions boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN companies.auto_reply_to_embed_submissions IS
  'When true, the public embed submit endpoint sends a thank-you email to the client after each submission. Default false so tenants opt in explicitly.';

-- Atomic view counter -- avoids the read-modify-write race the API falls back
-- to when this RPC is missing.
CREATE OR REPLACE FUNCTION increment_embed_form_views(p_form_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE embed_form_configs
     SET views_count = views_count + 1,
         updated_at = now()
   WHERE id = p_form_id;
$$;

REVOKE ALL ON FUNCTION increment_embed_form_views(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_embed_form_views(uuid) TO service_role;
-- submissions_count is bumped by trg_embed_form_submissions_after_insert in
-- 20260428120000_embed_forms.sql -- no separate RPC needed.
