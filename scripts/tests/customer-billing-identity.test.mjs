import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const c=id(1), other=id(2), client=id(3), lead=id(4), quote=id(5), order=id(6), invoice=id(7);
before(async()=>{
  await db.exec(`CREATE TABLE clients(id uuid PRIMARY KEY,company_id uuid,client_name text,email text,deleted_at timestamptz);
    CREATE TABLE leads(id uuid PRIMARY KEY,company_id uuid,converted_to_client_id uuid,contact_name text,client_name text,company_name text,updated_at timestamptz,deleted_at timestamptz);
    CREATE TABLE quotes(id uuid PRIMARY KEY,company_id uuid,client_id uuid,lead_id uuid,client_name text,client_email text,contact_name text,updated_at timestamptz,deleted_at timestamptz);
    CREATE TABLE orders(id uuid PRIMARY KEY,company_id uuid,client_id uuid,quote_id uuid,client_name text,updated_at timestamptz,deleted_at timestamptz);
    CREATE TABLE invoices(id uuid PRIMARY KEY,company_id uuid,client_id uuid,order_id uuid,invoice_data jsonb,total_amount numeric DEFAULT 100,amount_paid numeric DEFAULT 50,status text DEFAULT 'partial',updated_at timestamptz,deleted_at timestamptz);`);
  await db.exec(await readFile('supabase/migrations/20261022110000_customer_billing_identity.sql','utf8'));
});
beforeEach(async()=>{
  await db.exec(await readFile('supabase/migrations/20261022123000_customer_identity_document_defaults.sql','utf8'));
  await db.exec('TRUNCATE clients,leads,quotes,orders,invoices');
  await db.query("INSERT INTO clients(id,company_id,client_name,company_name) VALUES($1,$2,'Sheri Lee Pan','Example Events (Pty) Ltd')",[client,c]);
  await db.query("INSERT INTO leads(id,company_id,contact_name,client_name,company_name,converted_to_client_id) VALUES($1,$2,'Sheri Lee Pan','Sheri Lee Pan','Example Events (Pty) Ltd',$3)",[lead,c,client]);
});
test('a quote deliberately billed to the person stays individual on conversion',async()=>{
  await addQuote(); await db.exec('UPDATE quotes SET client_company_name=NULL');
  await db.query("INSERT INTO orders(id,company_id,client_id,quote_id,client_name) VALUES($1,$2,$3,$4,'Sheri Lee Pan')",[order,c,client,quote]);
  assert.equal((await one('orders')).client_company_name,null);
  await db.query('INSERT INTO invoices(id,company_id,client_id,order_id) VALUES($1,$2,$3,$4)',[invoice,c,client,order]);
  assert.equal((await one('invoices')).invoice_data.clientCompanyName,null);
  assert.equal((await one('invoices')).invoice_data.clientName,'Sheri Lee Pan');
});
test('balance invoices inherit the booking company even without an application snapshot',async()=>{
  await addQuote();await db.query("INSERT INTO orders(id,company_id,client_id,quote_id,client_name) VALUES($1,$2,$3,$4,'Sheri Lee Pan')",[order,c,client,quote]);
  await db.query('INSERT INTO invoices(id,company_id,client_id,order_id) VALUES($1,$2,$3,$4)',[invoice,c,client,order]);
  assert.equal((await one('invoices')).invoice_data.clientCompanyName,'Example Events (Pty) Ltd');
});
test('renaming the contact default preserves a subsidiary billing name on the order and invoice',async()=>{
  await addQuote();await db.exec("UPDATE quotes SET client_company_name='Subsidiary Ltd'");
  await db.query("INSERT INTO orders(id,company_id,client_id,quote_id,client_name) VALUES($1,$2,$3,$4,'Sheri Lee Pan')",[order,c,client,quote]);
  await db.query('INSERT INTO invoices(id,company_id,client_id,order_id) VALUES($1,$2,$3,$4)',[invoice,c,client,order]);
  await db.query("UPDATE clients SET company_name='Parent renamed Ltd' WHERE id=$1",[client]);
  assert.equal((await one('orders')).client_company_name,'Subsidiary Ltd');
  assert.equal((await one('invoices')).invoice_data.clientCompanyName,'Subsidiary Ltd');
});
test('a manual invoice keeps its explicit billing organisation on insert',async()=>{
  await db.query('INSERT INTO invoices(id,company_id,client_id,invoice_data) VALUES($1,$2,$3,$4)',[invoice,c,client,JSON.stringify({clientCompanyName:'Manual subsidiary Ltd'})]);
  assert.equal((await one('invoices')).invoice_data.clientCompanyName,'Manual subsidiary Ltd');
  assert.equal((await one('invoices')).invoice_data.clientName,'Sheri Lee Pan');
});
test('a repeat customer enquiry links to the saved company by tenant and email before acceptance',async()=>{
  await db.query("UPDATE clients SET email='Sheri@example.com' WHERE id=$1",[client]);
  await db.query("INSERT INTO quotes(id,company_id,client_email,client_name) VALUES($1,$2,' sheri@example.com ','Sheri Lee Pan')",[quote,c]);
  const q=await one('quotes');assert.equal(q.client_id,client);assert.equal(q.client_company_name,'Example Events (Pty) Ltd');
});
test('repeat-customer matching never links another tenant by email',async()=>{
  await db.query("UPDATE clients SET email='sheri@example.com' WHERE id=$1",[client]);
  await db.query("INSERT INTO quotes(id,company_id,client_email,client_name) VALUES($1,$2,'sheri@example.com','Sheri Lee Pan')",[quote,other]);
  const q=await one('quotes');assert.equal(q.client_id,null);assert.equal(q.client_company_name,null);
});
after(()=>db.close());
const one=async table=>(await db.query(`SELECT * FROM ${table} LIMIT 1`)).rows[0];
const addQuote=async(company=c,customer=client)=>db.query("INSERT INTO quotes(id,company_id,client_id,lead_id,client_name) VALUES($1,$2,$3,$4,'Sheri Lee Pan')",[quote,company,customer,lead]);
test('quote inherits company from lead before client promotion',async()=>{await addQuote(c,null);assert.equal((await one('quotes')).client_company_name,'Example Events (Pty) Ltd');assert.equal((await one('quotes')).client_name,'Sheri Lee Pan');});
test('quote, order and balance booking inherit billing identity without changing greeting name',async()=>{await addQuote();await db.query("INSERT INTO orders(id,company_id,client_id,quote_id,client_name) VALUES($1,$2,$3,$4,'Sheri Lee Pan')",[order,c,client,quote]);assert.equal((await one('orders')).client_company_name,'Example Events (Pty) Ltd');assert.equal((await one('orders')).client_name,'Sheri Lee Pan');});
test('foreign tenant links never inherit identity',async()=>{await addQuote(other);assert.equal((await one('quotes')).client_company_name,null);});
test('explicit quote billing override survives contact edits',async()=>{await addQuote();await db.query("UPDATE quotes SET client_company_name='Separate subsidiary'");await db.query("UPDATE clients SET company_name='Renamed Events' WHERE id=$1",[client]);assert.equal((await one('quotes')).client_company_name,'Separate subsidiary');});
test('contact edits update linked defaults, preserve payments, and never cross tenant boundary',async()=>{
  await addQuote();await db.query("INSERT INTO orders(id,company_id,client_id,client_name) VALUES($1,$2,$3,'Sheri Lee Pan')",[order,c,client]);
  await db.query("INSERT INTO invoices(id,company_id,client_id,invoice_data) VALUES($1,$2,$3,$4)",[invoice,c,client,JSON.stringify({clientName:'Sheri Lee Pan',items:[{name:'Meal'}]})]);
  await db.query("INSERT INTO quotes(id,company_id,client_id,client_name,client_company_name) VALUES($1,$2,$3,'Foreign contact','Foreign company')",[id(9),other,client]);
  await db.query("UPDATE clients SET client_name='Sheri Pan',company_name='New Company' WHERE id=$1",[client]);
  assert.equal((await one('orders')).client_name,'Sheri Pan');assert.equal((await one('orders')).client_company_name,'New Company');
  const inv=await one('invoices');assert.equal(inv.invoice_data.clientName,'Sheri Pan');assert.equal(inv.invoice_data.clientCompanyName,'New Company');assert.deepEqual(inv.invoice_data.items,[{name:'Meal'}]);assert.equal(inv.total_amount,'100');assert.equal(inv.amount_paid,'50');assert.equal(inv.status,'partial');
  const foreign=(await db.query('SELECT * FROM quotes WHERE company_id=$1',[other])).rows[0];assert.equal(foreign.client_name,'Foreign contact');assert.equal(foreign.client_company_name,'Foreign company');
});
test('individual remains the bill-to and clearing a company restores individual billing',async()=>{await addQuote();await db.query('UPDATE clients SET company_name=NULL WHERE id=$1',[client]);assert.equal((await one('quotes')).client_company_name,null);assert.equal((await one('quotes')).client_name,'Sheri Lee Pan');});
test('explicit clearing on quote does not immediately re-inherit company',async()=>{await addQuote();await db.exec('UPDATE quotes SET client_company_name=NULL');assert.equal((await one('quotes')).client_company_name,null);});
test('separate contact names on a quote are retained',async()=>{await addQuote();await db.exec("UPDATE quotes SET client_name='Other employee',contact_name='Other employee'");await db.query("UPDATE clients SET client_name='Sheri Pan' WHERE id=$1",[client]);assert.equal((await one('quotes')).client_name,'Other employee');});
test('company is trimmed on inherited order documents',async()=>{await db.query("UPDATE clients SET company_name='  Example Ltd  ' WHERE id=$1",[client]);await addQuote();assert.equal((await one('quotes')).client_company_name,'Example Ltd');});
test('migration backfills explicit lead organisations and is safe to apply again',async()=>{
  await db.query("INSERT INTO clients(id,company_id,client_name) VALUES($1,$2,'Legacy contact')",[id(20),c]);
  await db.query("INSERT INTO leads(id,company_id,converted_to_client_id,company_name) VALUES($1,$2,$3,'Legacy organisation')",[id(21),c,id(20)]);
  await db.exec('ALTER TABLE quotes DISABLE TRIGGER fill_quote_billing_identity; ALTER TABLE orders DISABLE TRIGGER fill_order_billing_identity');
  await db.query('INSERT INTO quotes(id,company_id,client_id,lead_id) VALUES($1,$2,$3,$4)',[quote,c,id(20),id(21)]);
  await db.query('INSERT INTO orders(id,company_id,client_id,quote_id) VALUES($1,$2,$3,$4)',[order,c,id(20),quote]);
  await db.exec(await readFile('supabase/migrations/20261022110000_customer_billing_identity.sql','utf8'));
  assert.equal((await one('quotes')).client_company_name,'Legacy organisation');
  assert.equal((await one('orders')).client_company_name,'Legacy organisation');
  await db.exec(await readFile('supabase/migrations/20261022110000_customer_billing_identity.sql','utf8'));
  assert.equal((await one('orders')).client_company_name,'Legacy organisation');
});
