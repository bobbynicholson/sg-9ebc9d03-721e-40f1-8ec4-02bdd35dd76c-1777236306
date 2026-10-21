import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const company = id(1), otherCompany = id(2), quote = id(3);
const migration = 'supabase/migrations/20261022010000_quote_order_equipment_return_plan_default.sql';
const convert = async (payload = {}, companyId = company) =>
  (await db.query('SELECT to_jsonb(public.convert_quote_to_order($1,$2,NULL,$3::jsonb)) AS result',
    [quote, companyId, JSON.stringify({
      client_id: id(5), region_id: id(6), event_name: 'Quote conversion fixture', event_date: '2026-11-01',
      guest_count: 100, venue_address: 'Test venue', subtotal: 100, total_amount: 100,
      collection_fee: 0, collection_next_day: false, waiter_count: 1, ...payload,
    })])).rows[0].result;
const state = async () => (await db.query('SELECT status,converted_to_order_id FROM quotes WHERE id=$1', [quote])).rows[0];
let originalFailure;

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.get_user_company_id(uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
    CREATE TABLE companies(id uuid PRIMARY KEY);
    CREATE TABLE profiles(id uuid PRIMARY KEY,active_role text,role text,company_id uuid);
    -- Match every required column from the live orders schema. The payload
    -- supplies the booking fields; the real RPC/insert triggers supply defaults.
    CREATE TABLE orders(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies,
      quote_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
      client_id uuid NOT NULL,region_id uuid NOT NULL,event_name text NOT NULL,event_date date NOT NULL,
      guest_count integer NOT NULL,venue_address text NOT NULL,subtotal numeric NOT NULL,total_amount numeric NOT NULL,
      collection_fee numeric NOT NULL DEFAULT 0,collection_next_day boolean NOT NULL DEFAULT false,waiter_count integer NOT NULL DEFAULT 1,
      requires_refrigeration boolean NOT NULL DEFAULT false,requires_two_drivers boolean NOT NULL DEFAULT false,
      order_number text NOT NULL,status text NOT NULL DEFAULT 'confirmed',payment_opening_paid numeric(12,2));
    CREATE TABLE quotes(id uuid PRIMARY KEY,company_id uuid REFERENCES companies,status text DEFAULT 'sent',guest_count integer DEFAULT 100,
      event_date date DEFAULT CURRENT_DATE+10,valid_until timestamptz DEFAULT now()+interval '2 days',accepted_at timestamptz,
      converted_to_order_id uuid REFERENCES orders,deleted_at timestamptz,lost_reason text,rejected_at timestamptz,updated_at timestamptz);
    CREATE TABLE driver_assignments(order_id uuid REFERENCES orders,driver_id uuid,assignment_type text);
    CREATE TABLE kitchen_prep_tasks(id uuid PRIMARY KEY);
    CREATE TABLE document_numbers(company_id uuid PRIMARY KEY REFERENCES companies,next_number integer NOT NULL DEFAULT 1);
    CREATE FUNCTION public.consume_next_document_number(p_company_id uuid,p_type text) RETURNS text LANGUAGE plpgsql AS $$
    DECLARE n integer; BEGIN
      UPDATE document_numbers SET next_number=next_number+1 WHERE company_id=p_company_id RETURNING next_number-1 INTO n;
      RETURN 'ORD-' || n::text;
    END $$;
  `);
  for (const file of [
    'supabase/migrations/20260704100000_reapply_convert_quote_to_order_accepted_status.sql',
    'supabase/migrations/20261004120000_fix_quote_order_opening_paid.sql',
    'supabase/migrations/20261020130000_service_sittings.sql',
    'supabase/migrations/20261021190000_atomic_quote_service_plan_acceptance.sql',
  ]) await db.exec(await readFile(file, 'utf8'));
  await db.query('INSERT INTO companies VALUES($1),($2)', [company, otherCompany]);
  await db.query('INSERT INTO document_numbers(company_id) VALUES($1)', [company]);
  await db.query('INSERT INTO quotes(id,company_id) VALUES($1,$2)', [quote, company]);
  try { await convert(); } catch (error) { originalFailure = { code: error.code, column: error.column }; }
  await db.exec(await readFile(migration, 'utf8'));
  // Reapplying a migration must not duplicate the trigger or change the behaviour.
  await db.exec(await readFile(migration, 'utf8'));
});
beforeEach(async () => {
  await db.exec('TRUNCATE service_sittings,quotes,orders CASCADE; UPDATE document_numbers SET next_number=1;');
  await db.query('INSERT INTO quotes(id,company_id) VALUES($1,$2)', [quote, company]);
});
after(() => db.close());

test('reproduces the screenshot error through the real conversion RPC before the fix', () => {
  assert.deepEqual(originalFailure, { code: '23502', column: 'equipment_return_plan' });
});

for (const payload of [{}, { equipment_return_plan: null }]) {
  test(`legacy payload ${JSON.stringify(payload)} converts with the default plan`, async () => {
    const order = await convert(payload);
    assert.equal(order.equipment_return_plan, 'final_collection');
    assert.equal(Number(order.payment_opening_paid), 0);
    assert.equal(order.status, 'confirmed');
    assert.deepEqual(await state(), { status: 'accepted', converted_to_order_id: order.id });
  });
}

for (const plan of ['final_collection', 'per_sitting_collection', 'on_site_return', 'client_return']) {
  test(`conversion preserves explicit ${plan}`, async () => {
    assert.equal((await convert({ equipment_return_plan: plan })).equipment_return_plan, plan);
  });
}

test('a quote with two saved serving times can convert without supplying a return plan', async () => {
  const sittings = [{ guestCount: 60, serviceTime: '12:00' }, { guestCount: 40, serviceTime: '18:00' }];
  await db.query('SELECT public.accept_quote_service_plan($1,$2,$3::jsonb)', [quote, company, JSON.stringify(sittings)]);
  const order = await convert();
  assert.equal(order.equipment_return_plan, 'final_collection');
  assert.equal((await state()).converted_to_order_id, order.id);
  assert.deepEqual((await db.query('SELECT guest_count,service_time FROM service_sittings WHERE quote_id=$1 ORDER BY sequence_number', [quote])).rows,
    [{ guest_count: 60, service_time: '12:00:00' }, { guest_count: 40, service_time: '18:00:00' }]);
});

test('invalid explicit plans still fail and roll back the order, quote and numbering', async () => {
  await assert.rejects(convert({ equipment_return_plan: 'invalid' }), { code: '23514' });
  assert.deepEqual(await state(), { status: 'sent', converted_to_order_id: null });
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 0);
  assert.equal((await convert()).order_number, 'ORD-1');
});

test('a retry cannot create a second order', async () => {
  const first = await convert();
  await assert.rejects(convert(), /quote_already_converted/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 1);
  assert.equal((await state()).converted_to_order_id, first.id);
});

test('the default does not bypass tenant scoping', async () => {
  await assert.rejects(convert({}, otherCompany), /quote_company_mismatch/);
  assert.deepEqual(await state(), { status: 'sent', converted_to_order_id: null });
});

test('updating an existing order cannot silently reset a chosen plan to the default', async () => {
  const order = await convert({ equipment_return_plan: 'client_return' });
  await assert.rejects(db.query('UPDATE orders SET equipment_return_plan=NULL WHERE id=$1', [order.id]), { code: '23502' });
  assert.equal((await db.query('SELECT equipment_return_plan FROM orders WHERE id=$1', [order.id])).rows[0].equipment_return_plan, 'client_return');
});
