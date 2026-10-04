import { readFile } from 'node:fs/promises';

// Disposable database fixture; contains no external credentials or application data.
export async function initializePaymentFixture(db) {
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    CREATE TYPE payment_status AS ENUM ('pending','processing','completed','paid','partial','failed','refunded');
    CREATE TYPE invoice_status AS ENUM ('draft','sent','paid','partially_paid','overdue','written_off','cancelled');
    CREATE TYPE order_status AS ENUM ('pending','confirmed','delivered','completed','cancelled');
    CREATE TYPE payment_method AS ENUM ('eft','other','cash','card','credit_account');
    CREATE TYPE notification_type AS ENUM ('payment_received','payment_claimed','payment_rejected');
    CREATE TABLE companies(id uuid PRIMARY KEY, deposit_percent numeric, owner_id uuid, company_name text, email text);
    CREATE TABLE quotes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid REFERENCES companies);
    CREATE TABLE email_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid REFERENCES companies,template_type text,body text);
    INSERT INTO email_templates(template_type,body) VALUES('deposit_invoice_issued','Old deposit body'),('balance_invoice_issued','Old balance body');
    CREATE TABLE clients(id uuid PRIMARY KEY, company_id uuid REFERENCES companies, user_id uuid, email text);
    CREATE TABLE profiles(id uuid PRIMARY KEY, company_id uuid, role text, email text);
    CREATE TABLE orders(id uuid PRIMARY KEY, company_id uuid REFERENCES companies, client_id uuid REFERENCES clients,
      user_id uuid, total_amount numeric, amount_paid numeric DEFAULT 0, balance_amount numeric,
      deposit_amount numeric, deposit_percentage numeric, event_date date, currency text DEFAULT 'ZAR',
      deposit_paid boolean DEFAULT false, deposit_paid_at timestamptz, balance_paid boolean DEFAULT false,
      balance_paid_at timestamptz, subtotal numeric DEFAULT 0, tax_amount numeric DEFAULT 0, payment_status payment_status DEFAULT 'pending', status order_status DEFAULT 'pending',
      confirmed_at timestamptz, updated_at timestamptz, deleted_at timestamptz, order_number text, client_email text);
    CREATE TABLE invoices(id uuid PRIMARY KEY, company_id uuid REFERENCES companies, client_id uuid REFERENCES clients,
      order_id uuid REFERENCES orders, total_amount numeric, amount_paid numeric DEFAULT 0, balance_due numeric,
      status invoice_status DEFAULT 'sent', paid_at timestamptz, updated_at timestamptz,
      created_at timestamptz DEFAULT now(), subtotal numeric DEFAULT 0, tax_amount numeric DEFAULT 0, currency text DEFAULT 'ZAR', deleted_at timestamptz, invoice_number text);
    CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies,
      client_id uuid NOT NULL REFERENCES clients, order_id uuid REFERENCES orders, invoice_id uuid REFERENCES invoices,
      amount numeric(12,2) NOT NULL, currency text DEFAULT 'ZAR', payment_method payment_method NOT NULL,
      payment_type text, payment_status payment_status DEFAULT 'pending', gateway text, gateway_provider text,
      transaction_id text, gateway_transaction_id text, payment_reference text NOT NULL,
      payment_date timestamptz DEFAULT now(), processed_at timestamptz, completed_at timestamptz, failed_at timestamptz,
      notes text, created_at timestamptz DEFAULT now(), payment_proof_path text, payment_proof_uploaded_at timestamptz,
      reason text, created_by_user_id uuid);
    CREATE TABLE payment_gateways(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid REFERENCES companies, provider text,
      is_test boolean, is_active boolean DEFAULT false, deleted_at timestamptz, created_at timestamptz DEFAULT now(),
      success_url text, cancel_url text, notify_url text, last_verified_at timestamptz, created_by_user_id uuid, updated_by_user_id uuid);
    CREATE UNIQUE INDEX one_active_gateway ON payment_gateways(company_id) WHERE is_active IS TRUE AND deleted_at IS NULL;
    CREATE TABLE payment_gateway_credentials(gateway_id uuid UNIQUE REFERENCES payment_gateways, credentials jsonb);
    ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE payment_gateways ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON profiles, clients TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON payments, invoices, payment_gateways TO authenticated;
    CREATE POLICY company_access_payments ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY company_access_invoices ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY company_access_payment_gateways ON payment_gateways FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid,
      user_id uuid, recipient_id uuid, notification_type text, title text, message text, priority text, link text,
      related_entity_type text, related_entity_id uuid, channels text[]);
    CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, action text, entity_type text, entity_id uuid, details jsonb, created_at timestamptz DEFAULT now());
    ALTER TABLE payments ADD COLUMN refunded_at timestamptz, ADD COLUMN gateway_response jsonb;
    CREATE TABLE fault_injection(enabled boolean);
    INSERT INTO fault_injection VALUES(false);
    CREATE FUNCTION fail_invoice_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF (SELECT enabled FROM fault_injection LIMIT 1) THEN RAISE EXCEPTION 'Injected invoice crash'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER fail_invoice_write BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION fail_invoice_write();
  `);
  for (const file of [
    '20260507140000_invoice_balance_recalc_triggers.sql',
    '20260901120000_reconcile_order_payment_status.sql',
    '20260901130000_fix_reconcile_order_payment_record.sql',
    '20260925150000_payment_attempts_and_gateway_requirements.sql',
    '20261001000000_payment_webhook_idempotency_guard.sql',
  ]) await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../../LOCAL_PAYMENT_MIGRATIONS.sql', import.meta.url),'utf8'));
  await db.exec('GRANT SELECT ON public.payment_attempts TO authenticated');
}
