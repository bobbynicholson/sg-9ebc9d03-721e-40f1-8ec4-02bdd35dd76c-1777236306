import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const company=id(1),other=id(2),actor=id(3),region=id(4),job=id(5),doc=id(6);
const fields={client_name:'Jane Person',client_company_name:'Test Company',client_email:'jane@example.com',event_name:'Lunch',event_date:'2099-11-05',event_time:'12:00',guest_count:'10',venue_address:'Test venue',subtotal:'500',tax_amount:'75',total_amount:'575',reference:'OLD-42',currency:'ZAR'};
const review=()=>({fields:{...fields},region_id:region,mode:'draft',reviewed:true,items:[{kind:'menu',name:'Chicken',description:'Original chicken dish',quantity:10,unit_price:50,line_total:500,prep_time_minutes:null,cook_time_minutes:null}]});
const commit=(r=review(),c=company,v=0)=>db.query('SELECT commit_booking_document_import($1,$2,$3,$4,$5,$6) AS result',[doc,c,actor,v,JSON.stringify(r),'[]']);
before(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role' $$;
 CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TYPE order_status AS ENUM('draft','pending','confirmed','preparing','ready','in_transit','delivered','completed','cancelled','postponed','paused');
 CREATE TABLE companies(id uuid PRIMARY KEY,currency text DEFAULT 'ZAR',pricing_includes_vat boolean DEFAULT false); CREATE TABLE profiles(id uuid PRIMARY KEY,company_id uuid,role text,active_role text); CREATE TABLE regions(id uuid PRIMARY KEY,company_id uuid);
 CREATE TABLE import_jobs(id uuid PRIMARY KEY,company_id uuid,status text,summary jsonb,updated_at timestamptz,comms_enabled_at timestamptz);
 CREATE TABLE clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,region_id uuid,client_name text,company_name text,client_type text,email text,phone text,mobile_number text,import_job_id uuid,imported_at timestamptz,imported_filename text,comms_paused_until timestamptz,deleted_at timestamptz);
 CREATE TABLE menu_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,item_name text,description text,category text,base_price numeric,base_servings integer,prep_time_minutes integer,cook_time_minutes integer,active boolean,is_available boolean,created_at timestamptz DEFAULT now(),deleted_at timestamptz);
 CREATE TABLE equipment(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,name text,description text,category text,rental_price numeric,quantity integer,available_quantity integer,requires_cleaning boolean,cleaning_time_manual_minutes integer,created_at timestamptz DEFAULT now(),deleted_at timestamptz);
 CREATE TABLE inventory_items(id uuid PRIMARY KEY,company_id uuid);
 CREATE TABLE recipes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,menu_item_id uuid,base_servings numeric); CREATE TABLE recipe_ingredients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipe_id uuid,quantity numeric,unit text,inventory_item_id uuid);
 CREATE TABLE order_items(order_id uuid,menu_item_id uuid,item_name text,description text,quantity numeric,unit_price numeric,line_total numeric); CREATE TABLE equipment_bookings(company_id uuid,order_id uuid,equipment_id uuid,quantity integer,booked_from date,booked_until date,status text);
 CREATE TABLE kitchen_prep_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid,status text); CREATE TABLE driver_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid,status text);
 CREATE SEQUENCE document_counter; CREATE FUNCTION consume_next_document_number(uuid,text) RETURNS text LANGUAGE sql AS $$ SELECT $2||'-'||nextval('document_counter')::text $$;
 `);
 // Build document snapshots from the application's actual schema, adding columns
 // introduced after its generated types. Defaults are deliberately not invented by the RPC.
 const types=await readFile('src/integrations/supabase/types.ts','utf8');
 for(const table of ['quotes','orders']){
  const part=types.split(`      ${table}: {`)[1].split('        Insert:')[0];
  const cols=[];
  for(const match of part.matchAll(/^          (\w+): (.+)$/gm)){
   const [,key,type]=match;
   let sql=key==='id'?'uuid PRIMARY KEY DEFAULT gen_random_uuid()':key==='status'?(table==='orders'?"order_status DEFAULT 'pending'":"text DEFAULT 'draft'"):key.endsWith('_id')?'uuid':/Json/.test(type)?'jsonb':/boolean/.test(type)?'boolean':/number/.test(type)?'numeric':key.endsWith('_at')||key==='comms_paused_until'?'timestamptz':key.endsWith('_date')||key==='event_date'||key==='valid_until'?'date':key.endsWith('_time')?'time':'text';
   cols.push(`${key} ${sql}`);
  }
  cols.push('collection_fee numeric');
  await db.exec(`CREATE TABLE ${table}(${cols.join(',')})`);
 }
 await db.exec(`ALTER TABLE quotes ADD CONSTRAINT quotes_draft_implies_no_conversion CHECK(status <> 'draft' OR converted_to_order_id IS NULL);
 CREATE FUNCTION tg_stamp_quote_converted_to_order_id() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.quote_id IS NOT NULL THEN UPDATE quotes SET converted_to_order_id=NEW.id WHERE id=NEW.quote_id AND converted_to_order_id IS NULL; END IF; RETURN NEW; END $$;
 CREATE TRIGGER trg_orders_stamp_quote_link AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION tg_stamp_quote_converted_to_order_id();`);
 await db.exec(await readFile('supabase/migrations/20261022190000_booking_pdf_imports.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261023010000_booking_pdf_import_source_attribution.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261023020000_imported_booking_catalogue_readiness.sql','utf8'));
});
after(()=>db.close());
beforeEach(async()=>{
 await db.exec('TRUNCATE companies,profiles,regions,import_jobs,document_import_files,clients,quotes,orders,menu_items,equipment,order_items,equipment_bookings,recipes,recipe_ingredients,kitchen_prep_tasks,driver_assignments CASCADE');
 await db.query('INSERT INTO companies(id) VALUES($1),($2)',[company,other]);
 await db.query("INSERT INTO profiles(id,company_id,role) VALUES($1,$2,'owner')",[actor,company]);
 await db.query('INSERT INTO regions VALUES($1,$2)',[region,company]);
 await db.query("INSERT INTO import_jobs(id,company_id,status,summary) VALUES($1,$2,'uploaded','{\"document_import\":true}')",[job,company]);
 await db.query("INSERT INTO document_import_files(id,job_id,company_id,target_table,filename,storage_path,size_bytes,source_hash,status,extraction) VALUES($1,$2,$3,'quotes','test.pdf','private/test.pdf',100,$4,'review','{}')",[doc,job,company,'a'.repeat(64)]);
});
test('quote, reusable menu item and person/company identity commit together; no order or payment is invented',async()=>{
 const result=(await commit()).rows[0].result;
 const q=(await db.query('SELECT * FROM quotes')).rows[0];
 assert.equal(q.id,result.targetId);assert.equal(q.client_name,'Jane Person');assert.equal(q.client_company_name,'Test Company');assert.equal(q.status,'draft');assert.equal(q.total_amount,'575');assert.equal(q.menu_items[0].quantity,10);
 assert.equal((await db.query('SELECT * FROM menu_items')).rows.length,1);assert.equal((await db.query('SELECT * FROM orders')).rows.length,0);
});
test('retries return the first record and do not duplicate catalogue items',async()=>{
 const first=(await commit()).rows[0].result;const again=(await commit()).rows[0].result;
 assert.equal(again.targetId,first.targetId);assert.equal(again.alreadySaved,true);assert.equal((await db.query('SELECT * FROM quotes')).rows.length,1);
});
test('bad item prices roll back customer, catalogue and document writes',async()=>{
 const r=review();r.items.push({...r.items[0],name:'Bad',line_total:1});
 await assert.rejects(commit(r),/Invalid item/);assert.equal((await db.query('SELECT * FROM clients')).rows.length,0);assert.equal((await db.query('SELECT * FROM menu_items')).rows.length,0);
});
test('cross-tenant catalogue links are rejected atomically',async()=>{
 await db.query("INSERT INTO menu_items(id,company_id,item_name,base_price) VALUES($1,$2,'Other tenant',1)",[id(9),other]);
 const r=review();r.items[0].catalogue_id=id(9);await assert.rejects(commit(r),/another company/);assert.equal((await db.query('SELECT * FROM clients')).rows.length,0);
});
test('existing catalogue prices and contacts are preserved; canonical name carries into operations',async()=>{
 await db.query("INSERT INTO menu_items(id,company_id,item_name,base_price) VALUES($1,$2,'Canonical chicken',99)",[id(9),company]);
 const r=review();r.items[0].catalogue_id=id(9);await commit(r);
 assert.equal((await db.query('SELECT base_price FROM menu_items')).rows[0].base_price,'99');assert.equal((await db.query('SELECT menu_items FROM quotes')).rows[0].menu_items[0].name,'Canonical chicken');
});
test('an order creates one linked quote, real line items and equipment bookings, with physical stock supplied separately',async()=>{
 await db.exec("UPDATE document_import_files SET target_table='orders'");
 const r=review();r.items=[{kind:'equipment',name:'Plate',quantity:10,unit_price:50,line_total:500,owned_quantity:20,requires_cleaning:true,cleaning_minutes:2}];r.fields.equipment_return_method='driver_next_day';
 const result=(await commit(r)).rows[0].result;const o=(await db.query('SELECT * FROM orders')).rows[0];
 assert.equal(o.id,result.targetId);assert.equal(o.status,'pending');assert.equal((await db.query('SELECT converted_to_order_id FROM quotes')).rows[0].converted_to_order_id,o.id);
 assert.equal((await db.query('SELECT quantity FROM equipment')).rows[0].quantity,20);assert.equal((await db.query('SELECT quantity FROM equipment_bookings')).rows[0].quantity,10);
});
test('missing recipes create a live readiness block on quote sending and later orders reusing the item',async()=>{
 await commit();const q=(await db.query('SELECT id FROM quotes')).rows[0].id;
 await assert.rejects(db.query("UPDATE quotes SET status='sent' WHERE id=$1",[q]),/Complete imported details/);
 const item=(await db.query('SELECT id FROM menu_items')).rows[0].id;
 const gaps=(await db.query('SELECT booking_import_gaps($1,NULL,NULL,$2,false) AS gaps',[company,[item]])).rows[0].gaps;
 assert.equal(gaps[0].kind,'menu');assert.match(gaps[0].href,/menu\?item=/);
});
test('finishing real recipes and explicit setup clears the block; static dismissal alone does not',async()=>{
 await commit();const q=(await db.query('SELECT id FROM quotes')).rows[0].id;const item=(await db.query('SELECT id FROM menu_items')).rows[0].id;
 await db.exec("UPDATE document_import_files SET setup_completed_at=now()");
 await assert.rejects(db.query("UPDATE quotes SET status='sent' WHERE id=$1",[q]),/Complete imported details/);
 await db.query('UPDATE menu_items SET prep_time_minutes=10,cook_time_minutes=20 WHERE id=$1',[item]);
 await db.query('INSERT INTO recipes(id,company_id,menu_item_id,base_servings) VALUES($1,$2,$3,1)',[id(10),company,item]);
 await db.query("INSERT INTO inventory_items VALUES($1,$2)",[id(11),company]);
 await db.query("INSERT INTO recipe_ingredients(recipe_id,quantity,unit,inventory_item_id) VALUES($1,1,'kg',$2)",[id(10),id(11)]);
 await db.query("UPDATE quotes SET status='sent' WHERE id=$1",[q]);
 assert.equal((await db.query('SELECT status FROM quotes')).rows[0].status,'sent');
});
test('kitchen and driver work cannot start on incomplete imported orders',async()=>{
 await db.exec("UPDATE document_import_files SET target_table='orders'");await commit();const o=(await db.query('SELECT id FROM orders')).rows[0].id;
 await assert.rejects(db.query("INSERT INTO kitchen_prep_tasks(order_id,status) VALUES($1,'in_progress')",[o]),/Complete imported details/);
 await assert.rejects(db.query("INSERT INTO driver_assignments(order_id,status) VALUES($1,'en_route')",[o]),/Complete imported details/);
 await assert.rejects(db.query("UPDATE orders SET status='confirmed' WHERE id=$1",[o]),/Complete imported details/);
});
test('historical import stays completed and creates no production tasks',async()=>{
 await db.exec("UPDATE document_import_files SET target_table='orders'");const r=review();r.mode='historical';await commit(r);
 assert.equal((await db.query('SELECT status FROM orders')).rows[0].status,'completed');assert.equal((await db.query('SELECT * FROM kitchen_prep_tasks')).rows.length,0);
});
test('foreign tenant and stale version cannot create anything',async()=>{
 await assert.rejects(commit(review(),other),/Document not found/);await assert.rejects(commit(review(),company,99),/Document changed/);
 assert.equal((await db.query('SELECT * FROM quotes')).rows.length,0);
});
test('matched legacy dishes are checked for this import, while services and unrelated bookings stay unaffected',async()=>{
 await db.query("INSERT INTO menu_items(id,company_id,item_name,base_price,category) VALUES($1,$3,'Existing dish',25,'Main'),($2,$3,'Waiter',250,'Staff')",[id(9),id(12),company]);
 const r=review();r.items=[{kind:'menu',catalogue_id:id(9),name:'Existing dish',quantity:10,unit_price:25,line_total:250},{kind:'service',catalogue_id:id(12),name:'Waiter',quantity:1,unit_price:250,line_total:250}];
 await commit(r);const q=(await db.query('SELECT id FROM quotes')).rows[0].id;
 await db.exec('UPDATE document_import_files SET setup_completed_at=now()');
 const gaps=(await db.query('SELECT booking_import_gaps($1,$2,NULL,NULL,false) AS gaps',[company,q])).rows[0].gaps;
 assert.equal(gaps.length,1);assert.match(gaps[0].message,/Existing dish/);
 const unrelated=(await db.query('SELECT booking_import_gaps($1,NULL,NULL,$2,false) AS gaps',[company,[id(9)]])).rows[0].gaps;
 assert.deepEqual(unrelated,[]);
 await assert.rejects(db.query("UPDATE quotes SET status='sent' WHERE id=$1",[q]),/Complete imported details/);
});

test('private source storage and read-only table policies are installed',async()=>{
 assert.equal((await db.query("SELECT public FROM storage.buckets WHERE id='booking-imports'")).rows[0].public,false);
 const policies=(await db.query("SELECT cmd FROM pg_policies WHERE tablename='document_import_files'")).rows;assert.deepEqual(policies.map(p=>p.cmd),['SELECT']);
 const grants=(await db.query("SELECT has_function_privilege('authenticated','commit_booking_document_import(uuid,uuid,uuid,integer,jsonb,jsonb)','EXECUTE') AS allowed")).rows[0];assert.equal(grants.allowed,false);
});
