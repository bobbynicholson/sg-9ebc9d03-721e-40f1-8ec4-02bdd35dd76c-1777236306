-- Wave 50 C9 -- carry event_type / tags / contact_name from leads
-- onto quotes so the lead -> quote conversion stops dropping them.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS tags JSONB,
  ADD COLUMN IF NOT EXISTS contact_name TEXT;

COMMENT ON COLUMN public.quotes.event_type IS
  'Wave 50 C9 -- mirrors leads.event_type. Carried at conversion.';
COMMENT ON COLUMN public.quotes.tags IS
  'Wave 50 C9 -- mirrors leads.tags. Carried at conversion.';
COMMENT ON COLUMN public.quotes.contact_name IS
  'Wave 50 C9 -- separate from client_name (the bill-to). Often the on-site point person. Carried from leads.';
