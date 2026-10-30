import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Signed-in users may not call dispatch_webhook directly (20261029140000),
// but saving a quote or lead from the app fires triggers that call it.
const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const company = '00000000-0000-0000-0000-000000000001';

async function database({ withFix }) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE TABLE webhook_calls(event text);
    CREATE FUNCTION dispatch_webhook(p_company uuid, p_event text, p_payload jsonb) RETURNS void
      LANGUAGE sql SECURITY DEFINER AS $$ INSERT INTO webhook_calls VALUES (p_event) $$;
    REVOKE ALL ON FUNCTION dispatch_webhook(uuid, text, jsonb) FROM PUBLIC;
    CREATE TABLE quotes(id int PRIMARY KEY, company_id uuid, status text);
    CREATE TABLE leads(id int PRIMARY KEY, company_id uuid, status text);
    GRANT SELECT, INSERT, UPDATE ON quotes, leads TO authenticated;
  `);
  // Original (pre-fix) bodies, as created by 20260515310000.
  await db.exec(`
    CREATE FUNCTION trg_quote_sent() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
    BEGIN
      IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status <> 'sent') THEN
        PERFORM dispatch_webhook(NEW.company_id, 'quote.sent', to_jsonb(NEW));
      ELSIF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
        PERFORM dispatch_webhook(NEW.company_id, 'quote.accepted', to_jsonb(NEW));
      END IF;
      RETURN NEW;
    END $f$;
    CREATE FUNCTION trg_quote_created_webhook() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
    BEGIN PERFORM dispatch_webhook(NEW.company_id, 'quote.created', to_jsonb(NEW)); RETURN NEW; END $f$;
    CREATE FUNCTION trg_lead_created() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
    BEGIN PERFORM dispatch_webhook(NEW.company_id, 'lead.created', to_jsonb(NEW)); RETURN NEW; END $f$;
    CREATE FUNCTION trg_lead_status_changed() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
    BEGIN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM dispatch_webhook(NEW.company_id, 'lead.status_changed', jsonb_build_object('new_status', NEW.status));
      END IF;
      RETURN NEW;
    END $f$;
    CREATE TRIGGER quotes_dispatch_status AFTER UPDATE OF status ON quotes FOR EACH ROW EXECUTE FUNCTION trg_quote_sent();
    CREATE TRIGGER quotes_created_webhook AFTER INSERT ON quotes FOR EACH ROW EXECUTE FUNCTION trg_quote_created_webhook();
    CREATE TRIGGER leads_created_webhook AFTER INSERT ON leads FOR EACH ROW EXECUTE FUNCTION trg_lead_created();
    CREATE TRIGGER leads_status_webhook AFTER UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION trg_lead_status_changed();
    INSERT INTO quotes VALUES (1, '${company}', 'draft');
    INSERT INTO leads VALUES (1, '${company}', 'new');
    DELETE FROM webhook_calls;
  `);
  if (withFix) await db.exec(await migration('20261030160000_webhook_triggers_security_definer.sql'));
  await db.exec('SET ROLE authenticated');
  return db;
}

test('without the fix a signed-in user cannot mark a quote sent (reproduces the live failure)', async () => {
  const db = await database({ withFix: false });
  await assert.rejects(db.query(`UPDATE quotes SET status = 'sent' WHERE id = 1`), /permission denied for function dispatch_webhook/);
});

test('a signed-in user can send a quote and save leads; webhooks still fire', async () => {
  const db = await database({ withFix: true });
  await db.query(`UPDATE quotes SET status = 'sent' WHERE id = 1`);
  await db.query(`INSERT INTO quotes VALUES (2, '${company}', 'draft')`);
  await db.query(`INSERT INTO leads VALUES (2, '${company}', 'new')`);
  await db.query(`UPDATE leads SET status = 'contacted' WHERE id = 1`);
  await db.exec('RESET ROLE');
  const events = (await db.query('SELECT event FROM webhook_calls ORDER BY event')).rows.map((r) => r.event);
  assert.deepEqual(events, ['lead.created', 'lead.status_changed', 'quote.created', 'quote.sent']);
});

test('dispatch_webhook stays closed to direct calls by signed-in users', async () => {
  const db = await database({ withFix: true });
  await assert.rejects(db.query(`SELECT dispatch_webhook('${company}', 'x', '{}'::jsonb)`), /permission denied/);
});
