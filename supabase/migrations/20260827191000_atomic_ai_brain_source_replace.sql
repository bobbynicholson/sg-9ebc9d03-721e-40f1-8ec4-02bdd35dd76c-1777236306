-- Replace a source's metadata and chunks in one database transaction. This
-- prevents a failed resync from leaving a source with deleted documents.

CREATE OR REPLACE FUNCTION public.replace_ai_brain_source(
  p_source_id uuid,
  p_company_id uuid,
  p_name text,
  p_source_type text,
  p_source_url text,
  p_content_hash text,
  p_metadata jsonb,
  p_documents jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  inserted_count integer;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Source name is required';
  END IF;
  IF p_source_type NOT IN ('settings', 'text', 'pdf', 'web') THEN
    RAISE EXCEPTION 'Invalid source type';
  END IF;
  IF p_documents IS NULL OR jsonb_typeof(p_documents) <> 'array' OR jsonb_array_length(p_documents) = 0 THEN
    RAISE EXCEPTION 'A source must contain at least one document chunk';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.ai_brain_sources s
    WHERE s.id = p_source_id
      AND s.company_id IS NOT DISTINCT FROM p_company_id
  ) THEN
    RAISE EXCEPTION 'Source not found';
  END IF;

  UPDATE public.ai_brain_sources
  SET name = left(trim(p_name), 160),
      source_type = p_source_type,
      source_url = p_source_url,
      content_hash = p_content_hash,
      status = 'ready',
      metadata = COALESCE(p_metadata, '{}'::jsonb),
      updated_at = now()
  WHERE id = p_source_id
    AND company_id IS NOT DISTINCT FROM p_company_id;

  DELETE FROM public.ai_brain_documents
  WHERE source_id = p_source_id
    AND company_id IS NOT DISTINCT FROM p_company_id;

  INSERT INTO public.ai_brain_documents (source_id, company_id, content, chunk_index, embedding, metadata)
  SELECT p_source_id,
         p_company_id,
         item.content,
         item.chunk_index,
         CASE WHEN item.embedding IS NULL THEN NULL ELSE item.embedding::extensions.vector END,
         COALESCE(item.metadata, '{}'::jsonb)
  FROM jsonb_to_recordset(p_documents) AS item(
    content text,
    chunk_index integer,
    embedding text,
    metadata jsonb
  );

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_ai_brain_source(uuid, uuid, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_ai_brain_source(uuid, uuid, text, text, text, text, jsonb, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.replace_ai_brain_source(uuid, uuid, text, text, text, text, jsonb, jsonb) IS
  'Atomically replaces an approved AI Brain source and its indexed chunks.';
