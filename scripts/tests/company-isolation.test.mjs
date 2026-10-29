import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

// Runs the actual migrations with deliberately overbroad legacy grants and
// policies. Isolated PostgreSQL engine: no .env or production writes.
let db, postgresAdmin, postgresConnection, testDatabase;
const postgresUrl = process.env.COMPANY_ISOLATION_TEST_DATABASE_URL;
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const a=id(1), b=id(2), staff=id(10), owner=id(11), other=id(12), platform=id(13), pending=id(14), admin=id(15);
const migrations=[
  '20261029120000_company_isolation_boundary.sql',
  '20261029130000_private_company_documents.sql',
  '20261029140000_company_rpc_and_view_boundaries.sql',
  '20261029150000_company_relationship_integrity.sql',
];
before(async()=>{
  if (postgresUrl) {
    const url = new URL(postgresUrl);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/company_isolation_fixture') {
      throw new Error('Company isolation tests require an isolated local database named company_isolation_fixture');
    }
    postgresAdmin = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
    await postgresAdmin.connect();
    testDatabase = `company_isolation_${process.pid}_${Date.now()}`;
    await postgresAdmin.query(`CREATE DATABASE ${testDatabase}`);
    url.pathname = `/${testDatabase}`;
    postgresConnection = new pg.Client({ connectionString: url.href });
    await postgresConnection.connect();
    db = { exec: sql => postgresConnection.query(sql), query: (sql, values) => postgresConnection.query(sql, values) };
  } else db = new PGlite();
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
    END $$;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE TABLE companies(id uuid PRIMARY KEY, company_name text);
    CREATE TABLE profiles(id uuid PRIMARY KEY, company_id uuid REFERENCES companies, role text DEFAULT 'client', active_role text, is_active boolean DEFAULT true, deleted_at timestamptz, region_id uuid, email text, full_name text);
    CREATE TABLE user_departments(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,user_id uuid REFERENCES profiles,department text);
    CREATE TABLE clients(id uuid PRIMARY KEY,company_id uuid REFERENCES companies,name text);
    CREATE TABLE orders(id uuid PRIMARY KEY,company_id uuid REFERENCES companies,client_id uuid REFERENCES clients,note text);
    CREATE TABLE menu_items(id uuid PRIMARY KEY,company_id uuid,name text);
    CREATE TABLE order_items(id uuid PRIMARY KEY,order_id uuid REFERENCES orders,menu_item_id uuid REFERENCES menu_items);
    CREATE TABLE email_templates(id uuid PRIMARY KEY,company_id uuid,body text);
    CREATE TABLE company_number_settings(company_id uuid,document_type text,prefix text,padding int,next_number int,include_year boolean DEFAULT false,resets_yearly boolean DEFAULT false,last_reset_year int,year_separator text DEFAULT '-',updated_at timestamptz,PRIMARY KEY(company_id,document_type));
    CREATE TABLE import_jobs(id uuid PRIMARY KEY,company_id uuid);
    CREATE TABLE import_rows(id uuid PRIMARY KEY,job_id uuid REFERENCES import_jobs);
    CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,bucket_id text,name text);
    INSERT INTO storage.buckets(id,public) VALUES('imports',true),('purchase-receipts',true),('equipment-damage-photos',true),('pod',true),('branding-logos',true);
    UPDATE storage.buckets SET allowed_mime_types=ARRAY['text/csv','application/vnd.ms-excel'] WHERE id='imports';
    CREATE FUNCTION mint_client_order_token(uuid,uuid,text DEFAULT null,integer DEFAULT 1440) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'secret'::text $$;
    CREATE FUNCTION mint_client_account_token(uuid,text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'secret'::text $$;
    CREATE FUNCTION dispatch_webhook(uuid,text,jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT $$;
    CREATE VIEW tenant_order_summary AS SELECT company_id,count(*) AS count FROM orders GROUP BY company_id;
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public,storage TO anon,authenticated,service_role;
  `);
  for(const table of ['profiles','companies','user_departments','clients','orders','menu_items','order_items','email_templates','company_number_settings','import_jobs','import_rows','storage.objects']) {
    await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; CREATE POLICY legacy_open ON ${table} FOR ALL TO anon, authenticated USING(true) WITH CHECK(true);`);
  }
  for(const file of migrations) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
});
after(async()=>{
  if (postgresConnection) await postgresConnection.end();
  else await db?.close();
  if (postgresAdmin) {
    if (/^company_isolation_\d+_\d+$/.test(testDatabase)) await postgresAdmin.query(`DROP DATABASE ${testDatabase}`);
    await postgresAdmin.end();
  }
});
async function as(user,role='authenticated') {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${user||''}',false); SELECT set_config('request.jwt.claim.role','${role}',false); SET ROLE ${role};`);
}
async function system() {await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false); SELECT set_config('request.jwt.claim.role','',false);`);}
const rows=async(sql,params=[])=>(await db.query(sql,params)).rows;
beforeEach(async()=>{
  await system();
  await db.exec(`TRUNCATE companies,profiles,user_departments,clients,orders,menu_items,order_items,email_templates,company_number_settings,import_jobs,import_rows,storage.objects CASCADE;
    INSERT INTO companies VALUES('${a}','A'),('${b}','B');
    INSERT INTO profiles(id,company_id,role,active_role) VALUES
      ('${staff}','${a}','kitchen_staff','kitchen_staff'),('${owner}','${a}','company_admin','company_admin'),
      ('${other}','${b}','company_admin','company_admin'),('${platform}',null,'super_admin','super_admin'),
      ('${pending}',null,'client','client'),('${admin}','${a}','admin','admin');
    INSERT INTO clients VALUES('${id(20)}','${a}','A client'),('${id(21)}','${b}','B client');
    INSERT INTO orders VALUES('${id(30)}','${a}','${id(20)}','A order'),('${id(31)}','${b}','${id(21)}','B order');
    INSERT INTO menu_items VALUES('${id(60)}','${a}','A menu item'),('${id(61)}','${b}','B menu item');
    INSERT INTO email_templates VALUES('${id(40)}',null,'shared'),('${id(41)}','${a}','private A'),('${id(42)}','${b}','private B');
    INSERT INTO import_jobs VALUES('${id(50)}','${a}'),('${id(51)}','${b}');
    INSERT INTO import_rows VALUES('${id(52)}','${id(50)}'),('${id(53)}','${id(51)}');
    INSERT INTO storage.objects(bucket_id,name) VALUES('imports','${a}/receipt.jpg'),('imports','${b}/receipt.jpg'),
      ('pod','orders/${id(30)}/photo.jpg'),('pod','orders/${id(31)}/photo.jpg');
  `);
});

test('restrictive boundary defeats broad legacy read policies for a company admin',async()=>{
  await as(owner);
  assert.deepEqual((await rows('SELECT company_id FROM orders')).map(r=>r.company_id),[a]);
  assert.deepEqual((await rows('SELECT id FROM companies')).map(r=>r.id),[a]);
  assert.equal((await rows('SELECT id FROM profiles WHERE company_id=$1',[b])).length,0);
});
test('anonymous callers cannot read company rows even with a legacy public grant',async()=>{
  await as(null,'anon'); assert.equal((await rows('SELECT * FROM orders')).length,0);
  assert.equal((await rows('SELECT * FROM profiles')).length,0);
  assert.equal((await rows('SELECT * FROM companies')).length,0);
});
test('own company CRUD works while foreign insert, update, delete and moving rows are denied',async()=>{
  await as(owner);
  await db.query('INSERT INTO orders VALUES($1,$2,$3,$4)',[id(33),a,id(20),'own']);
  await db.query('UPDATE orders SET note=$1 WHERE id=$2',['edited',id(33)]);
  assert.equal((await rows('SELECT note FROM orders WHERE id=$1',[id(33)]))[0].note,'edited');
  await assert.rejects(db.query('INSERT INTO orders VALUES($1,$2,$3,$4)',[id(34),b,id(21),'attack']),/row.level security/);
  assert.equal((await rows('UPDATE orders SET note=$1 WHERE id=$2 RETURNING id',['attack',id(31)])).length,0);
  assert.equal((await rows('DELETE FROM orders WHERE id=$1 RETURNING id',[id(31)])).length,0);
  await assert.rejects(db.query('UPDATE clients SET company_id=$1 WHERE id=$2',[b,id(20)]),/row.level security/);
  await db.query('DELETE FROM orders WHERE id=$1',[id(33)]);
});
test('inactive and deleted accounts lose company access',async()=>{
  await db.query('UPDATE profiles SET is_active=false WHERE id=$1',[staff]);
  await as(staff); assert.equal((await rows('SELECT * FROM orders')).length,0);
  await system(); await db.query('UPDATE profiles SET deleted_at=now() WHERE id=$1',[owner]);
  await as(owner); assert.equal((await rows('SELECT * FROM orders')).length,0);
});
test('pending accounts cannot adopt another company or use null membership to change roles',async()=>{
  await as(pending);
  await assert.rejects(db.query('UPDATE profiles SET company_id=$1 WHERE id=$2',[a,pending]),/membership/);
  await assert.rejects(db.query("UPDATE profiles SET role='super_admin' WHERE id=$1",[pending]),/Role assignment/);
});
test('staff cannot self promote by changing active_role, role, region, email or status',async()=>{
  await as(staff);
  for(const assignment of ["active_role='super_admin'","active_role='company_admin'","role='company_admin'",`region_id='${id(90)}'`,"email='other@example.test'","is_active=false"]) {
    await assert.rejects(db.exec(`UPDATE profiles SET ${assignment} WHERE id='${staff}'`));
  }
  await db.exec(`UPDATE profiles SET full_name='Own name' WHERE id='${staff}'`);
});
test('tenant admins cannot assign platform privileges through base roles or departments',async()=>{
  await as(owner);
  await assert.rejects(db.exec(`UPDATE profiles SET role='super_admin' WHERE id='${owner}'`),/Role assignment/);
  await assert.rejects(db.exec(`INSERT INTO user_departments(user_id,department) VALUES('${owner}','super_admin')`),/Role assignment/);
  await as(admin);
  await assert.rejects(db.exec(`UPDATE profiles SET role='company_admin' WHERE id='${admin}'`),/Role assignment/);
  await assert.rejects(db.exec(`INSERT INTO user_departments(user_id,department) VALUES('${admin}','owner')`),/Role assignment/);
});
test('legacy self-write department policy cannot grant staff an administrator role',async()=>{
  await as(staff);
  await assert.rejects(db.exec(`INSERT INTO user_departments(user_id,department) VALUES('${staff}','admin')`),/require an administrator/);
});
test('assigned operational roles can be selected; foreign assignments cannot be read or reparented',async()=>{
  await db.exec(`INSERT INTO user_departments(user_id,department) VALUES('${staff}','driver'),('${other}','driver')`);
  await as(staff);
  await db.exec(`UPDATE profiles SET active_role='driver' WHERE id='${staff}'`);
  assert.equal((await rows('SELECT * FROM user_departments')).length,1);
  await as(owner);
  await assert.rejects(db.exec(`UPDATE user_departments SET user_id='${other}' WHERE user_id='${staff}'`),/row.level security/);
});
test('global templates remain readable but a company cannot change or delete shared or foreign templates',async()=>{
  await as(owner); assert.equal((await rows('SELECT * FROM email_templates')).length,2);
  assert.equal((await rows('DELETE FROM email_templates WHERE company_id IS NULL RETURNING id')).length,0);
  await assert.rejects(db.exec(`INSERT INTO email_templates VALUES('${id(43)}',null,'injected')`),/row.level security/);
});
test('platform access requires the canonical super admin role',async()=>{
  await db.exec(`UPDATE profiles SET active_role='super_admin' WHERE id='${owner}'`);
  await as(owner); assert.equal((await rows('SELECT * FROM orders')).length,1);
  await as(platform); assert.equal((await rows('SELECT * FROM orders')).length,2);
  await as(null,'service_role'); assert.equal((await rows('SELECT * FROM orders')).length,2);
});
test('child rows inherit their parent company boundary',async()=>{
  await as(owner); assert.equal((await rows('SELECT * FROM import_rows')).length,1);
  await assert.rejects(db.exec(`INSERT INTO import_rows VALUES('${id(54)}','${id(51)}')`),/row.level security/);
});
test('stored business links cannot join a client from another company, including service writes',async()=>{
  await as(owner);
  await assert.rejects(db.exec(`INSERT INTO orders VALUES('${id(32)}','${a}','${id(21)}','attack')`),/same company/);
  await as(null,'service_role');
  await assert.rejects(db.exec(`UPDATE orders SET client_id='${id(21)}' WHERE id='${id(30)}'`),/same company/);
});
test('line items cannot attach another company catalogue or move to another company order',async()=>{
  await as(owner);
  await db.exec(`INSERT INTO order_items VALUES('${id(62)}','${id(30)}','${id(60)}')`);
  await assert.rejects(db.exec(`INSERT INTO order_items VALUES('${id(63)}','${id(30)}','${id(61)}')`),/same company/);
  await assert.rejects(db.exec(`UPDATE order_items SET menu_item_id='${id(61)}' WHERE id='${id(62)}'`),/same company/);
  await as(null,'service_role');
  await assert.rejects(db.exec(`UPDATE order_items SET order_id='${id(31)}' WHERE id='${id(62)}'`),/same company/);
});
test('numbering RPC checks membership before advancing another company counter',async()=>{
  await as(owner);
  assert.equal((await rows('SELECT consume_next_document_number($1,$2) n',[a,'order']))[0].n,'ORD-000001');
  await assert.rejects(db.query('SELECT consume_next_document_number($1,$2)',[b,'order']),/Company access denied/);
  await assert.rejects(db.query('SELECT bump_number_settings_on_insert($1,$2,$3)',['order','ORD-999999',b]),/Company access denied/);
  await as(null,'anon'); await assert.rejects(db.query('SELECT consume_next_document_number($1,$2)',[b,'order']),/permission denied/);
});
test('token mint RPCs are service only even with default PUBLIC execution grants',async()=>{
  await as(owner);
  await assert.rejects(db.query('SELECT mint_client_order_token($1,$2)',[b,id(31)]),/permission denied/);
  await as(null,'anon'); await assert.rejects(db.query('SELECT mint_client_account_token($1,$2)',[b,'client@example.test']),/permission denied/);
  await as(null,'service_role'); assert.equal((await rows('SELECT mint_client_order_token($1,$2) token',[a,id(30)]))[0].token,'secret');
});
test('analytics view uses caller RLS rather than the view owner permissions',async()=>{
  await as(owner); assert.deepEqual((await rows('SELECT company_id FROM tenant_order_summary')).map(r=>r.company_id),[a]);
  await as(null,'anon'); assert.equal((await rows('SELECT * FROM tenant_order_summary')).length,0);
});
test('private buckets and restrictive storage policies cover reads and writes',async()=>{
  assert.equal((await rows("SELECT * FROM storage.buckets WHERE public AND id <> 'branding-logos'")).length,0);
  await as(owner); assert.equal((await rows('SELECT * FROM storage.objects')).length,2);
  await assert.rejects(db.exec(`INSERT INTO storage.objects(bucket_id,name) VALUES('imports','${b}/attack.jpg')`),/row.level security/);
  await assert.rejects(db.exec(`UPDATE storage.objects SET name='${b}/attack.jpg' WHERE name='${a}/receipt.jpg'`),/row.level security/);
  await assert.rejects(db.exec(`INSERT INTO storage.objects(bucket_id,name) VALUES('pod','orders/${id(31)}/attack.jpg')`),/row.level security/);
  await as(null,'anon'); assert.equal((await rows('SELECT * FROM storage.objects')).length,0);
});
test('security migrations are idempotent',async()=>{
  for(const file of migrations) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
});
test('private receipt storage retains spreadsheet imports and accepts scanner images',async()=>{
  const bucket=(await rows("SELECT allowed_mime_types FROM storage.buckets WHERE id='imports'"))[0];
  for(const mime of ['text/csv','application/vnd.ms-excel','image/jpeg','image/png','image/webp','application/pdf']) {
    assert.ok(bucket.allowed_mime_types.includes(mime),mime);
  }
});
test('manual SQL bundle applies successfully and can be repeated',async()=>{
  const bundle=fs.readFileSync('LOCAL_COMPANY_SECURITY_MIGRATIONS.sql','utf8');
  await db.exec(bundle);
  await db.exec(bundle);
  const verification=await rows(fs.readFileSync('supabase/verification/company_isolation.sql','utf8'));
  assert.equal(verification.length,14);
  for(const check of verification) assert.equal(check.passed,true,check.check_name);
  await as(owner);
  assert.deepEqual((await rows('SELECT company_id FROM orders')).map(row=>row.company_id),[a]);
  assert.equal((await rows('SELECT * FROM storage.objects')).length,2);
});
test('manual SQL bundle rolls back earlier changes if a late statement fails',async()=>{
  await db.exec("UPDATE storage.buckets SET public=true WHERE id='imports'");
  const bundle=fs.readFileSync('LOCAL_COMPANY_SECURITY_MIGRATIONS.sql','utf8');
  const broken=bundle.replace(/^COMMIT;$/m,'SELECT 1 / 0;\nCOMMIT;');
  assert.notEqual(broken,bundle);
  try {
    await assert.rejects(db.exec(broken),/division by zero/);
    await db.exec('ROLLBACK;');
    assert.equal((await rows("SELECT public FROM storage.buckets WHERE id='imports'"))[0].public,true);
  } finally {
    await db.exec('ROLLBACK;');
    await db.exec("UPDATE storage.buckets SET public=false WHERE id='imports'");
  }
});
const applicationViewMigration=()=>{
  const source=fs.readFileSync('supabase/migrations/20261029140000_company_rpc_and_view_boundaries.sql','utf8');
  const start=source.indexOf('-- Company aggregate views');
  assert.ok(start>=0);
  return source.slice(start).replace(/^COMMIT;\s*$/m,'');
};
async function ensureViewFixtureRoles() {
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='company_view_migration_operator') THEN CREATE ROLE company_view_migration_operator NOLOGIN NOSUPERUSER; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='company_view_extension_owner') THEN CREATE ROLE company_view_extension_owner NOLOGIN NOSUPERUSER; END IF;
    END $$;`);
}
test('view migration skips extension members with a different owner and protects ordinary application views',async()=>{
  await ensureViewFixtureRoles();
  await db.exec(`
    CREATE VIEW geography_columns AS SELECT 'synthetic extension metadata'::text AS name;
    ALTER EXTENSION plpgsql ADD VIEW geography_columns;
    ALTER VIEW geography_columns OWNER TO company_view_extension_owner;
    CREATE VIEW geometry_columns AS SELECT company_id FROM orders;
    ALTER VIEW geometry_columns OWNER TO company_view_migration_operator;
    ALTER VIEW tenant_order_summary OWNER TO company_view_migration_operator;
    ALTER VIEW tenant_order_summary SET (security_invoker=false);
    SET ROLE company_view_migration_operator;
  `);
  try {
    // Reproduce the reported error without requiring PostGIS in the fixture:
    // a genuinely extension-owned view cannot be altered by this operator.
    await assert.rejects(db.exec('ALTER VIEW public.geography_columns SET (security_invoker=true)'),/must be owner of view/);
    await db.exec(applicationViewMigration());
    await system();
    const options=await rows(`SELECT relname,COALESCE(reloptions @> ARRAY['security_invoker=true'],false) AS invoker
      FROM pg_class WHERE oid IN ('public.geography_columns'::regclass,'public.geometry_columns'::regclass,'public.tenant_order_summary'::regclass)`);
    assert.equal(options.find(view=>view.relname==='geography_columns').invoker,false);
    // A spatial-looking name alone is not an exemption.
    assert.equal(options.find(view=>view.relname==='geometry_columns').invoker,true);
    assert.equal(options.find(view=>view.relname==='tenant_order_summary').invoker,true);
    await db.exec(fs.readFileSync('LOCAL_COMPANY_SECURITY_MIGRATIONS.sql','utf8'));
    const verification=await rows(fs.readFileSync('supabase/verification/company_isolation.sql','utf8'));
    for(const check of verification) assert.equal(check.passed,true,check.check_name);
    assert.equal((await rows("SELECT COALESCE(reloptions @> ARRAY['security_invoker=true'],false) AS invoker FROM pg_class WHERE oid='public.geography_columns'::regclass"))[0].invoker,false);
  } finally {
    await system();
    await db.exec('ALTER EXTENSION plpgsql DROP VIEW geography_columns; DROP VIEW geography_columns; DROP VIEW geometry_columns;');
  }
});
test('view migration does not silently skip application views with ownership errors',async()=>{
  await ensureViewFixtureRoles();
  await db.exec(`CREATE VIEW application_unowned_summary AS SELECT company_id FROM orders;
    ALTER VIEW application_unowned_summary OWNER TO company_view_extension_owner;
    SET ROLE company_view_migration_operator;`);
  try {
    await assert.rejects(db.exec(applicationViewMigration()),/must be owner of view/);
  } finally {
    await system();
    await db.exec('DROP VIEW application_unowned_summary');
  }
});
