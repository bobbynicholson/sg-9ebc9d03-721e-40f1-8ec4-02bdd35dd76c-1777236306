-- Shared CateringMS AI brain knowledge lane.
--
-- Live operational records remain in their existing tables and are read at
-- answer time. These tables are only for stable business knowledge such as
-- procedures, FAQs, policies, uploaded documents, and approved website copy.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.ai_brain_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('settings', 'text', 'pdf', 'web')),
  source_url text,
  storage_path text,
  content_hash text,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'ready', 'error')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_brain_sources_company_updated
  ON public.ai_brain_sources (company_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_brain_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.ai_brain_sources(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  content text NOT NULL,
  chunk_index integer NOT NULL DEFAULT 0,
  embedding extensions.vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_ai_brain_documents_company_source
  ON public.ai_brain_documents (company_id, source_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_ai_brain_documents_embedding
  ON public.ai_brain_documents USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION public.match_ai_brain_documents(
  query_embedding extensions.vector(1536),
  match_company_id uuid,
  match_threshold double precision DEFAULT 0.2,
  match_count integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  source_id uuid,
  company_id uuid,
  content text,
  score double precision
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT
    d.id,
    d.source_id,
    d.company_id,
    d.content,
    (1 - (d.embedding <=> query_embedding))::double precision AS score
  FROM public.ai_brain_documents d
  WHERE (d.company_id IS NULL OR d.company_id = match_company_id)
    AND d.embedding IS NOT NULL
    AND (1 - (d.embedding <=> query_embedding)) >= match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;

ALTER TABLE public.ai_brain_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_brain_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_brain_sources_read ON public.ai_brain_sources;
CREATE POLICY ai_brain_sources_read ON public.ai_brain_sources
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
  ));

DROP POLICY IF EXISTS ai_brain_sources_write ON public.ai_brain_sources;
CREATE POLICY ai_brain_sources_write ON public.ai_brain_sources
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT p.company_id FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('owner', 'company_admin', 'super_admin')
  ))
  WITH CHECK (company_id IN (
    SELECT p.company_id FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('owner', 'company_admin', 'super_admin')
  ));

DROP POLICY IF EXISTS ai_brain_documents_read ON public.ai_brain_documents;
CREATE POLICY ai_brain_documents_read ON public.ai_brain_documents
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
  ));

DROP POLICY IF EXISTS ai_brain_documents_write ON public.ai_brain_documents;
CREATE POLICY ai_brain_documents_write ON public.ai_brain_documents
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT p.company_id FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('owner', 'company_admin', 'super_admin')
  ))
  WITH CHECK (company_id IN (
    SELECT p.company_id FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('owner', 'company_admin', 'super_admin')
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ai_brain_sources'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_brain_sources;
  END IF;
END $$;

COMMENT ON TABLE public.ai_brain_sources IS
  'Stable, tenant-scoped business knowledge sources for the shared CateringMS AI brain.';
COMMENT ON TABLE public.ai_brain_documents IS
  'Chunked knowledge source content. Live operational records must not be copied here.';
