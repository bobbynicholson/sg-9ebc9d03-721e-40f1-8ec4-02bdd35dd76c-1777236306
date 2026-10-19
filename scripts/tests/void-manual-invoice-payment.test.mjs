import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL("../../supabase/migrations/20261019133000_void_manual_invoice_payment.sql", import.meta.url);
const ids = { company: "11111111-1111-1111-1111-111111111111", actor: "22222222-2222-2222-2222-222222222222", invoice: "33333333-3333-3333-3333-333333333333", manual: "44444444-4444-4444-4444-444444444444", gateway: "55555555-5555-5555-5555-555555555555" };

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create type public.payment_status as enum ('pending','completed','failed','voided');
    create type public.invoice_status as enum ('sent','partially_paid','paid');
    create table public.profiles (id uuid primary key);
    create table public.invoices (id uuid primary key, company_id uuid not null, invoice_number text, total_amount numeric not null, amount_paid numeric not null, balance_due numeric not null, status public.invoice_status not null, paid_at timestamptz, updated_at timestamptz);
    create table public.payments (id uuid primary key, company_id uuid not null, invoice_id uuid references public.invoices(id), amount numeric not null, currency text, payment_reference text, gateway_provider text, payment_status public.payment_status not null, payment_type text, updated_at timestamptz);
    create table public.audit_logs (id uuid primary key default gen_random_uuid(), company_id uuid, user_id uuid, action text, entity_type text, entity_id uuid, details jsonb);
    create function public.recalc_invoice_totals(p_invoice_id uuid) returns void language plpgsql as $$
      declare v_paid numeric; begin
      select coalesce(sum(amount) filter (where payment_status = 'completed'),0) into v_paid from public.payments where invoice_id=p_invoice_id;
      update public.invoices set amount_paid=v_paid,balance_due=total_amount-v_paid,status=case when v_paid>=total_amount then 'paid'::public.invoice_status when v_paid>0 then 'partially_paid'::public.invoice_status else 'sent'::public.invoice_status end,paid_at=case when v_paid>=total_amount then coalesce(paid_at,now()) else null end,updated_at=now() where id=p_invoice_id; end $$;
  `);
  await db.exec(await readFile(migrationUrl, "utf8"));
  await db.exec(`insert into public.profiles values ('${ids.actor}');
    insert into public.invoices values ('${ids.invoice}','${ids.company}','INV-1',1280,1280,0,'paid',now(),now());
    insert into public.payments (id,company_id,invoice_id,amount,currency,payment_reference,gateway_provider,payment_status) values ('${ids.manual}','${ids.company}','${ids.invoice}',1280,'ZAR','INV-1','manual','completed');`);
  return db;
}
async function reverse(db, id = ids.manual) { return (await db.query(`select public.void_manual_invoice_payment('${id}','${ids.company}','${ids.actor}','Entered against the wrong invoice') as result`)).rows[0].result; }

test("voiding a manual payment restores balance, records audit data, and is idempotent", async () => {
  const db = await fixture();
  try {
    const first = await reverse(db);
    assert.equal(first.idempotent, false); assert.equal(first.balance_due, 1280); assert.equal(first.invoice_status, "sent");
    const payment = (await db.query(`select payment_status, voided_at, void_reason from public.payments where id='${ids.manual}'`)).rows[0];
    assert.equal(payment.payment_status, "voided"); assert.ok(payment.voided_at); assert.equal(payment.void_reason, "Entered against the wrong invoice");
    assert.equal((await reverse(db)).idempotent, true);
    assert.equal((await db.query("select count(*)::int as count from public.audit_logs")).rows[0].count, 1);
  } finally { await db.close(); }
});

test("gateway payment reversals are rejected without changing the ledger", async () => {
  const db = await fixture();
  try {
    await db.exec(`insert into public.payments (id,company_id,invoice_id,amount,currency,gateway_provider,payment_status) values ('${ids.gateway}','${ids.company}','${ids.invoice}',10,'ZAR','payfast','completed')`);
    await assert.rejects(reverse(db, ids.gateway));
    assert.equal((await db.query(`select payment_status from public.payments where id='${ids.gateway}'`)).rows[0].payment_status, "completed");
  } finally { await db.close(); }
});
