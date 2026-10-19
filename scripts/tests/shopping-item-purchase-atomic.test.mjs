import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL("../../supabase/migrations/20261019123000_atomic_toggle_shopping_item_purchase.sql", import.meta.url);
const ids = {
  company: "11111111-1111-1111-1111-111111111111",
  otherCompany: "22222222-2222-2222-2222-222222222222",
  list: "33333333-3333-3333-3333-333333333333",
  inventory: "44444444-4444-4444-4444-444444444444",
  itemOne: "55555555-5555-5555-5555-555555555555",
  itemTwo: "66666666-6666-6666-6666-666666666666",
  freeText: "77777777-7777-7777-7777-777777777777",
  missingStock: "88888888-8888-8888-8888-888888888888",
  missingInventory: "99999999-9999-9999-9999-999999999999",
};

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table public.profiles (id uuid primary key, company_id uuid, role text, active_role text);
    create function public.current_user_has_any_role(text[]) returns boolean language sql as $$ select false $$;
    create function public.get_user_company_id(uuid) returns uuid language sql as $$ select null::uuid $$;
    create table public.shopping_lists (id uuid primary key, company_id uuid not null);
    create table public.inventory_items (
      id uuid primary key, company_id uuid not null, current_stock numeric, updated_at timestamptz
    );
    create table public.shopping_list_items (
      id uuid primary key, shopping_list_id uuid not null references public.shopping_lists(id), item_id uuid,
      quantity numeric, purchased boolean, source_order_id uuid, removed_at timestamptz
    );
  `);
  await db.exec(await readFile(migrationUrl, "utf8"));
  await db.exec(`
    insert into public.shopping_lists values ('${ids.list}', '${ids.company}');
    insert into public.inventory_items values ('${ids.inventory}', '${ids.company}', 2, now());
    insert into public.shopping_list_items values
      ('${ids.itemOne}', '${ids.list}', '${ids.inventory}', 3, false, null, null),
      ('${ids.itemTwo}', '${ids.list}', '${ids.inventory}', 4, false, null, null),
      ('${ids.freeText}', '${ids.list}', null, 1, false, null, null),
      ('${ids.missingStock}', '${ids.list}', '${ids.missingInventory}', 2, false, null, null);
  `);
  return db;
}

async function toggle(db, itemId, purchased) {
  return (await db.query(
    `select * from public.toggle_shopping_list_item_purchase('${itemId}'::uuid, ${purchased})`,
  )).rows[0];
}

async function purchased(db, itemId) {
  return (await db.query(`select purchased from public.shopping_list_items where id = '${itemId}'`)).rows[0].purchased;
}

async function stock(db) {
  return (await db.query(`select current_stock from public.inventory_items where id = '${ids.inventory}'`)).rows[0].current_stock;
}

test("purchase, repeat, and undo change stock exactly once per state transition", async () => {
  const db = await fixture();
  try {
    assert.equal((await toggle(db, ids.itemOne, true)).changed, true);
    assert.equal(await stock(db), "5");
    assert.equal((await toggle(db, ids.itemOne, true)).changed, false);
    assert.equal(await stock(db), "5");
    assert.equal((await toggle(db, ids.itemOne, false)).changed, true);
    assert.equal(await stock(db), "2");
  } finally {
    await db.close();
  }
});

test("different purchased lines sharing stock compose their increments", async () => {
  const db = await fixture();
  try {
    await toggle(db, ids.itemOne, true);
    await toggle(db, ids.itemTwo, true);
    assert.equal(await stock(db), "9");
  } finally {
    await db.close();
  }
});

test("missing inventory rolls the purchased flag back with the failed transaction", async () => {
  const db = await fixture();
  try {
    await assert.rejects(toggle(db, ids.missingStock, true));
    assert.equal(await purchased(db, ids.missingStock), false);
    assert.equal(await stock(db), "2");
  } finally {
    await db.close();
  }
});

test("free-text lines remain purchaseable without an inventory adjustment", async () => {
  const db = await fixture();
  try {
    const result = await toggle(db, ids.freeText, true);
    assert.equal(result.changed, true);
    assert.equal(await purchased(db, ids.freeText), true);
    assert.equal(await stock(db), "2");
  } finally {
    await db.close();
  }
});
