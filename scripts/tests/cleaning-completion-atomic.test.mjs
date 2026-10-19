import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL("../../supabase/migrations/20261019113000_atomic_complete_cleaning_job.sql", import.meta.url);
const ids = {
  company: "11111111-1111-1111-1111-111111111111",
  otherCompany: "22222222-2222-2222-2222-222222222222",
  equipment: "33333333-3333-3333-3333-333333333333",
  otherEquipment: "44444444-4444-4444-4444-444444444444",
  inProgress: "55555555-5555-5555-5555-555555555555",
  queued: "66666666-6666-6666-6666-666666666666",
  cancelled: "77777777-7777-7777-7777-777777777777",
  mismatched: "88888888-8888-8888-8888-888888888888",
};

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table public.companies (id uuid primary key);
    create table public.profiles (id uuid primary key, company_id uuid, role text, active_role text);
    create function public.current_user_has_any_role(text[]) returns boolean language sql as $$ select false $$;
    create function public.get_user_company_id(uuid) returns uuid language sql as $$ select null::uuid $$;
    create table public.equipment (
      id uuid primary key, company_id uuid not null, quantity numeric, available_quantity numeric, updated_at timestamptz
    );
    create table public.cleaning_jobs (
      id uuid primary key, company_id uuid not null, equipment_id uuid not null references public.equipment(id),
      quantity integer not null, status text not null, actual_end timestamptz, updated_at timestamptz, deleted_at timestamptz,
      triggered_by_event_id uuid
    );
  `);
  await db.exec(await readFile(migrationUrl, "utf8"));
  await db.exec(`
    insert into public.equipment values
      ('${ids.equipment}', '${ids.company}', 10, 2, now()),
      ('${ids.otherEquipment}', '${ids.otherCompany}', 10, 2, now());
    insert into public.cleaning_jobs (id, company_id, equipment_id, quantity, status) values
      ('${ids.inProgress}', '${ids.company}', '${ids.equipment}', 2, 'in_progress'),
      ('${ids.queued}', '${ids.company}', '${ids.equipment}', 2, 'queued'),
      ('${ids.cancelled}', '${ids.company}', '${ids.equipment}', 2, 'cancelled'),
      ('${ids.mismatched}', '${ids.company}', '${ids.otherEquipment}', 2, 'in_progress');
  `);
  return db;
}

async function complete(db, id) {
  return (await db.query(`select * from public.complete_cleaning_job('${id}'::uuid)`)).rows[0];
}

async function available(db, id = ids.equipment) {
  return (await db.query(`select available_quantity from public.equipment where id = '${id}'`)).rows[0].available_quantity;
}

test("atomic completion restores equipment exactly once", async () => {
  const db = await fixture();
  try {
    const first = await complete(db, ids.inProgress);
    assert.equal(first.completed, true);
    assert.equal(first.already_complete, false);
    assert.equal(await available(db), "4");

    const retry = await complete(db, ids.inProgress);
    assert.equal(retry.completed, false);
    assert.equal(retry.already_complete, true);
    assert.equal(await available(db), "4");
  } finally {
    await db.close();
  }
});

test("queued and cancelled jobs cannot restore equipment", async () => {
  const db = await fixture();
  try {
    for (const [jobId, status] of [[ids.queued, "queued"], [ids.cancelled, "cancelled"]]) {
      const result = await complete(db, jobId);
      assert.equal(result.completed, false);
      assert.equal(result.already_complete, false);
      assert.equal(result.status, status);
    }
    assert.equal(await available(db), "2");
  } finally {
    await db.close();
  }
});

test("an equipment failure rolls the cleaning-job completion back", async () => {
  const db = await fixture();
  try {
    await assert.rejects(complete(db, ids.mismatched));
    const row = (await db.query(`select status, actual_end from public.cleaning_jobs where id = '${ids.mismatched}'`)).rows[0];
    assert.equal(row.status, "in_progress");
    assert.equal(row.actual_end, null);
    assert.equal(await available(db, ids.otherEquipment), "2");
  } finally {
    await db.close();
  }
});
