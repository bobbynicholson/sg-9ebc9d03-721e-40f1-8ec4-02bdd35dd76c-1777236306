-- Enforce AI Brain role visibility at the database boundary as well as in the
-- server retriever. Global sources (company_id IS NULL) can contain guides
-- for a single role, so authenticated clients must not be able to read every
-- role's source or call the vector RPC to bypass the application filter.

CREATE OR REPLACE FUNCTION public.ai_brain_role_allowed(source_metadata jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role::text IN ('super_admin', 'owner', 'company_admin')
        OR p.active_role IN ('super_admin', 'owner', 'company_admin')
        OR CASE
          WHEN jsonb_typeof(COALESCE(source_metadata -> 'roles', 'null'::jsonb)) = 'array'
            THEN jsonb_array_length(source_metadata -> 'roles') = 0
              OR source_metadata -> 'roles' ? p.role::text
              OR source_metadata -> 'roles' ? COALESCE(p.active_role::text, '')
          ELSE true
        END
      )
  );
$$;

REVOKE ALL ON FUNCTION public.ai_brain_role_allowed(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_brain_role_allowed(jsonb) TO authenticated, service_role;

DROP POLICY IF EXISTS ai_brain_sources_read ON public.ai_brain_sources;
CREATE POLICY ai_brain_sources_read ON public.ai_brain_sources
  FOR SELECT TO authenticated
  USING (
    (
      company_id IS NOT NULL
      AND company_id IN (
        SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      )
      AND public.ai_brain_role_allowed(metadata)
    )
    OR (company_id IS NULL AND public.ai_brain_role_allowed(metadata))
  );

DROP POLICY IF EXISTS ai_brain_documents_read ON public.ai_brain_documents;
CREATE POLICY ai_brain_documents_read ON public.ai_brain_documents
  FOR SELECT TO authenticated
  USING (
    (
      company_id IS NOT NULL
      AND company_id IN (
        SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      )
      AND EXISTS (
        SELECT 1
        FROM public.ai_brain_sources s
        WHERE s.id = ai_brain_documents.source_id
          AND public.ai_brain_role_allowed(s.metadata)
      )
    )
    OR (
      company_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.ai_brain_sources s
        WHERE s.id = ai_brain_documents.source_id
          AND public.ai_brain_role_allowed(s.metadata)
      )
    )
  );

REVOKE ALL ON FUNCTION public.match_ai_brain_documents(extensions.vector, uuid, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_ai_brain_documents(extensions.vector, uuid, double precision, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.ai_brain_role_allowed(jsonb) IS
  'Returns whether the signed-in profile may read a role-scoped AI Brain source.';

-- Backfill truthful embedding health for sources created before the stricter
-- ingestion path was added. A source is only marked ready when every stored
-- chunk has a vector.
UPDATE public.ai_brain_sources s
SET metadata = s.metadata || jsonb_build_object(
  'embedding_dimensions', 1536,
  'embedded_chunks', counts.embedded_chunks,
  'embedding_status', CASE
    WHEN counts.total_chunks > 0 AND counts.embedded_chunks = counts.total_chunks THEN 'ready'
    ELSE 'error'
  END
)
FROM (
  SELECT
    d.source_id,
    COUNT(*)::integer AS total_chunks,
    COUNT(d.embedding)::integer AS embedded_chunks
  FROM public.ai_brain_documents d
  GROUP BY d.source_id
) counts
WHERE s.id = counts.source_id
  AND s.metadata ->> 'managed_by' = 'chat-knowledge-api';
