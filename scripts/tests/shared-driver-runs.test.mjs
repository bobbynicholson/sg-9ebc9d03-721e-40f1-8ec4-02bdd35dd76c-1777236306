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
      collection_next_day boolean, assigned_driver_id uuid, driver_id uuid, secondary_driver_id uuid, updated_at timestamptz
    );
    CREATE TABLE public.service_sittings(
      id uuid PRIMARY KEY, order_id uuid, company_id uuid, sequence_number integer, guest_count integer,
      service_time time, updated_at timestamptz, kitchen_ready_time time, dispatch_time time,
      return_date date, return_time time, packing_notes text, cleaning_reset_required boolean DEFAULT false,
      return_required boolean DEFAULT false, status text DEFAULT 'planned'
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
