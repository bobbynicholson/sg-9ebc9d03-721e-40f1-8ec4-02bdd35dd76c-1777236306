CREATE OR REPLACE FUNCTION public.match_ai_brain_documents_for_sources(
  query_embedding extensions.vector(1536),
  match_company_id uuid,
  match_source_ids uuid[],
  match_threshold double precision DEFAULT 0.25,
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
  WITH eligible_documents AS MATERIALIZED (
    SELECT d.id, d.source_id, d.company_id, d.content, d.embedding
    FROM public.ai_brain_documents d
    JOIN public.ai_brain_sources s ON s.id = d.source_id
    WHERE d.source_id = ANY(match_source_ids)
      AND (d.company_id IS NULL OR d.company_id = match_company_id)
      AND d.company_id IS NOT DISTINCT FROM s.company_id
      AND s.status = 'ready'
      AND d.embedding IS NOT NULL
  )
  SELECT d.id, d.source_id, d.company_id, d.content,
    (1 - (d.embedding <=> query_embedding))::double precision AS score
  FROM eligible_documents d
  WHERE (1 - (d.embedding <=> query_embedding)) >= match_threshold
  ORDER BY d.embedding <=> query_embedding, d.id
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;

REVOKE ALL ON FUNCTION public.match_ai_brain_documents_for_sources(extensions.vector, uuid, uuid[], double precision, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_ai_brain_documents_for_sources(extensions.vector, uuid, uuid[], double precision, integer) TO authenticated, service_role;
