import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializePaymentFixture } from './payment-fixture.mjs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

// Deliberately isolated: no .env, production credentials or Supabase calls.
// This schema fixture covers columns/constraints used by the new routines.
// It does not substitute for running all historical migrations on PostgreSQL.
let db;
let postgresAdmin, postgresPool, roleConnection, testDatabase, roleScoped = false;
const postgresMode = process.env.PAYMENT_TEST_DATABASE_URL;
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const company = uuid(1), client = uuid(2), order = uuid(3), invoice = uuid(4), attempt = uuid(5);
before(async () => {
  if (postgresMode) {
    const url = new URL(postgresMode);
    if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.pathname !== '/payment_fixture') {
      throw new Error('Payment tests require a local database named payment_fixture; remote databases are refused');
    }
    pg.types.setTypeParser(20, Number); pg.types.setTypeParser(1700, Number);
    postgresAdmin = new pg.Client({ connectionString: url.href }); await postgresAdmin.connect();
    testDatabase = `payment_tests_${process.pid}_${Date.now()}`;
    await postgresAdmin.query(`CREATE DATABASE ${testDatabase}`);
    url.pathname = `/${testDatabase}`;
    postgresPool = new pg.Pool({ connectionString: url.href, max: 12 });
    roleConnection = await postgresPool.connect();
    db = {
      exec: async (sql) => {
        const result = await roleConnection.query(sql);
        if (/SET ROLE (anon|authenticated)/i.test(sql)) roleScoped = true;
        if (/RESET ROLE/i.test(sql)) roleScoped = false;
        return result;
      },
      query: (sql, values) => (roleScoped || sql.includes('set_config(') ? roleConnection : postgresPool).query(sql, values),
      close: async () => { roleConnection.release(); await postgresPool.end(); },
    };
  } else db = new PGlite();
  await initializePaymentFixture(db);
});
after(async () => {
  await db?.close();
  if (postgresAdmin) {
    // Only the database created by this run can be removed.
    if (/^payment_tests_\d+_\d+$/.test(testDatabase)) await postgresAdmin.query(`DROP DATABASE ${testDatabase}`);
    await postgresAdmin.end();
  }
});

async function reset(amount = 100, paymentType = 'deposit') {
  await db.exec(`UPDATE fault_injection SET enabled=false;
    TRUNCATE audit_logs, payment_gateway_credential_versions, payment_gateway_credentials, payment_gateways, notifications, payment_receipt_outbox, payment_gateway_events, payments, payment_attempts,
      invoices, orders, clients, profiles, companies CASCADE;
    INSERT INTO companies VALUES('${company}',50,'${uuid(6)}','Test company','owner@example.test');
    INSERT INTO clients VALUES('${client}','${company}','${uuid(7)}','client@example.test');
    INSERT INTO profiles(id,company_id,role) VALUES('${uuid(6)}','${company}','company_admin');
    INSERT INTO orders(id,company_id,client_id,total_amount,balance_amount,deposit_amount,event_date,order_number)
      VALUES('${order}','${company}','${client}',1000,1000,300,CURRENT_DATE+10,'ORD-1');
    INSERT INTO invoices(id,company_id,client_id,order_id,total_amount,balance_due,invoice_number)
      VALUES('${invoice}','${company}','${client}','${order}',1000,1000,'INV-1');
    INSERT INTO payment_attempts(id,company_id,client_id,order_id,invoice_id,provider,provider_session_id,payment_type,amount,currency)
      VALUES('${attempt}','${company}','${client}','${order}','${invoice}','payfast','${attempt}','${paymentType}',${amount},'ZAR');
  `);
}
async function event(tx = 'pf-1') {
  return (await db.query(`INSERT INTO payment_gateway_events(company_id,provider,transaction_id,payload)
    VALUES($1,'payfast',$2,'{}') RETURNING id`, [company, tx])).rows[0].id;
}
async function settle(options = {}) {
  const values = ['payfast', options.tx || 'pf-1', options.company || company,
    options.reference || order, options.type || 'deposit', invoice,
    options.attempt === undefined ? attempt : options.attempt, options.amount ?? 100,
    options.currency || 'ZAR', options.eventId || null];
  return (await db.query('SELECT settle_verified_gateway_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result', values)).rows[0].result;
}
async function state() {
  return {
    invoice: (await db.query('SELECT * FROM invoices WHERE id=$1',[invoice])).rows[0],
    order: (await db.query('SELECT * FROM orders WHERE id=$1',[order])).rows[0],
    attempt: (await db.query('SELECT * FROM payment_attempts WHERE id=$1',[attempt])).rows[0],
    payments: (await db.query('SELECT * FROM payments')).rows,
    jobs: (await db.query('SELECT * FROM payment_receipt_outbox')).rows,
  };
}

test('partial deposit does not confirm the order or falsely mark deposit/balance paid', async () => {
  await reset(); const receipt = await event(); await settle({ eventId: receipt });
  const current = await state();
  assert.equal(Number(current.invoice.amount_paid),100); assert.equal(Number(current.invoice.balance_due),900);
  assert.equal(current.order.deposit_paid,false); assert.equal(current.order.balance_paid,false);
  assert.equal(current.order.status,'pending'); assert.equal(current.attempt.status,'succeeded');
  assert.ok((await db.query('SELECT processed_at FROM payment_gateway_events')).rows[0].processed_at);
});
test('deposit threshold confirms; full pre-event payment never completes undelivered order', async () => {
  await reset(1000); await settle({ amount:1000 }); const current = await state();
  assert.equal(current.order.deposit_paid,true); assert.equal(current.order.balance_paid,true);
  assert.equal(current.order.status,'confirmed'); assert.equal(Number(current.invoice.balance_due),0);
});
test('crash during invoice write rolls back ledger, order, attempt and receipt completion together', async () => {
  await reset(); const receipt = await event(); await db.exec('UPDATE fault_injection SET enabled=true');
  await assert.rejects(settle({ eventId:receipt }), /Injected invoice crash/);
  const current = await state(); assert.equal(current.payments.length,0); assert.equal(current.jobs.length,0);
  assert.equal(Number(current.invoice.amount_paid),0); assert.equal(current.attempt.status,'pending');
  assert.equal((await db.query('SELECT processed_at FROM payment_gateway_events')).rows[0].processed_at,null);
  await db.exec('UPDATE fault_injection SET enabled=false'); await settle({ eventId:receipt });
  assert.equal((await state()).payments.length,1);
});
test('crash after commit / lost HTTP response can retry without adding money or receipt jobs', async () => {
  await reset(); const receipt = await event(); await settle({ eventId:receipt });
  const replay = await settle({ eventId:receipt });
  assert.equal(replay.duplicate,true); const current = await state();
  assert.equal(current.payments.length,1); assert.equal(Number(current.invoice.amount_paid),100); assert.equal(current.jobs.length,1);
});
test('queued duplicate callbacks settle once', async () => {
  await reset(); await Promise.all([settle(),settle(),settle(),settle()]);
  assert.equal((await state()).payments.length,1); assert.equal(Number((await state()).invoice.amount_paid),100);
});
test('legacy interrupted order-only row is linked and repaired on duplicate replay', async () => {
  await reset(); await db.exec(`INSERT INTO payments(company_id,client_id,order_id,amount,payment_method,payment_status,
    gateway_provider,gateway_transaction_id,transaction_id,payment_reference,currency)
    VALUES('${company}','${client}','${order}',100,'other','completed','payfast','pf-1','pf-1','pf-1','ZAR');
    UPDATE invoices SET amount_paid=0,balance_due=1000,status='sent';`);
  assert.equal((await settle()).duplicate,true); const current = await state();
  assert.equal(current.payments[0].invoice_id,invoice); assert.equal(Number(current.invoice.amount_paid),100);
  assert.equal(current.attempt.status,'succeeded');
});
test('wrong tenant, currency, amount, reference and payment type never settle', async () => {
  await reset();
  for (const options of [{company:uuid(9)}, {currency:'USD'}, {amount:100.01}, {reference:uuid(9)}, {type:'balance'}]) {
    await assert.rejects(settle(options), /match|belong|mismatch/i);
  }
  assert.equal((await state()).payments.length,0);
});
test('late success repairs failed/expired attempt; delayed failure cannot undo committed money', async () => {
  await reset(); await db.exec("UPDATE payment_attempts SET status='expired',failure_reason='timeout'");
  await settle(); assert.equal((await state()).attempt.status,'succeeded');
  const staleFailure = await db.query("UPDATE payment_attempts SET status='failed' WHERE id=$1 AND status='pending' RETURNING id",[attempt]);
  assert.equal(staleFailure.rows.length,0);
});
test('two real successful charges are recorded in full and excess is exposed', async () => {
  await reset(700); await settle({amount:700}); const second = await settle({tx:'pf-2',amount:700});
  const current = await state(); assert.equal(current.payments.length,2); assert.equal(Number(current.invoice.amount_paid),1400);
  assert.equal(Number(second.overpayment_amount),400); assert.equal(Number(current.invoice.balance_due),0);
});
test('late valid charge records money on cancelled order without reopening it', async () => {
  await reset(); await db.exec("UPDATE orders SET status='cancelled'; UPDATE invoices SET status='cancelled'");
  await settle(); const current = await state();
  assert.equal(current.order.status,'cancelled'); assert.equal(current.invoice.status,'cancelled'); assert.equal(current.payments.length,1);
});
test('standalone invoice payment settles atomically without an order foreign key', async () => {
  await reset(); await db.exec(`UPDATE invoices SET order_id=NULL;
    UPDATE payment_attempts SET order_id=NULL,payment_type='invoice';`);
  await settle({reference:invoice,type:'invoice'}); const current = await state();
  assert.equal(current.payments[0].order_id,null); assert.equal(Number(current.invoice.amount_paid),100);
});
async function claim(amount = 100) {
  return (await db.query('SELECT create_eft_payment_claim($1,$2,$3,now(),$4,NULL) result',
    [invoice,company,amount,'test claim'])).rows[0].result;
}
async function verify(id, action, companyId = company) {
  return (await db.query('SELECT verify_eft_payment_claim($1,$2,$3,$4) result',[id,companyId,action,'Not matched'])).rows[0].result;
}
test('concurrent/repeated EFT submissions share one pending claim and never credit before verification', async () => {
  await reset(); const claims = await Promise.all([claim(),claim(),claim()]);
  assert.equal(new Set(claims.map(c=>c.payment_id)).size,1); const current = await state();
  assert.equal(current.payments.length,1); assert.equal(Number(current.invoice.amount_paid),0); assert.equal(current.jobs.length,1);
});
test('EFT confirm crash rolls back payment and totals; retry and repeated confirm are safe', async () => {
  await reset(); const c = await claim(); await db.exec('UPDATE fault_injection SET enabled=true');
  await assert.rejects(verify(c.payment_id,'confirm'), /Injected invoice crash/);
  assert.equal((await state()).payments[0].payment_status,'pending');
  await db.exec('UPDATE fault_injection SET enabled=false'); await verify(c.payment_id,'confirm');
  assert.equal((await verify(c.payment_id,'confirm')).duplicate,true); assert.equal(Number((await state()).invoice.amount_paid),100);
  await assert.rejects(verify(c.payment_id,'reject'), /already resolved/);
});
test('EFT reject is idempotent, does not credit; confirm cannot reverse a reject', async () => {
  await reset(); const c = await claim(); await verify(c.payment_id,'reject');
  assert.equal((await verify(c.payment_id,'reject')).duplicate,true);
  await assert.rejects(verify(c.payment_id,'confirm'), /already resolved/);
  assert.equal(Number((await state()).invoice.amount_paid),0);
});
test('racing EFT confirm/reject has one winner and consistent invoice', async () => {
  await reset(); const c = await claim(); const results = await Promise.allSettled([verify(c.payment_id,'confirm'),verify(c.payment_id,'reject')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const current = await state(); assert.equal(Number(current.invoice.amount_paid),current.payments[0].payment_status==='completed' ? 100 : 0);
});
test('EFT wrong-company verification and attempting to verify gateway money are rejected', async () => {
  await reset(); const c = await claim(); await assert.rejects(verify(c.payment_id,'confirm',uuid(9)), /company/);
  await settle(); const paid = (await state()).payments.find(p=>p.gateway_provider==='payfast');
  await assert.rejects(verify(paid.id,'confirm'), /EFT claim/);
});
test('receipt in-app delivery is durable and idempotent even if the worker loses its response', async () => {
  await reset(); await settle(); const job = (await state()).jobs[0];
  await db.query('SELECT deliver_payment_receipt_in_app($1)',[job.id]);
  const first = (await db.query('SELECT count(*) count FROM notifications')).rows[0].count;
  await db.query('SELECT deliver_payment_receipt_in_app($1)',[job.id]);
  assert.equal(first,2); assert.equal((await db.query('SELECT count(*) count FROM notifications')).rows[0].count,first);
});
test('store-credit debit, ledger and invoice survive failure together and cap by locked balance', async () => {
  await reset(); await db.exec(`INSERT INTO payments(company_id,client_id,amount,payment_method,payment_reference,payment_type,payment_status)
    VALUES('${company}','${client}',1500,'credit_account','issued','credit_issue','completed');`);
  await db.exec('UPDATE fault_injection SET enabled=true');
  const redeem = () => db.query('SELECT redeem_client_credit($1,$2,$3,$4,$5,NULL) result',[company,client,invoice,order,700]);
  await assert.rejects(redeem(), /Injected invoice crash/);
  assert.equal((await state()).payments.length,1);
  await db.exec('UPDATE fault_injection SET enabled=false');
  const a = (await redeem()).rows[0].result; const b = (await redeem()).rows[0].result;
  assert.equal(Number(a.redeemed_amount),700); assert.equal(Number(b.redeemed_amount),300);
  assert.equal(Number((await state()).invoice.amount_paid),1000);
});
test('anonymous/authenticated roles cannot invoke settlement or read private event/receipt data', async () => {
  await reset(); await db.exec('SET ROLE authenticated');
  try {
    await assert.rejects(db.query('SELECT * FROM payment_gateway_events'), /permission denied/);
    await assert.rejects(db.query('SELECT refresh_invoice_payment_totals($1,0)',[invoice]), /permission denied/);
    await assert.rejects(settle(), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM payment_credit_redemptions'), /permission denied/);
    await assert.rejects(db.query('SELECT redeem_client_credit_once($1,$2,$3,$4,100,$5,NULL)', [company,client,invoice,order,uuid(60)]), /permission denied/);
  } finally { await db.exec('RESET ROLE'); }
});

test('lost partial-credit response and queued retries return the original debit without spending again', async () => {
  await reset(); await db.exec(`INSERT INTO payments(company_id,client_id,amount,payment_method,payment_reference,payment_type,payment_status)
    VALUES('${company}','${client}',1500,'credit_account','issued','credit_issue','completed');`);
  const redeem = () => db.query('SELECT redeem_client_credit_once($1,$2,$3,$4,100,$5,NULL) result', [company,client,invoice,order,uuid(60)]);
  const first = (await redeem()).rows[0].result;
  const retries = await Promise.all([redeem(), redeem(), redeem()]);
  for (const retry of retries) assert.deepEqual(retry.rows[0].result, { ...first, replayed: true });
  assert.equal(Number((await state()).invoice.amount_paid),100);
  assert.equal((await db.query("SELECT count(*) count FROM payments WHERE payment_type='credit_redeem'")).rows[0].count,1);
  assert.equal((await db.query('SELECT count(*) count FROM payment_credit_redemptions')).rows[0].count,1);
  await db.query('SELECT redeem_client_credit_once($1,$2,$3,$4,100,$5,NULL)', [company,client,invoice,order,uuid(61)]);
  assert.equal(Number((await state()).invoice.amount_paid),200);
});

test('credit replay keys cannot be reused with changed details and a failed transaction remains retryable', async () => {
  await reset(); await db.exec(`INSERT INTO payments(company_id,client_id,amount,payment_method,payment_reference,payment_type,payment_status)
    VALUES('${company}','${client}',1500,'credit_account','issued','credit_issue','completed');`);
  const redeem = (amount = 100) => db.query('SELECT redeem_client_credit_once($1,$2,$3,$4,$5,$6,NULL) result', [company,client,invoice,order,amount,uuid(60)]);
  await db.exec('UPDATE fault_injection SET enabled=true');
  await assert.rejects(redeem(), /Injected invoice crash/);
  assert.equal((await db.query('SELECT count(*) count FROM payment_credit_redemptions')).rows[0].count,0);
  await db.exec('UPDATE fault_injection SET enabled=false'); await redeem();
  await assert.rejects(redeem(200), /reused with different details/);
  assert.equal(Number((await state()).invoice.amount_paid),100);
});
test('separate deposit/final invoices retain all order payments without copying totals twice', async () => {
  await reset(300); await db.exec(`UPDATE invoices SET total_amount=300,balance_due=300;`);
  await settle({amount:300}); const finalInvoice = uuid(20), finalAttempt = uuid(21);
  await db.exec(`INSERT INTO invoices(id,company_id,client_id,order_id,total_amount,balance_due,invoice_number)
    VALUES('${finalInvoice}','${company}','${client}','${order}',700,700,'FINAL-1');
    INSERT INTO payment_attempts(id,company_id,client_id,order_id,invoice_id,provider,provider_session_id,payment_type,amount,currency)
    VALUES('${finalAttempt}','${company}','${client}','${order}','${finalInvoice}','payfast','${finalAttempt}','balance',700,'ZAR');`);
  await db.query('SELECT settle_verified_gateway_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL)',
    ['payfast','pf-final',company,order,'balance',finalInvoice,finalAttempt,700,'ZAR']);
  assert.equal(Number((await state()).order.amount_paid),1000);
  assert.equal((await state()).order.balance_paid,true);
  await settle({amount:300}); assert.equal(Number((await state()).order.amount_paid),1000);
});
test('imported opening balances remain separate from new payments and refunds reduce totals', async () => {
  await reset(); await db.exec('UPDATE orders SET payment_opening_paid=200; UPDATE invoices SET payment_opening_paid=200,amount_paid=200,balance_due=800');
  await settle(); assert.equal(Number((await state()).invoice.amount_paid),300);
  assert.equal(Number((await state()).order.amount_paid),300);
  await db.exec(`INSERT INTO payments(company_id,client_id,order_id,invoice_id,amount,payment_method,payment_reference,payment_type,payment_status)
    VALUES('${company}','${client}','${order}','${invoice}',50,'eft','refund-1','refund','completed');`);
  assert.equal(Number((await state()).invoice.amount_paid),250);
  assert.equal(Number((await state()).order.amount_paid),250);
});
test('due/past event requires full payment even when configured first payment is smaller', async () => {
  await reset(300); await db.exec('UPDATE orders SET event_date=CURRENT_DATE');
  await settle({amount:300}); assert.equal((await state()).order.deposit_paid,false);
  assert.equal((await state()).order.status,'pending');
});
test('cross-company invoice/order linkage cannot project into another tenant order', async () => {
  await reset(); await db.exec(`INSERT INTO companies(id,deposit_percent) VALUES('${uuid(90)}',50);
    INSERT INTO clients(id,company_id) VALUES('${uuid(91)}','${uuid(90)}');
    INSERT INTO orders(id,company_id,client_id,total_amount,balance_amount,amount_paid)
    VALUES('${uuid(92)}','${uuid(90)}','${uuid(91)}',1000,1000,0);
    UPDATE invoices SET order_id='${uuid(92)}',amount_paid=500;`);
  assert.equal(Number((await db.query('SELECT amount_paid FROM orders WHERE id=$1',[uuid(92)])).rows[0].amount_paid),0);
  await assert.rejects(settle(), /belong/);
});
async function configure(provider = 'payfast', isTest = true, credentials = {merchantId:'test-merchant',merchantKey:'dummy-key'}) {
  return (await db.query('SELECT configure_company_payment_gateway($1,NULL,$2,$3,$4,NULL,NULL,NULL) result',
    [company,provider,isTest,credentials])).rows[0].result;
}
test('gateway metadata and secrets roll back together on a credentials write failure', async () => {
  await reset(); const gateway = await configure();
  await db.exec(`CREATE OR REPLACE FUNCTION fail_credentials() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.credentials->>'merchantId' = 'fail' THEN RAISE EXCEPTION 'Injected credentials crash'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER fail_credentials BEFORE INSERT OR UPDATE ON payment_gateway_credentials FOR EACH ROW EXECUTE FUNCTION fail_credentials();`);
  await assert.rejects(configure('payfast',false,{merchantId:'fail'}), /Injected credentials crash/);
  const current = (await db.query('SELECT read_payment_gateway_configuration(NULL,$1,false) result',[gateway.id])).rows[0].result;
  assert.equal(current.gateway.is_test,true); assert.equal(current.credentials.merchantId,'test-merchant');
  await db.exec('DROP TRIGGER fail_credentials ON payment_gateway_credentials');
});
test('atomic gateway activation keeps exactly one active and failed activation preserves prior gateway', async () => {
  await reset(); const a = await configure(), b = await configure('stripe',false,{secretKey:'dummy-key'});
  await db.query('SELECT activate_company_payment_gateway($1,$2,NULL)',[company,a.id]);
  await assert.rejects(db.query('SELECT activate_company_payment_gateway($1,$2,NULL)',[company,uuid(90)]), /not found/);
  assert.equal((await db.query('SELECT id FROM payment_gateways WHERE is_active IS TRUE')).rows[0].id,a.id);
  await db.query('SELECT activate_company_payment_gateway($1,$2,NULL)',[company,b.id]);
  assert.deepEqual((await db.query('SELECT id FROM payment_gateways WHERE is_active IS TRUE')).rows.map(r=>r.id),[b.id]);
});
test('private checkout credential snapshot survives merchant/mode changes and is never readable by tenant roles', async () => {
  await reset(); const gateway = await configure();
  const saved = (await db.query('SELECT capture_checkout_gateway_credentials($1,$2,true) id',
    [gateway.id,{merchantId:'original',merchantKey:'dummy-old-key'}])).rows[0].id;
  await configure('payfast',false,{merchantId:'new',merchantKey:'dummy-new-key'});
  const snapshot = (await db.query('SELECT * FROM payment_gateway_credential_versions WHERE id=$1',[saved])).rows[0];
  assert.equal(snapshot.credentials.merchantId,'original'); assert.equal(snapshot.is_test,true);
  await db.exec('SET ROLE authenticated');
  try {
    await assert.rejects(db.query('SELECT * FROM payment_gateway_credential_versions'), /permission denied/);
    await assert.rejects(db.query('SELECT read_payment_gateway_configuration(NULL,$1,true)',[gateway.id]), /permission denied/);
  } finally { await db.exec('RESET ROLE'); }
});

async function asUser(id, work) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec('SET ROLE authenticated');
  try { return await work(); }
  finally { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub','',false)"); }
}
test('client direct database access cannot confirm EFT or forge paid invoices and sees only own ledger/attempt', async () => {
  await reset();
  await db.exec(`INSERT INTO profiles(id,company_id,role,email) VALUES('${uuid(7)}','${company}','client','client@example.test');
    INSERT INTO clients(id,company_id,email) VALUES('${uuid(81)}','${company}','other@example.test');
    INSERT INTO payments(id,company_id,client_id,invoice_id,amount,payment_method,payment_reference)
    VALUES('${uuid(80)}','${company}','${client}','${invoice}',100,'eft','own'),
          ('${uuid(82)}','${company}','${uuid(81)}',NULL,100,'eft','other');
    INSERT INTO payment_attempts(id,company_id,client_id,provider,amount)
    VALUES('${uuid(83)}','${company}','${uuid(81)}','payfast',100);`);
  await asUser(uuid(7), async () => {
    assert.deepEqual((await db.query('SELECT id FROM payments')).rows.map(r=>r.id),[uuid(80)]);
    assert.deepEqual((await db.query('SELECT id FROM payment_attempts')).rows.map(r=>r.id),[attempt]);
    await assert.rejects(db.query(`INSERT INTO payments(company_id,client_id,amount,payment_method,payment_reference,payment_status)
      VALUES($1,$2,100,'eft','forged','completed')`,[company,client]), /row-level security/);
    assert.equal((await db.query("UPDATE payments SET payment_status='completed' WHERE id=$1 RETURNING id",[uuid(80)])).rows.length,0);
    assert.equal((await db.query("UPDATE invoices SET amount_paid=1000,balance_due=0,status='paid' WHERE id=$1 RETURNING id",[invoice])).rows.length,0);
    assert.equal((await db.query('DELETE FROM payments RETURNING id')).rows.length,0);
  });
  assert.equal((await db.query('SELECT payment_status FROM payments WHERE id=$1',[uuid(80)])).rows[0].payment_status,'pending');
  assert.equal(Number((await state()).invoice.amount_paid),0);
});
test('operational staff cannot exploit legacy gateway/invoice policies to change financial configuration', async () => {
  await reset(); const gateway = await configure();
  await db.exec(`INSERT INTO profiles(id,company_id,role) VALUES('${uuid(84)}','${company}','driver');`);
  await asUser(uuid(84), async () => {
    assert.equal((await db.query('UPDATE payment_gateways SET is_active=true RETURNING id')).rows.length,0);
    assert.equal((await db.query('UPDATE invoices SET amount_paid=1000 RETURNING id')).rows.length,0);
    await assert.rejects(db.query(`INSERT INTO payments(company_id,client_id,amount,payment_method,payment_reference)
      VALUES($1,$2,100,'eft','forged')`,[company,client]), /row-level security/);
  });
  assert.equal((await db.query('SELECT is_active FROM payment_gateways WHERE id=$1',[gateway.id])).rows[0].is_active,false);
});
test('owner direct financial writes are company-scoped and cross-company moves are rejected', async () => {
  await reset(); const gateway = await configure();
  await db.exec(`UPDATE profiles SET role='owner' WHERE id='${uuid(6)}';
    INSERT INTO companies(id) VALUES('${uuid(90)}');`);
  await asUser(uuid(6), async () => {
    assert.equal((await db.query('UPDATE payment_gateways SET is_active=true WHERE id=$1 RETURNING id',[gateway.id])).rows.length,1);
    await assert.rejects(db.query('UPDATE payment_gateways SET company_id=$1 WHERE id=$2',[uuid(90),gateway.id]), /row-level security/);
    await db.query(`INSERT INTO payments(company_id,client_id,invoice_id,amount,payment_method,payment_reference,payment_status)
      VALUES($1,$2,$3,100,'eft','owner-confirmed','completed')`,[company,client,invoice]);
  });
  assert.equal(Number((await state()).invoice.amount_paid),100);
});


async function unresolvedRefund(age = "10 minutes") {
  await settle();
  return (await db.query(`INSERT INTO payments(company_id,client_id,order_id,invoice_id,amount,payment_method,payment_reference,
    payment_type,payment_status,refund_requested_at) VALUES($1,$2,$3,$4,50,'other','refund-request','refund','processing',now()-$5::interval)
    RETURNING id`,[company,client,order,invoice,age])).rows[0].id;
}
async function reconcile(id, outcome = 'paid', reference = 'provider-refund-1', actor = uuid(6), companyId = company) {
  return (await db.query(`SELECT reconcile_company_refund($1,$2,$3,$4,$5,$6) result`,
    [id,companyId,actor,outcome,reference,'Checked original refund in merchant dashboard; final provider status confirmed.'])).rows[0].result;
}
test('confirmed refund reconciliation is atomic, subtracts money once and queues one durable refund receipt',async()=>{
  await reset(); const id = await unresolvedRefund();
  const results = await Promise.all(Array.from({length:10},()=>reconcile(id)));
  assert.equal(results.filter(r=>!r.duplicate).length,1);
  const current = await state(); assert.equal(Number(current.invoice.amount_paid),50); assert.equal(Number(current.order.amount_paid),50);
  assert.equal(current.jobs.filter(j=>j.kind==='refunded').length,1);
  assert.equal((await db.query('SELECT count(*) count FROM refund_reconciliation_events')).rows[0].count,1);
  assert.equal((await db.query("SELECT count(*) count FROM audit_logs WHERE action='refund_reconciled'")).rows[0].count,1);
  const job = current.jobs.find(j=>j.kind==='refunded');
  assert.equal(Number(job.payload.amount_paid),50);
  await Promise.all([db.query('SELECT deliver_payment_receipt_in_app($1)',[job.id]),db.query('SELECT deliver_payment_receipt_in_app($1)',[job.id])]);
  const notifications = (await db.query('SELECT * FROM notifications')).rows;
  assert.equal(notifications.length,2); assert.ok(notifications.every(n=>n.title==='Refund processed'));
  assert.ok(notifications.some(n=>n.link===`/admin/refunds?paymentId=${id}`));
});
test('refund reconciliation crash rolls back confirmation, projections, evidence, audit and receipt together',async()=>{
  await reset(); const id = await unresolvedRefund(); await db.exec('UPDATE fault_injection SET enabled=true');
  await assert.rejects(reconcile(id),/Injected invoice crash/);
  assert.equal((await db.query('SELECT payment_status FROM payments WHERE id=$1',[id])).rows[0].payment_status,'processing');
  assert.equal((await db.query('SELECT count(*) count FROM refund_reconciliation_events')).rows[0].count,0);
  assert.equal((await db.query('SELECT count(*) count FROM audit_logs')).rows[0].count,0);
  assert.equal((await state()).jobs.filter(j=>j.kind==='refunded').length,0);
  await db.exec('UPDATE fault_injection SET enabled=false'); await reconcile(id);
  assert.equal(Number((await state()).invoice.amount_paid),50);
});
test('only verified terminal failure permits a retry; evidence from an old operation cannot resolve a new request',async()=>{
  await reset(); const id = await unresolvedRefund(); await reconcile(id,'failed');
  assert.equal((await db.query('SELECT payment_status FROM payments WHERE id=$1',[id])).rows[0].payment_status,'pending');
  assert.equal(Number((await state()).invoice.amount_paid),100);
  assert.equal((await state()).jobs.filter(j=>j.kind==='refunded').length,0);
  assert.equal((await reconcile(id,'failed')).duplicate,true);
  await db.query("UPDATE payments SET payment_status='processing',refund_requested_at=now()-interval '5 minutes' WHERE id=$1",[id]);
  await assert.rejects(reconcile(id,'failed'),/different refund action/);
  await reconcile(id,'paid','new-provider-refund');
  assert.equal(Number((await state()).invoice.amount_paid),50);
});
test('recent or legacy unknown requests cannot be released while a payout may be in flight',async()=>{
  await reset(); const id = await unresolvedRefund('10 seconds');
  await assert.rejects(reconcile(id,'failed'),/still be running/);
  await assert.rejects(reconcile(id,'paid'),/still be running/);
  await db.query('UPDATE payments SET refund_requested_at=NULL WHERE id=$1',[id]);
  await assert.rejects(reconcile(id,'failed'),/database operator/);
  await reconcile(id,'paid');
});
test('refund reconciliation rejects cross-company, non-finance and direct tenant database callers',async()=>{
  await reset(); const id = await unresolvedRefund();
  await assert.rejects(reconcile(id,'paid','provider-refund',uuid(6),uuid(9)),/permission denied/);
  await db.query("UPDATE profiles SET role='client' WHERE id=$1",[uuid(6)]);
  await assert.rejects(reconcile(id),/permission denied/);
  await db.exec('SET ROLE authenticated');
  try {
    await assert.rejects(reconcile(id),/permission denied/);
    await assert.rejects(db.query('SELECT * FROM refund_reconciliation_events'),/permission denied/);
  } finally { await db.exec('RESET ROLE'); }
});
test('separate simultaneous gateway charges preserve all ledger money and consistent totals',async()=>{
  await reset();
  await Promise.all(Array.from({length:10},(_,i)=>settle({tx:`pf-parallel-${i}`})));
  const current = await state(); assert.equal(current.payments.length,10);
  assert.equal(Number(current.invoice.amount_paid),1000); assert.equal(Number(current.order.amount_paid),1000);
  assert.equal(current.jobs.length,10); assert.equal(current.order.balance_paid,true);
});
test('parallel receipt workers claim disjoint leases; expired leases become recoverable',async()=>{
  await reset(); await Promise.all(Array.from({length:10},(_,i)=>settle({tx:`pf-lease-${i}`})));
  const claimed = await Promise.all([db.query('SELECT id FROM claim_payment_receipts(5)'),db.query('SELECT id FROM claim_payment_receipts(5)')]);
  const ids = claimed.flatMap(result=>result.rows.map(row=>row.id));
  assert.equal(ids.length,10); assert.equal(new Set(ids).size,10);
  assert.equal((await db.query('SELECT id FROM claim_payment_receipts(5)')).rows.length,0);
  await db.query("UPDATE payment_receipt_outbox SET claimed_until=now()-interval '1 minute' WHERE id=$1",[ids[0]]);
  assert.deepEqual((await db.query('SELECT id FROM claim_payment_receipts(5)')).rows.map(r=>r.id),[ids[0]]);
});
test('competing credit intents cannot overdraw the wallet or overpay a locked invoice',async()=>{
  await reset(); await db.query(`INSERT INTO payments(company_id,client_id,amount,payment_method,payment_reference,payment_type,payment_status)
    VALUES($1,$2,150,'credit_account','issued','credit_issue','completed')`,[company,client]);
  const results = await Promise.all(Array.from({length:10},(_,i)=>db.query('SELECT redeem_client_credit_once($1,$2,$3,$4,100,$5,NULL) result',
    [company,client,invoice,order,uuid(100+i)])));
  assert.equal(results.reduce((sum,result)=>sum+Number(result.rows[0].result.redeemed_amount),0),150);
  assert.equal(Number((await state()).invoice.amount_paid),150);
});
test('simultaneous gateway activations leave exactly one active account',async()=>{
  await reset(); const a = await configure(), b = await configure('stripe',false,{secretKey:'dummy-key'});
  await Promise.all([db.query('SELECT activate_company_payment_gateway($1,$2,NULL)',[company,a.id]),
    db.query('SELECT activate_company_payment_gateway($1,$2,NULL)',[company,b.id])]);
  assert.equal((await db.query('SELECT id FROM payment_gateways WHERE is_active IS TRUE')).rows.length,1);
});
test('a worker skips a receipt locked by another PostgreSQL session',{skip:!postgresMode},async()=>{
  await reset(); await settle(); const job=(await state()).jobs[0]; const lock=await postgresPool.connect();
  try {
    await lock.query('BEGIN'); await lock.query('SELECT id FROM payment_receipt_outbox WHERE id=$1 FOR UPDATE',[job.id]);
    assert.equal((await db.query('SELECT id FROM claim_payment_receipts(5)')).rows.length,0);
    await lock.query('ROLLBACK');
    assert.deepEqual((await db.query('SELECT id FROM claim_payment_receipts(5)')).rows.map(r=>r.id),[job.id]);
  } finally { await lock.query('ROLLBACK'); lock.release(); }
});
