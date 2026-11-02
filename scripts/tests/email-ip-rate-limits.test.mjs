import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = new URL("../../supabase/migrations/20261102120000_atomic_email_ip_rate_limits.sql", import.meta.url);

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.api_key_rate_limits (
      key_hash TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key_hash, window_start)
    );
  `);
  await db.exec(await readFile(migration, "utf8"));
  return db;
}

async function consume(db, hashes, limits) {
  return (await db.query(
    "SELECT * FROM public.consume_api_key_rate_limits_windowed($1::text[], $2::integer[], 600)",
    [hashes, limits],
  )).rows[0];
}

async function expectAllowed(db, hashes, limits, remaining) {
  const result = await consume(db, hashes, limits);
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, remaining);
  assert.ok(result.reset_in_ms >= 0 && result.reset_in_ms <= 600_000);
}

test("email and IP limits are checked independently and denied requests consume no quota", async () => {
  const db = await database();
  try {
    await expectAllowed(db, ["email-a", "ip-shared"], [2, 3], 1);
    await expectAllowed(db, ["email-b", "ip-shared"], [2, 3], 1);
    await expectAllowed(db, ["email-a", "ip-shared"], [2, 3], 0);

    assert.equal((await consume(db, ["email-a", "ip-shared"], [2, 3])).allowed, false);
    assert.equal((await consume(db, ["email-c", "ip-shared"], [2, 3])).allowed, false);

    // The denied IP request above must not spend email-c's allowance.
    await expectAllowed(db, ["email-c", "ip-new"], [2, 3], 1);

    const rows = (await db.query(
      "SELECT key_hash, count FROM public.api_key_rate_limits WHERE key_hash = ANY($1::text[]) ORDER BY key_hash",
      [["email-a", "email-b", "email-c", "ip-shared", "ip-new"]],
    )).rows;
    assert.deepEqual(rows.map(({ key_hash, count }) => [key_hash, count]), [
      ["email-a", 2],
      ["email-b", 1],
      ["email-c", 1],
      ["ip-new", 1],
      ["ip-shared", 3],
    ]);
  } finally {
    await db.close();
  }
});
