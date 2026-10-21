import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const company = id(1), otherCompany = id(2), quote = id(3), otherQuote = id(4);
const plan = [{ guestCount: 60, serviceTime: '12:00' }, { guestCount: 40, serviceTime: '18:00' }];
let reproducedOldCollision = false;
const accept = async (quoteId = quote, sittings = plan, companyId = company) =>
  (await db.query('SELECT public.accept_quote_service_plan($1,$2,$3::jsonb) AS result', [quoteId, companyId, sittings == null ? null : JSON.stringify(sittings)])).rows[0].result;
const saved = async () => (await db.query('SELECT status,accepted_at FROM quotes WHERE id=$1', [quote])).rows[0];
const rows = async () => (await db.query('SELECT * FROM service_sittings WHERE quote_id=$1 ORDER BY sequence_number', [quote])).rows;

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.get_user_company_id(uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
    CREATE TABLE companies(id uuid PRIMARY KEY);
    CREATE TABLE orders(id uuid PRIMARY KEY);
    CREATE TABLE quotes(id uuid PRIMARY KEY,company_id uuid REFERENCES companies,status text DEFAULT 'sent',guest_count integer DEFAULT 100,
      event_date date DEFAULT CURRENT_DATE+10,valid_until timestamptz DEFAULT now()+interval '2 days',accepted_at timestamptz,
      converted_to_order_id uuid REFERENCES orders,deleted_at timestamptz,lost_reason text,rejected_at timestamptz,event_time time,updated_at timestamptz);
    CREATE TABLE quote_change_requests(id uuid PRIMARY KEY,company_id uuid REFERENCES companies,quote_id uuid REFERENCES quotes,
      status text DEFAULT 'pending',requested_changes jsonb,created_at timestamptz DEFAULT now());
    CREATE TABLE driver_assignments(order_id uuid REFERENCES orders,driver_id uuid,assignment_type text);
    CREATE TABLE kitchen_prep_tasks(id uuid PRIMARY KEY);
  `);
  await db.exec(await readFile('supabase/migrations/20261020130000_service_sittings.sql', 'utf8'));
  await db.query('INSERT INTO companies VALUES($1),($2)', [company, otherCompany]);
  await db.query('INSERT INTO quotes(id,company_id) VALUES($1,$3),($2,$3)', [quote, otherQuote, company]);
  await db.query('INSERT INTO service_sittings(company_id,quote_id,sequence_number,guest_count,service_time) VALUES($1,$2,1,100,\'12:00\')', [company, quote]);
  try {
    await db.query('INSERT INTO service_sittings(company_id,quote_id,sequence_number,guest_count,service_time) VALUES($1,$2,1,100,\'12:00\')', [company, otherQuote]);
  } catch (error) { reproducedOldCollision = error.code === '23505' && error.constraint === 'service_sittings_order_sequence_unique'; }
  await db.exec(await readFile('supabase/migrations/20261021190000_atomic_quote_service_plan_acceptance.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261022020000_quote_change_request_service_plan.sql', 'utf8'));
  await db.exec(`CREATE TABLE fault_injection(plan_write boolean DEFAULT false,quote_write boolean DEFAULT false);
    INSERT INTO fault_injection DEFAULT VALUES;
    CREATE FUNCTION fail_sitting_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF (SELECT plan_write FROM fault_injection) AND NEW.sequence_number=2 THEN RAISE EXCEPTION 'Injected sitting failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_sitting_write BEFORE INSERT ON service_sittings FOR EACH ROW EXECUTE FUNCTION fail_sitting_write();
    CREATE FUNCTION fail_quote_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF (SELECT quote_write FROM fault_injection) THEN RAISE EXCEPTION 'Injected quote failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_quote_write BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION fail_quote_write();`);
});
beforeEach(async () => {
  await db.exec('UPDATE fault_injection SET plan_write=false,quote_write=false; TRUNCATE service_sittings,quotes,orders CASCADE;');
  await db.query('INSERT INTO quotes(id,company_id) VALUES($1,$3),($2,$3)', [quote, otherQuote, company]);
});
after(() => db.close());

test('reproduces the original NULL order ID uniqueness collision', () => assert.equal(reproducedOldCollision, true));
test('different unconverted quotes can each save two sittings', async () => {
  assert.equal((await accept()).quote.status, 'accepted');
  assert.equal((await accept(otherQuote)).quote.status, 'accepted');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM service_sittings')).rows[0].n, 4);
});
test('sequence numbers stay unique within an actual quote', async () => {
  await accept();
  await assert.rejects(db.query('INSERT INTO service_sittings(company_id,quote_id,sequence_number,guest_count,service_time) VALUES($1,$2,1,10,\'12:00\')', [company, quote]), { code: '23505' });
});
test('unrelated order-only plans no longer collide on a NULL quote ID', async () => {
  await db.query('INSERT INTO orders VALUES($1),($2)', [id(8), id(9)]);
  await db.query('INSERT INTO service_sittings(company_id,order_id,sequence_number,guest_count,service_time) VALUES($1,$2,1,10,\'12:00\'),($1,$3,1,10,\'18:00\')', [company, id(8), id(9)]);
});
test('a failed second sitting rolls back both the plan and acceptance; retry saves both', async () => {
  await db.exec('UPDATE fault_injection SET plan_write=true');
  await assert.rejects(accept(), /Injected sitting failure/);
  assert.deepEqual(await saved(), { status: 'sent', accepted_at: null });
  assert.equal((await rows()).length, 0);
  await db.exec('UPDATE fault_injection SET plan_write=false');
  await accept(); assert.equal((await rows()).length, 2);
});
test('a failed quote update rolls back the newly saved sittings', async () => {
  await db.exec('UPDATE fault_injection SET quote_write=true');
  await assert.rejects(accept(), /Injected quote failure/);
  assert.equal((await rows()).length, 0);
  assert.equal((await saved()).status, 'sent');
});
test('failed replacement preserves the previous draft plan', async () => {
  await db.query('INSERT INTO service_sittings(company_id,quote_id,sequence_number,guest_count,service_time) VALUES($1,$2,1,100,\'11:00\')', [company, quote]);
  await db.exec('UPDATE fault_injection SET plan_write=true');
  await assert.rejects(accept());
  assert.equal((await rows())[0].service_time, '11:00:00');
  assert.equal((await saved()).status, 'sent');
});
test('repeat acceptance preserves the accepted plan and original acceptance timestamp', async () => {
  const first = await accept();
  const second = await accept(quote, [{ guestCount: 100, serviceTime: '15:00' }]);
  assert.equal(second.alreadyAccepted, true);
  assert.equal(second.quote.accepted_at, first.quote.accepted_at);
  assert.deepEqual((await rows()).map(r => r.service_time), ['12:00:00', '18:00:00']);
});
test('an earlier accepted quote with a missing plan can recover its original times', async () => {
  await db.query('INSERT INTO orders VALUES($1)', [id(8)]);
  await db.query('UPDATE quotes SET status=\'accepted\',accepted_at=now(),converted_to_order_id=$2 WHERE id=$1', [quote, id(8)]);
  const result = await accept();
  assert.equal(result.alreadyAccepted, true);
  assert.ok((await rows()).every(r => r.order_id === id(8)));
});
test('a changed guest count is checked inside the transaction', async () => {
  await db.query('UPDATE quotes SET guest_count=120 WHERE id=$1', [quote]);
  await assert.rejects(accept(), /guest counts must match/);
  assert.equal((await saved()).status, 'sent');
});
test('the service call is tenant-scoped', async () => {
  assert.equal(await accept(quote, plan, otherCompany), null);
  assert.equal((await saved()).status, 'sent');
});
test('browser roles cannot invoke the acceptance function directly', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(accept(), /permission denied/);
    await db.exec('RESET ROLE');
  }
});
for (const invalid of [[], {}, [{ guestCount: 0, serviceTime: '12:00' }], [{ guestCount: 100, serviceTime: '25:00' }], [{ guestCount: 99.5, serviceTime: '12:00' }]]) {
  test(`invalid plan ${JSON.stringify(invalid)} leaves the quote unchanged`, async () => {
    await assert.rejects(accept(quote, invalid));
    assert.equal((await saved()).status, 'sent');
    assert.equal((await rows()).length, 0);
  });
}
test('declined quotes cannot be accepted by the transaction', async () => {
  await db.query('UPDATE quotes SET status=\'rejected\' WHERE id=$1', [quote]);
  await assert.rejects(accept(), /no longer available/);
});
test('legacy callers without a serving plan can still accept a quote', async () => {
  assert.equal((await accept(quote, null)).quote.status, 'accepted');
});

const requestPlan = async (sittings = plan, tenant = company) => db.query(
  'INSERT INTO quote_change_requests(id,company_id,quote_id,requested_changes) VALUES($1,$2,$3,$4::jsonb)',
  [id(11), tenant, quote, JSON.stringify({ service_sittings: sittings })],
);
const address = () => db.query("UPDATE quote_change_requests SET status='addressed' WHERE id=$1", [id(11)]);
const requestStatus = async () => (await db.query('SELECT status FROM quote_change_requests WHERE id=$1', [id(11)])).rows[0].status;

test('requesting two sittings leaves the agreed quote untouched until addressed', async () => {
  await requestPlan(); assert.equal((await rows()).length, 0); assert.equal((await saved()).status, 'sent');
  await address();
  assert.deepEqual((await rows()).map(s => [s.guest_count, s.service_time]), [[60, '12:00:00'], [40, '18:00:00']]);
  assert.equal((await db.query('SELECT event_time FROM quotes WHERE id=$1', [quote])).rows[0].event_time, '12:00:00');
  assert.deepEqual(await saved(), { status: 'sent', accepted_at: null });
});

test('the addressed plan remains available to legacy acceptance', async () => {
  await requestPlan(); await address(); await accept(quote, null);
  assert.deepEqual((await rows()).map(s => s.service_time), ['12:00:00', '18:00:00']);
});

test('dismissing a requested plan does not alter the serving times', async () => {
  await requestPlan(); await db.query("UPDATE quote_change_requests SET status='dismissed' WHERE id=$1", [id(11)]);
  assert.equal((await rows()).length, 0);
});

test('addressing several requests saves only the newest serving proposal', async () => {
  await requestPlan();
  await db.query("UPDATE quote_change_requests SET created_at='2026-10-20' WHERE id=$1", [id(11)]);
  await db.query("INSERT INTO quote_change_requests(id,company_id,quote_id,requested_changes,created_at) VALUES($1,$2,$3,$4,'2026-10-21')",
    [id(12), company, quote, JSON.stringify({ service_sittings: [{ guestCount: 30, serviceTime: '13:00' }, { guestCount: 70, serviceTime: '19:00' }] })]);
  await db.exec("UPDATE quote_change_requests SET status='addressed'");
  assert.deepEqual((await rows()).map(s => [s.guest_count, s.service_time]), [[30, '13:00:00'], [70, '19:00:00']]);
});

test('a failed approval rolls back its status and preserves the previous serving plan', async () => {
  await db.query("INSERT INTO service_sittings(company_id,quote_id,sequence_number,guest_count,service_time) VALUES($1,$2,1,100,'11:00')", [company, quote]);
  await requestPlan(); await db.exec('UPDATE fault_injection SET plan_write=true');
  await assert.rejects(address(), /Injected sitting failure/);
  assert.equal(await requestStatus(), 'pending');
  assert.deepEqual((await rows()).map(s => [s.guest_count, s.service_time]), [[100, '11:00:00']]);
});

test('approval checks the current guest count after admin edits', async () => {
  await requestPlan(); await db.query('UPDATE quotes SET guest_count=120 WHERE id=$1', [quote]);
  await assert.rejects(address(), /Serving-plan guests must match/);
  assert.equal(await requestStatus(), 'pending'); assert.equal((await rows()).length, 0);
});

test('approved single-time replacement removes the previous two-sitting draft', async () => {
  await requestPlan(); await address();
  await db.query("UPDATE quote_change_requests SET status='pending',requested_changes=$2 WHERE id=$1", [id(11), JSON.stringify({ service_sittings: [{ guestCount: 100, serviceTime: '15:00' }] })]);
  await address();
  assert.deepEqual((await rows()).map(s => [s.guest_count, s.service_time]), [[100, '15:00:00']]);
});

test('an addressed request cannot overwrite a previously accepted plan', async () => {
  await requestPlan(); await accept();
  await assert.rejects(address(), /existing booking/); assert.equal(await requestStatus(), 'pending');
});

test('a mismatched request tenant cannot alter another company quote', async () => {
  await requestPlan(plan, otherCompany); await assert.rejects(address(), /Quote not found/);
  assert.equal((await rows()).length, 0); assert.equal(await requestStatus(), 'pending');
});

for (const invalid of [[], [{ guestCount: 100, serviceTime: '25:00' }], [{ guestCount: 99.5, serviceTime: '12:00' }]]) {
  test(`invalid requested plan ${JSON.stringify(invalid)} cannot be approved`, async () => {
    await requestPlan(invalid); await assert.rejects(address(), { code: '22023' });
    assert.equal(await requestStatus(), 'pending'); assert.equal((await rows()).length, 0);
  });
}
