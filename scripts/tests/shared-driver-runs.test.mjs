import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const companyId = id(1), orderId = id(2), driverA = id(3), driverB = id(4);
const sittingIds = [id(11), id(12), id(13), id(14), id(15)];

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TYPE public.assignment_status AS ENUM ('assigned','accepted','cancelled','rejected','completed');
    CREATE TABLE public.companies(id uuid PRIMARY KEY, timezone text);
    CREATE TABLE public.orders(
      id uuid PRIMARY KEY, company_id uuid, deleted_at timestamptz, status text DEFAULT 'confirmed',
      event_date date, event_time time, equipment_return_plan text, equipment_return_method text,
      collection_next_day boolean, assigned_driver_id uuid, driver_id uuid, secondary_driver_id uuid, updated_at timestamptz,
      quote_id uuid, guest_count integer DEFAULT 100, region_id uuid, venue_name text, venue_address text,
      venue_lat double precision, venue_lng double precision
    );
    CREATE TABLE public.service_sittings(
      id uuid PRIMARY KEY, order_id uuid, company_id uuid, sequence_number integer, guest_count integer,
      service_time time, updated_at timestamptz, kitchen_ready_time time, dispatch_time time,
      return_date date, return_time time, packing_notes text, cleaning_reset_required boolean DEFAULT false,
      return_required boolean DEFAULT false, status text DEFAULT 'planned', quote_id uuid,
      venue_name text, venue_address text, venue_lat double precision, venue_lng double precision
    );
    CREATE TABLE public.quotes(id uuid PRIMARY KEY, company_id uuid, event_time time, updated_at timestamptz);
    CREATE TABLE public.kitchen_prep_tasks(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, order_id uuid, region_id uuid,
      service_sitting_id uuid, menu_item_name text, task_type text, start_at timestamptz,
      duration_min integer, status text DEFAULT 'pending', started_at timestamptz, completed_at timestamptz,
      deleted_at timestamptz, notes text, planned_yield numeric, yield_unit text
    );
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, company_id uuid, role text, is_active boolean, full_name text);
    CREATE TABLE public.driver_assignments(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, order_id uuid, service_sitting_id uuid,
      driver_id uuid, assignment_type text, status public.assignment_status DEFAULT 'assigned',
      scheduled_for timestamptz, notes text, rejection_reason text,
      UNIQUE(order_id, service_sitting_id, driver_id, assignment_type)
    );
    INSERT INTO public.companies VALUES ('${companyId}', 'Africa/Johannesburg');
    INSERT INTO public.orders(id,company_id,event_date,event_time) VALUES ('${orderId}','${companyId}','2026-11-13','18:00');
    INSERT INTO public.profiles VALUES
      ('${driverA}','${companyId}','driver',true,'Driver A'),
      ('${driverB}','${companyId}','driver',true,'Driver B');
  `);
  for (let index = 0; index < sittingIds.length; index += 1) {
    await db.query(
      'INSERT INTO public.service_sittings(id,order_id,company_id,sequence_number,guest_count,service_time) VALUES($1,$2,$3,$4,20,$5)',
      [sittingIds[index], orderId, companyId, index + 1, `${17 + Math.floor(index / 2)}:${String((index % 2) * 30).padStart(2, '0')}`],
    );
  }
  await db.exec(await readFile('supabase/migrations/20261112110000_confirm_shared_driver_runs.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261113140000_allow_confirmed_service_plan_updates_after_start.sql', 'utf8'));
});

after(() => db.close());

const operations = (allowDriverOverlap = false) => sittingIds.map((sittingId, index) => ({
  id: sittingId,
  dispatchTime: '16:00',
  deliveryDriverIds: [index < 3 ? driverA : driverB],
  collectionDriverIds: [],
  ...(index === 0 && allowDriverOverlap ? { allowDriverOverlap: true } : {}),
}));

test('returns a confirmation-required conflict and commits none of the shared run', async () => {
  await assert.rejects(
    db.query('SELECT public.save_order_sitting_operations($1,$2,$3::jsonb,$4)', [orderId, companyId, JSON.stringify(operations()), 'client_return']),
    error => error.code === '22023' && error.message.includes('DISPATCH_OVERLAP_CONFIRMATION_REQUIRED: Driver A'),
  );
  const assignments = await db.query('SELECT count(*)::int AS count FROM public.driver_assignments WHERE order_id=$1', [orderId]);
  assert.equal(assignments.rows[0].count, 0);
});

test('saves the confirmed shared run with one driver on three stops and another on two', async () => {
  await db.query('SELECT public.save_order_sitting_operations($1,$2,$3::jsonb,$4)', [orderId, companyId, JSON.stringify(operations(true)), 'client_return']);
  const assignments = await db.query(
    'SELECT driver_id,count(*)::int AS stops FROM public.driver_assignments WHERE order_id=$1 GROUP BY driver_id ORDER BY driver_id',
    [orderId],
  );
  assert.deepEqual(assignments.rows, [
    { driver_id: driverA, stops: 3 },
    { driver_id: driverB, stops: 2 },
  ]);
});

test('admin can confirm a guest split change after kitchen work starts while started batches stay intact', async () => {
  const activeOrder = id(100), quote = id(101), firstSitting = id(102), secondSitting = id(103);
  await db.query("INSERT INTO public.quotes(id,company_id,event_time) VALUES($1,$2,'12:00')", [quote, companyId]);
  await db.query("INSERT INTO public.orders(id,company_id,event_date,event_time,quote_id,guest_count) VALUES($1,$2,'2026-11-13','12:00',$3,100)", [activeOrder, companyId, quote]);
  await db.query("INSERT INTO public.service_sittings(id,order_id,company_id,quote_id,sequence_number,guest_count,service_time) VALUES($1,$3,$4,$5,1,50,'12:00'),($2,$3,$4,$5,2,50,'18:00')", [firstSitting, secondSitting, activeOrder, companyId, quote]);
  await db.query("INSERT INTO public.kitchen_prep_tasks(company_id,order_id,service_sitting_id,menu_item_name,task_type,status,started_at,planned_yield,yield_unit) VALUES($1,$2,$3,'Lamb','prep','in_progress',now(),50,'portions')", [companyId, activeOrder, firstSitting]);

  const operations = [
    { id: firstSitting, guest_count: 60, service_time: '12:30', kitchenReadyTime: '10:00', dispatchTime: '11:00', venue_address: 'First address', deliveryDriverIds: [], collectionDriverIds: [] },
    { id: secondSitting, guest_count: 40, service_time: '18:30', kitchenReadyTime: '16:00', dispatchTime: '17:00', venue_address: 'Second address', deliveryDriverIds: [], collectionDriverIds: [] },
  ];
  const tasks = [
    { service_sitting_id: firstSitting, menu_item_name: 'Lamb', task_type: 'prep', start_at: '2026-11-13T09:00:00Z', duration_min: 60, planned_yield: 60, yield_unit: 'portions' },
    { service_sitting_id: secondSitting, menu_item_name: 'Lamb', task_type: 'prep', start_at: '2026-11-13T15:00:00Z', duration_min: 60, planned_yield: 40, yield_unit: 'portions' },
  ];
  const save = (confirm = false) => db.query(
    'SELECT public.save_admin_order_service_plan_with_venues($1,$2,$3::jsonb,$4,$5::jsonb,$6)',
    [activeOrder, companyId, JSON.stringify(operations), 'client_return', JSON.stringify(tasks), confirm],
  );

  await assert.rejects(save(false), error => error.code === '22023' && error.message.includes('ACTIVE_ORDER_WORK_CONFIRMATION_REQUIRED:'));
  const unchanged = await db.query('SELECT guest_count FROM public.service_sittings WHERE id=$1', [firstSitting]);
  assert.equal(unchanged.rows[0].guest_count, 50);

  await save(true);
  const split = await db.query('SELECT guest_count FROM public.service_sittings WHERE order_id=$1 ORDER BY sequence_number', [activeOrder]);
  assert.deepEqual(split.rows.map(row => row.guest_count), [60, 40]);
  const kitchen = await db.query("SELECT service_sitting_id,status,planned_yield FROM public.kitchen_prep_tasks WHERE order_id=$1 AND deleted_at IS NULL ORDER BY service_sitting_id", [activeOrder]);
  assert.equal(kitchen.rows.length, 2);
  assert.deepEqual(kitchen.rows.map(row => row.status), ['in_progress', 'pending']);
  assert.deepEqual(kitchen.rows.map(row => Number(row.planned_yield)), [50, 40]);
});
