import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Slip lines carry no company_id from the app; a trigger copies it from the
// receipt. The company relationship checks must see that value, so the stamp
// has to run first (Postgres fires same-timing triggers in name order).
const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const company = '00000000-0000-0000-0000-000000000001';
const otherCompany = '00000000-0000-0000-0000-000000000002';
const receipt = '00000000-0000-0000-0000-000000000003';
const item = '00000000-0000-0000-0000-000000000004';
const foreignItem = '00000000-0000-0000-0000-000000000005';

async function database({ withFix }) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE companies(id uuid PRIMARY KEY);
    CREATE TABLE inventory_items(id uuid PRIMARY KEY, company_id uuid REFERENCES companies);
    CREATE TABLE purchase_receipts(id uuid PRIMARY KEY, company_id uuid REFERENCES companies);
    CREATE TABLE purchase_receipt_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_id uuid REFERENCES purchase_receipts, inventory_item_id uuid REFERENCES inventory_items,
      description text);
    INSERT INTO companies VALUES ('${company}'), ('${otherCompany}');
    INSERT INTO purchase_receipts VALUES ('${receipt}', '${company}');
    INSERT INTO inventory_items VALUES ('${item}', '${company}'), ('${foreignItem}', '${otherCompany}');
  `);
  await db.exec(await migration('20260524220000_purchase_receipt_items_company_id.sql'));
  await db.exec(await migration('20261029150000_company_relationship_integrity.sql'));
  if (withFix) await db.exec(await migration('20261030140000_receipt_items_stamp_company_before_checks.sql'));
  return db;
}
const addLine = (db, inventoryItem) => db.query(
  'INSERT INTO purchase_receipt_items(receipt_id, inventory_item_id, description) VALUES ($1, $2, $3) RETURNING company_id',
  [receipt, inventoryItem, 'Chicken']);

test('without the fix every slip line is rejected (reproduces the live error)', async () => {
  const db = await database({ withFix: false });
  await assert.rejects(addLine(db, null), /Related record must belong to the same company/);
});

test('a slip line saves and takes the receipt company', async () => {
  const db = await database({ withFix: true });
  assert.equal((await addLine(db, null)).rows[0].company_id, company);
  assert.equal((await addLine(db, item)).rows[0].company_id, company);
});

test('a slip line still cannot link another company stock item', async () => {
  const db = await database({ withFix: true });
  await assert.rejects(addLine(db, foreignItem), /Related record must belong to the same company/);
});
