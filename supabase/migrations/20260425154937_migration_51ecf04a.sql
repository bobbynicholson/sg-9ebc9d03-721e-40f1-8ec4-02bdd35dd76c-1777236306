-- Create accounting_integrations table
CREATE TABLE IF NOT EXISTS accounting_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('xero', 'quickbooks')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  tenant_id TEXT,
  tenant_name TEXT,
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_errors JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(company_id, provider)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_accounting_integrations_company ON accounting_integrations(company_id);
CREATE INDEX IF NOT EXISTS idx_accounting_integrations_provider ON accounting_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_accounting_integrations_active ON accounting_integrations(is_active);

-- Add RLS
ALTER TABLE accounting_integrations ENABLE ROW LEVEL SECURITY;

-- Company admins can manage their own integrations
CREATE POLICY "company_accounting_access" ON accounting_integrations
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

-- Add columns to invoices table for external sync tracking
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS synced_to_accounting BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- Add index
CREATE INDEX IF NOT EXISTS idx_invoices_external_id ON invoices(external_id);
CREATE INDEX IF NOT EXISTS idx_invoices_synced ON invoices(synced_to_accounting);