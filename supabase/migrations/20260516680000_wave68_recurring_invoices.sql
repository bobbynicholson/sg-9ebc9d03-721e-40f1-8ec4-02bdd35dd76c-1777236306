-- Wave 68 -- recurring invoice templates + run history.

CREATE TABLE IF NOT EXISTS public.recurring_invoice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  client_email text,
  client_phone text,
  template_name text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('weekly','fortnightly','monthly','quarterly')),
  start_date date NOT NULL,
  next_run_at date NOT NULL,
  end_date date,
  pause_until date,
  active boolean NOT NULL DEFAULT true,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_templates_company ON public.recurring_invoice_templates (company_id);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_next_run ON public.recurring_invoice_templates (next_run_at) WHERE active = true;

ALTER TABLE public.recurring_invoice_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring_tenant_select" ON public.recurring_invoice_templates;
CREATE POLICY "recurring_tenant_select"
  ON public.recurring_invoice_templates FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "recurring_tenant_admin_write" ON public.recurring_invoice_templates;
CREATE POLICY "recurring_tenant_admin_write"
  ON public.recurring_invoice_templates FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('company_admin','admin','super_admin','sales_admin')))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('company_admin','admin','super_admin','sales_admin')));

CREATE TABLE IF NOT EXISTS public.recurring_invoice_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.recurring_invoice_templates(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ran_at timestamptz NOT NULL DEFAULT NOW(),
  success boolean NOT NULL,
  error text,
  scheduled_for date NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_runs_template ON public.recurring_invoice_runs (template_id, ran_at);

ALTER TABLE public.recurring_invoice_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring_runs_tenant_select" ON public.recurring_invoice_runs;
CREATE POLICY "recurring_runs_tenant_select"
  ON public.recurring_invoice_runs FOR SELECT
  USING (template_id IN (
    SELECT id FROM public.recurring_invoice_templates
    WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  ));

COMMENT ON TABLE public.recurring_invoice_templates IS
  'Wave 68 -- recurring invoice rule. One row per "weekly office lunch for Acme". Cron at /api/cron/recurring-invoices walks active rows where next_run_at <= today, generates an invoice per row, advances next_run_at by frequency.';
COMMENT ON TABLE public.recurring_invoice_runs IS
  'Wave 68 -- audit trail for the recurring-invoice cron. One row per (template, run-date) attempt. Links to the generated invoice when successful.';
