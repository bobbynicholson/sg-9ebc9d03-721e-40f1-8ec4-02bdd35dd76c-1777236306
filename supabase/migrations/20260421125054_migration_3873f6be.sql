-- COMMUNICATIONS & AI TABLES
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  channels notification_channel[] DEFAULT ARRAY['in_app']::notification_channel[],
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  related_entity_type TEXT,
  related_entity_id UUID,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_company ON public.notifications(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  recipient_name TEXT,
  message_content TEXT NOT NULL,
  template_name TEXT,
  template_params JSONB,
  status TEXT DEFAULT 'pending',
  gateway_message_id TEXT,
  gateway_response JSONB,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_company ON public.whatsapp_messages(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON public.whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON public.whatsapp_messages(recipient_phone);

CREATE TABLE IF NOT EXISTS public.delivery_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  food_quality_rating INTEGER CHECK (food_quality_rating >= 1 AND food_quality_rating <= 5),
  delivery_timeliness_rating INTEGER CHECK (delivery_timeliness_rating >= 1 AND delivery_timeliness_rating <= 5),
  driver_professionalism_rating INTEGER CHECK (driver_professionalism_rating >= 1 AND driver_professionalism_rating <= 5),
  overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
  comments TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  requires_follow_up BOOLEAN DEFAULT FALSE,
  followed_up_at TIMESTAMPTZ,
  followed_up_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_delivery_feedback_company ON public.delivery_feedback(company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_feedback_order ON public.delivery_feedback(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_feedback_client ON public.delivery_feedback(client_id);
CREATE INDEX IF NOT EXISTS idx_delivery_feedback_rating ON public.delivery_feedback(overall_rating);

DROP TRIGGER IF EXISTS update_delivery_feedback_updated_at ON public.delivery_feedback;
CREATE TRIGGER update_delivery_feedback_updated_at BEFORE UPDATE ON public.delivery_feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.complaint_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  complainant_name TEXT NOT NULL,
  complainant_email TEXT,
  complainant_phone TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  category TEXT,
  severity TEXT DEFAULT 'medium',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  priority INTEGER DEFAULT 3,
  assigned_to UUID REFERENCES public.profiles(id),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  compensation_offered TEXT,
  compensation_amount DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_ticket_number UNIQUE (company_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_complaint_tickets_company ON public.complaint_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_complaint_tickets_status ON public.complaint_tickets(status);
CREATE INDEX IF NOT EXISTS idx_complaint_tickets_assigned ON public.complaint_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_complaint_tickets_severity ON public.complaint_tickets(severity);

DROP TRIGGER IF EXISTS update_complaint_tickets_updated_at ON public.complaint_tickets;
CREATE TRIGGER update_complaint_tickets_updated_at BEFORE UPDATE ON public.complaint_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();