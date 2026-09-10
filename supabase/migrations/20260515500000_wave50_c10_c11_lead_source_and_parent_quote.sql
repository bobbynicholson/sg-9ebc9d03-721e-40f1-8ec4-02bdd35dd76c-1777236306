-- Wave 50 C10 + C11 -- first-class lead_source on quotes/orders +
-- parent_quote_id rebook chain on quotes.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS parent_quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS lead_source TEXT;

COMMENT ON COLUMN public.quotes.source IS
  'Wave 50 C10 -- first-class lead-source attribution. Carried from leads.source on conversion. Pre-Wave-50 this lived in internal_notes text only.';
COMMENT ON COLUMN public.quotes.parent_quote_id IS
  'Wave 50 C11 -- when this quote was duplicated from a previous one (repeat client / rebook), point at the original. Enables rebook-chain analytics.';
COMMENT ON COLUMN public.orders.lead_source IS
  'Wave 50 C10 -- carried from quote.source through convertQuoteToOrder so order-level reporting can attribute by lead source.';

CREATE INDEX IF NOT EXISTS idx_quotes_source ON public.quotes (source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_parent ON public.quotes (parent_quote_id) WHERE parent_quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_lead_source ON public.orders (lead_source) WHERE lead_source IS NOT NULL;
