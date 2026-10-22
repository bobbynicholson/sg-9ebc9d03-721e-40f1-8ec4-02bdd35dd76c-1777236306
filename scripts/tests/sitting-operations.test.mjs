import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const company=id(1), tenant=id(2), quote=id(3), order=id(4), request=id(5), d1=id(6), d2=id(7), d3=id(8);
const plan=[{guestCount:50,serviceTime:'12:00'},{guestCount:50,serviceTime:'18:00'}];
const saveQuote=(p=plan,patch={},requestId=null,c=company)=>db.query('SELECT save_admin_quote_service_plan($1,$2,$3,$4,$5)',[quote,c,JSON.stringify(p),JSON.stringify(patch),requestId]);
const saveOps=(ops,returns='per_sitting_collection')=>db.query('SELECT save_order_sitting_operations($1,$2,$3,$4)',[order,company,JSON.stringify(ops),returns]);
const rows=async()=> (await db.query('SELECT * FROM service_sittings WHERE quote_id=$1 ORDER BY sequence_number',[quote])).rows;
const trips=async()=> (await db.query("SELECT * FROM driver_assignments WHERE status NOT IN ('cancelled','rejected') ORDER BY scheduled_for,driver_id")).rows;
before(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION get_user_company_id(uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
    CREATE TYPE assignment_status AS ENUM('assigned','accepted','en_route','picked_up','at_venue','delivered','completed','cancelled','rejected');
    CREATE TABLE companies(id uuid PRIMARY KEY,timezone text DEFAULT 'Africa/Johannesburg');
    CREATE TABLE profiles(id uuid PRIMARY KEY,company_id uuid,role text DEFAULT 'driver',is_active boolean DEFAULT true);
    CREATE TABLE orders(id uuid PRIMARY KEY,company_id uuid,quote_id uuid,guest_count integer DEFAULT 100,region_id uuid,total_amount numeric DEFAULT 10000,amount_paid numeric DEFAULT 5000,deposit_paid boolean DEFAULT true,status text DEFAULT 'confirmed',event_date date DEFAULT '2099-11-06',event_time time DEFAULT '12:00',deleted_at timestamptz,
      assigned_driver_id uuid,driver_id uuid,secondary_driver_id uuid,equipment_return_method text,collection_next_day boolean,updated_at timestamptz,delivered_at timestamptz,service_ended_at timestamptz,event_complete_at timestamptz);
    CREATE TABLE quotes(id uuid PRIMARY KEY,company_id uuid,status text DEFAULT 'draft',guest_count integer DEFAULT 100,event_date date DEFAULT '2099-11-06',event_time time,
      valid_until timestamptz DEFAULT '2099-11-30',accepted_at timestamptz,converted_to_order_id uuid,deleted_at timestamptz,lost_reason text,rejected_at timestamptz,updated_at timestamptz,notes text);
    CREATE TABLE quote_change_requests(id uuid PRIMARY KEY,company_id uuid,quote_id uuid,status text DEFAULT 'pending',requested_changes jsonb,created_at timestamptz DEFAULT now());
    CREATE TABLE driver_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,order_id uuid REFERENCES orders,driver_id uuid,assignment_type text,status assignment_status DEFAULT 'assigned',
      scheduled_for timestamptz,notes text,rejection_reason text,accepted_at timestamptz,en_route_at timestamptz,arrived_at_venue_at timestamptz,picked_up_at timestamptz,delivered_at timestamptz,completed_at timestamptz);
    CREATE TABLE kitchen_prep_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,order_id uuid,region_id uuid,menu_item_name text,task_type text,start_at timestamptz,duration_min integer,status text DEFAULT 'pending',notes text,planned_yield numeric,yield_unit text,deleted_at timestamptz,started_at timestamptz);
    CREATE TABLE invoices(id uuid PRIMARY KEY,order_id uuid,total_amount numeric,amount_paid numeric);
    CREATE TABLE payments(id uuid PRIMARY KEY,order_id uuid,amount numeric);
  `);
  for(const name of ['20261020130000_service_sittings.sql','20261021190000_atomic_quote_service_plan_acceptance.sql','20261022030000_sitting_operations.sql','20261022150000_admin_managed_order_sittings.sql']) await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
  await db.exec(`CREATE TRIGGER stamp_event_end AFTER UPDATE OF status ON driver_assignments FOR EACH ROW EXECUTE FUNCTION stamp_order_event_end_from_collection();`);
});
after(()=>db.close());
beforeEach(async()=>{
  await db.exec('TRUNCATE companies,quotes,orders,service_sittings,profiles,driver_assignments,quote_change_requests,kitchen_prep_tasks,invoices,payments CASCADE');
  await db.query('INSERT INTO companies(id) VALUES($1),($2)',[company,tenant]);
  await db.query('INSERT INTO quotes(id,company_id) VALUES($1,$2)',[quote,company]);
  await db.query('INSERT INTO profiles(id,company_id) VALUES($1,$4),($2,$4),($3,$4)',[d1,d2,d3,company]);
  await db.query('INSERT INTO quote_change_requests(id,company_id,quote_id,requested_changes) VALUES($1,$2,$3,$4)',[request,company,quote,JSON.stringify({service_sittings:plan})]);
});
async function operations(){
  await saveQuote();
  await db.query('INSERT INTO orders(id,company_id,quote_id) VALUES($1,$2,$3)',[order,company,quote]);
  return (await rows()).map((s,i)=>({id:s.id,kitchenReadyTime:i?'16:30':'10:30',dispatchTime:i?'17:00':'11:00',returnDate:'2099-11-06',returnTime:i?'22:00':'15:00',deliveryDriverIds:[i?d2:d1],collectionDriverIds:[i?d2:d1],packingNotes:`Batch ${i+1}`,cleaningResetRequired:i===0}));
}
test('admin quote and two sittings save atomically, retaining the original client request',async()=>{
  const edited=[{guestCount:40,serviceTime:'13:00'},{guestCount:60,serviceTime:'19:00'}];
  await saveQuote(edited,{notes:'Reviewed',guest_count:100},request);
  assert.deepEqual((await rows()).map(s=>[s.guest_count,s.service_time]),[[40,'13:00:00'],[60,'19:00:00']]);
  const r=(await db.query('SELECT * FROM quote_change_requests')).rows[0];
  assert.deepEqual(r.requested_changes.service_sittings,plan); assert.deepEqual(r.reviewed_service_sittings,edited);
  await db.exec("UPDATE quote_change_requests SET status='addressed'");
  assert.deepEqual((await rows()).map(s=>s.service_time),['13:00:00','19:00:00']);
});
for(const [name,bad] of [['empty',[]],['wrong sum',[{guestCount:99,serviceTime:'12:00'}]],['fraction',[{guestCount:50.5,serviceTime:'12:00'},{guestCount:49.5,serviceTime:'18:00'}]],['missing time',[{guestCount:100,serviceTime:''}]]]) test(`rejects ${name} and rolls back the quote patch`,async()=>{
  await assert.rejects(saveQuote(bad,{notes:'Must not save'}));assert.equal((await rows()).length,0);assert.equal((await db.query('SELECT notes FROM quotes')).rows[0].notes,null);
});
test('cannot save another tenant quote or an accepted quote',async()=>{
  await assert.rejects(saveQuote(plan,{},null,tenant));await db.exec("UPDATE quotes SET status='accepted'");await assert.rejects(saveQuote());
});
test('protected SQL identifiers are rejected',async()=>{await assert.rejects(saveQuote(plan,{'company_id':tenant}));await assert.rejects(saveQuote(plan,{'notes = NULL; DROP TABLE quotes; --':'x'}));});
test('conversion promotes both sittings within the order insert transaction',async()=>{await operations();assert.ok((await rows()).every(s=>s.order_id===order));});
test('two deliveries and two collections keep independent drivers, times and IDs on retry',async()=>{
  const ops=await operations();await saveOps(ops);const before=await trips();assert.equal(before.length,4);
  assert.deepEqual(before.map(t=>t.driver_id),[d1,d1,d2,d2]);assert.equal(new Date(before[0].scheduled_for).getUTCHours(),9);
  await saveOps(ops);assert.deepEqual((await trips()).map(t=>t.id),before.map(t=>t.id));
});
test('multiple drivers can share a sitting delivery without replacing its collection',async()=>{const ops=await operations();ops[0].deliveryDriverIds.push(d3);await saveOps(ops);assert.equal((await trips()).length,5);});
test('final collection creates only the final sitting return',async()=>{const ops=await operations();await saveOps(ops,'final_collection');const t=await trips();assert.equal(t.length,3);assert.equal(t.filter(t=>t.assignment_type==='collection')[0].service_sitting_id,ops[1].id);});
test('client return creates no collection driver trips',async()=>{const ops=await operations();await saveOps(ops,'client_return');assert.ok((await trips()).every(t=>t.assignment_type==='delivery'));});
for(const [name,mutate] of [
  ['foreign driver',async o=>{await db.query('UPDATE profiles SET company_id=$1 WHERE id=$2',[tenant,d2]);}],
  ['inactive driver',async o=>{await db.query('UPDATE profiles SET is_active=false WHERE id=$1',[d2]);}],
  ['foreign sitting',async o=>{o[1].id=id(99);}],
  ['duplicate sitting',async o=>{o[1].id=o[0].id;}],
  ['late departure',async o=>{o[1].dispatchTime='19:00';}],
  ['missing collection time',async o=>{o[1].returnTime='';}],
  ['collection before service',async o=>{o[1].returnTime='17:00';}],
  ['driver without departure time',async o=>{o[1].dispatchTime='';}],
]) test(`invalid ${name} rolls back every trip`,async()=>{const ops=await operations();await mutate(ops);await assert.rejects(saveOps(ops));assert.equal((await trips()).length,0);});
test('overlapping trips reject a conflicting driver',async()=>{const ops=await operations();ops[1].deliveryDriverIds=[d1];ops[1].dispatchTime='15:30';ops[1].kitchenReadyTime='15:00';await assert.rejects(saveOps(ops));assert.equal((await trips()).length,0);});
async function advance(t,status,driver=t.driver_id){return db.query('SELECT advance_sitting_driver_trip($1,$2,$3,$4)',[t.id,driver,company,status]);}
test('driver can only progress their own trip, cannot skip steps, and retries are safe',async()=>{
  await saveOps(await operations());const t=(await trips())[0];await assert.rejects(advance(t,'accepted',d2));await assert.rejects(advance(t,'delivered'));await advance(t,'accepted');await advance(t,'accepted');assert.equal((await trips())[0].status,'accepted');
});
test('a started trip cannot be removed or rescheduled',async()=>{const ops=await operations();await saveOps(ops);const t=(await trips())[0];await advance(t,'accepted');await advance(t,'en_route');ops[0].deliveryDriverIds=[d3];await assert.rejects(saveOps(ops));ops[0].deliveryDriverIds=[d1];ops[0].dispatchTime='11:30';await assert.rejects(saveOps(ops));});
test('first delivery and collection leave the second sitting and event open',async()=>{
  await saveOps(await operations());const all=await trips();const first=all[0];
  for(const status of ['accepted','en_route','at_venue','delivered','completed']) await advance(first,status);
  assert.equal((await rows())[1].status,'planned');assert.equal((await db.query('SELECT status FROM orders')).rows[0].status,'confirmed');
  const collection=all.find(t=>t.assignment_type==='collection');for(const status of ['accepted','en_route','picked_up','completed']) await advance(collection,status);
  assert.equal((await db.query('SELECT event_complete_at FROM orders')).rows[0].event_complete_at,null);
  assert.equal((await trips()).find(t=>t.id===all[3].id).status,'assigned');
});
test('all deliveries aggregate only once every sitting is served',async()=>{await saveOps(await operations());for(const t of (await trips()).filter(t=>t.assignment_type==='delivery'))for(const status of ['accepted','en_route','at_venue','delivered','completed'])await advance(t,status);assert.equal((await db.query('SELECT status FROM orders')).rows[0].status,'delivered');});
test('legacy whole-order progress cannot finish a multi-sitting booking early',async()=>{await operations();await assert.rejects(db.exec("UPDATE orders SET status='delivered'"));await assert.rejects(db.exec("UPDATE orders SET status='in_transit'"));});
test('legacy scheduled collection trips also count as driver conflicts',async()=>{
  const ops=await operations();await db.query("INSERT INTO orders(id,company_id) VALUES($1,$2)",[id(20),company]);
  await db.query("INSERT INTO driver_assignments(company_id,order_id,driver_id,assignment_type,scheduled_for) VALUES($1,$2,$3,'collection','2099-11-06T09:10:00Z')",[company,id(20),d1]);
  await assert.rejects(saveOps(ops));assert.equal((await trips()).length,1);
});
test('a next-day collection checks the next-day legacy roster at collection time',async()=>{
  const ops=await operations();ops[1].returnDate='2099-11-07';ops[1].returnTime='09:00';
  await db.query("INSERT INTO orders(id,company_id,event_date,event_time,assigned_driver_id) VALUES($1,$2,'2099-11-07','09:15',$3)",[id(20),company,d2]);
  await assert.rejects(saveOps(ops));assert.equal((await trips()).length,0);
});
test('a stale sitting schedule is rejected without replacing trips',async()=>{
  const ops=await operations();ops[0].updated_at='2000-01-01T00:00:00Z';await assert.rejects(saveOps(ops));assert.equal((await trips()).length,0);
});
test('every delivery and every required collection must finish before the event ends',async()=>{
  await saveOps(await operations());const all=await trips();
  for(const t of all.filter(t=>t.assignment_type==='delivery'))for(const status of ['accepted','en_route','at_venue','delivered','completed'])await advance(t,status);
  const collections=all.filter(t=>t.assignment_type==='collection');
  for(const status of ['accepted','en_route','picked_up','completed'])await advance(collections[0],status);
  assert.equal((await db.query('SELECT event_complete_at FROM orders')).rows[0].event_complete_at,null);
  for(const status of ['accepted','en_route','picked_up','completed'])await advance(collections[1],status);
  assert.ok((await db.query('SELECT event_complete_at FROM orders')).rows[0].event_complete_at);
});

const adminOps = () => [0,1].map(i=>({id:id(30+i),guest_count:50,service_time:i?'18:00':'12:00',kitchenReadyTime:i?'16:30':'10:30',dispatchTime:i?'17:00':'11:00',returnDate:'2099-11-06',returnTime:i?'22:00':'15:00',deliveryDriverIds:[i?d2:d1],collectionDriverIds:[i?d2:d1]}));
const batchTasks = ops => ops.flatMap((s,i)=>['prep','cook'].map((type,j)=>({service_sitting_id:s.id,menu_item_name:'Brownie',task_type:type,start_at:`2099-11-06T${i?'14':'08'}:${j?'30':'00'}:00Z`,duration_min:30,planned_yield:s.guest_count,yield_unit:'portions',notes:`Sitting ${i+1}: ${s.guest_count} guests at ${s.service_time}`})));
const adminSave = (ops=adminOps(),tenantId=company,tasks=batchTasks(ops))=>db.query('SELECT save_admin_order_service_plan($1,$2,$3,$4,$5)',[order,tenantId,JSON.stringify(ops),'per_sitting_collection',JSON.stringify(tasks)]);
async function legacyBooking(){
  await db.query('INSERT INTO orders(id,company_id,quote_id) VALUES($1,$2,$3)',[order,company,quote]);
  await db.query("UPDATE quotes SET status='accepted',converted_to_order_id=$1 WHERE id=$2",[order,quote]);
  await db.query("INSERT INTO kitchen_prep_tasks(company_id,order_id,menu_item_name,task_type,status) VALUES($1,$2,'Brownie','prep','pending')",[company,order]);
  await db.query('INSERT INTO invoices VALUES($1,$2,10000,5000)',[id(40),order]);
  await db.query('INSERT INTO payments VALUES($1,$2,5000)',[id(41),order]);
}
const activeTasks = async()=> (await db.query('SELECT * FROM kitchen_prep_tasks WHERE deleted_at IS NULL ORDER BY start_at')).rows;

test('an already booked order splits into two kitchen batches with independent trips and one unchanged invoice/payment',async()=>{
  await legacyBooking();await adminSave();
  assert.equal((await rows()).length,2);assert.equal((await trips()).length,4);assert.equal((await activeTasks()).length,4);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n,1);
  assert.deepEqual((await db.query('SELECT total_amount,amount_paid FROM invoices')).rows,[{total_amount:'10000',amount_paid:'5000'}]);
  assert.deepEqual((await db.query('SELECT amount FROM payments')).rows,[{amount:'5000'}]);
  assert.deepEqual((await db.query('SELECT total_amount,amount_paid,deposit_paid FROM orders')).rows,[{total_amount:'10000',amount_paid:'5000',deposit_paid:true}]);
  assert.deepEqual((await activeTasks()).map(t=>t.service_sitting_id),[id(30),id(30),id(31),id(31)]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM kitchen_prep_tasks WHERE deleted_at IS NOT NULL')).rows[0].n,1);
});
test('retrying a saved plan keeps kitchen task and trip IDs stable',async()=>{
  await legacyBooking();await adminSave();const before=(await activeTasks()).map(t=>t.id);const tripIds=(await trips()).map(t=>t.id);
  await adminSave();assert.deepEqual((await activeTasks()).map(t=>t.id),before);assert.deepEqual((await trips()).map(t=>t.id),tripIds);
});
test('admin can revise guest allocations and both service times before work starts',async()=>{
  await legacyBooking();await adminSave();const ops=adminOps();ops[0].guest_count=40;ops[1].guest_count=60;ops[1].service_time='19:00';await adminSave(ops);
  assert.deepEqual((await rows()).map(s=>[s.guest_count,s.service_time]),[[40,'12:00:00'],[60,'19:00:00']]);
  assert.deepEqual((await activeTasks()).map(t=>Number(t.planned_yield)),[40,40,60,60]);
});
test('invalid guest totals leave the booking, tasks and finance intact',async()=>{
  await legacyBooking();const ops=adminOps();ops[1].guest_count=49;await assert.rejects(adminSave(ops),/booking total/);
  assert.equal((await rows()).length,0);assert.equal((await activeTasks()).length,1);assert.equal((await trips()).length,0);
});
test('a bad driver rolls back the new split, all tasks and every trip',async()=>{
  await legacyBooking();const ops=adminOps();ops[1].deliveryDriverIds=[id(99)];await assert.rejects(adminSave(ops),/active driver/);
  assert.equal((await rows()).length,0);assert.equal((await activeTasks()).length,1);assert.equal((await trips()).length,0);
});
for(const state of ['in_progress','done'])test(`a ${state} kitchen task prevents rewriting the split`,async()=>{
  await legacyBooking();await db.query('UPDATE kitchen_prep_tasks SET status=$1',[state]);await assert.rejects(adminSave(),/already started/);
  assert.equal((await rows()).length,0);assert.equal((await activeTasks()).length,1);
});
test('a started sitting trip prevents changing service times without touching its progress',async()=>{
  await legacyBooking();await adminSave();const t=(await trips())[0];await advance(t,'accepted');await advance(t,'en_route');
  const ops=adminOps();ops[0].service_time='13:00';await assert.rejects(adminSave(ops),/already started/);assert.equal((await trips())[0].status,'en_route');
});
test('a stale version cannot overwrite a saved sitting plan',async()=>{
  await legacyBooking();await adminSave();const ops=adminOps();ops[0].updated_at='2000-01-01';await assert.rejects(adminSave(ops),/Another team member/);
});
test('admin order planning is tenant scoped and unavailable to browser roles',async()=>{
  await legacyBooking();await assert.rejects(adminSave(adminOps(),tenant));
  for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);await assert.rejects(adminSave(),/permission denied/);await db.exec('RESET ROLE');}
});
test('addressing an old client timing request does not apply it without admin review',async()=>{
  await db.exec("UPDATE quote_change_requests SET status='addressed'");assert.equal((await rows()).length,0);
});
test('finishing the first kitchen batch leaves the second batch planned',async()=>{
  await legacyBooking();await adminSave();
  await db.query("UPDATE kitchen_prep_tasks SET status='done' WHERE service_sitting_id=$1 AND deleted_at IS NULL",[id(30)]);
  assert.deepEqual((await rows()).map(s=>s.status),['ready','planned']);
});
test('collection drivers remain editable after both deliveries finish',async()=>{
  await legacyBooking();await adminSave();
  for(const t of (await trips()).filter(t=>t.assignment_type==='delivery'))for(const status of ['accepted','en_route','at_venue','delivered','completed'])await advance(t,status);
  const ops=adminOps();ops[0].collectionDriverIds=[d3];await adminSave(ops);
  assert.equal((await trips()).find(t=>t.service_sitting_id===id(30)&&t.assignment_type==='collection').driver_id,d3);
  assert.equal((await db.query('SELECT status FROM orders')).rows[0].status,'delivered');
});
test('a signed-in company member cannot bypass admin scheduling through direct table writes',async()=>{
  await legacyBooking();await adminSave();
  await db.exec(`CREATE OR REPLACE FUNCTION get_user_company_id(uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT '${company}'::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON service_sittings TO authenticated; SET ROLE authenticated;`);
  try {
    assert.equal((await db.query('SELECT * FROM service_sittings')).rows.length,2);
    await db.query('UPDATE service_sittings SET guest_count=999');
    assert.deepEqual((await db.query('SELECT guest_count FROM service_sittings')).rows.map(s=>s.guest_count),[50,50]);
    await assert.rejects(db.query("INSERT INTO service_sittings(company_id,order_id,sequence_number,guest_count,service_time) VALUES($1,$2,3,1,'20:00')",[company,order]),/row-level security/);
  } finally { await db.exec('RESET ROLE'); }
});
