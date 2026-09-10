-- CRM & SALES TABLES
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  company_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  event_type TEXT,
  event_date DATE,
  guest_count INTEGER,
  budget_range TEXT,
  venue_address TEXT,
  status lead_status DEFAULT 'new',
  source TEXT,
  assigned_to UUID REFERENCES public.profiles(id),
  notes TEXT,
  tags TEXT[],
  converted_to_client_id UUID,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_leads_company ON public.leads(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON public.leads(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_event_date ON public.leads(event_date) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_type TEXT DEFAULT 'individual',
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city TEXT,
  billing_postal_code TEXT,
  tax_number TEXT,
  credit_limit DECIMAL(12, 2) DEFAULT 0,
  outstanding_balance DECIMAL(12, 2) DEFAULT 0,
  payment_terms INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT TRUE,
  account_manager UUID REFERENCES public.profiles(id),
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_clients_company ON public.clients(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_user ON public.clients(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_active ON public.clients(is_active) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_number TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  quote_name TEXT NOT NULL,
  event_date DATE,
  guest_count INTEGER,
  venue_address TEXT,
  venue_lat DECIMAL(10, 8),
  venue_lng DECIMAL(11, 8),
  subtotal DECIMAL(12, 2) NOT NULL,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,
  status quote_status DEFAULT 'draft',
  valid_until DATE,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  converted_to_order_id UUID,
  notes TEXT,
  terms_and_conditions TEXT,
  prepared_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT quote_has_lead_or_client CHECK (lead_id IS NOT NULL OR client_id IS NOT NULL),
  CONSTRAINT unique_quote_number UNIQUE (company_id, quote_number)
);

CREATE INDEX IF NOT EXISTS idx_quotes_company ON public.quotes(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_lead ON public.quotes(lead_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_client ON public.quotes(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_event_date ON public.quotes(event_date) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_quotes_updated_at ON public.quotes;
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  line_total DECIMAL(12, 2) NOT NULL,
  menu_item_id UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON public.quote_items(quote_id);

DROP TRIGGER IF EXISTS update_quote_items_updated_at ON public.quote_items;
CREATE TRIGGER update_quote_items_updated_at BEFORE UPDATE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.client_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  subscription_name TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  recurring_amount DECIMAL(12, 2) NOT NULL,
  default_venue_address TEXT,
  default_venue_lat DECIMAL(10, 8),
  default_venue_lng DECIMAL(11, 8),
  default_delivery_time TIME,
  default_guest_count INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  paused_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  auto_generate_orders BOOLEAN DEFAULT TRUE,
  generate_days_in_advance INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_company ON public.client_subscriptions(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_client ON public.client_subscriptions(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_active ON public.client_subscriptions(is_active) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_client_subscriptions_updated_at ON public.client_subscriptions;
CREATE TRIGGER update_client_subscriptions_updated_at BEFORE UPDATE ON public.client_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();