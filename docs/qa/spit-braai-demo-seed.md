# Spit Braai demo seed -- volumes + cleanup

A one-shot demo seed was applied to the Spit Braai Delivery tenant
(`slug='spit-braai-delivery'`) on 4 May 2026 to make every chart in the
Business Intelligence dashboard render with realistic data.

Every demo row carries a marker for safe identification + cleanup:

- `clients.notes` starts with `[DEMO_SEED]`
- `leads.notes` starts with `[DEMO_SEED]`
- `quotes.notes` starts with `[DEMO_SEED]`
- `orders.internal_notes` starts with `[DEMO_SEED]`
- `orders.order_number` matches `SBD-DEMO-%`
- `quotes.quote_number` matches `QT-DEMO-%`

## What landed

| Chart fed | Volume |
|---|---|
| Demo clients | 8 |
| Demo leads | 20 |
| Demo orders | 20 |
| Demo quotes | 18 |
| Booked orders (last 12 months) | 12 |
| Confirmed / active orders (next 90 days) | 5 |
| Open quotes (sent/viewed/revised) | 3 |
| Accepted quotes | 13 |
| Cancelled orders | 1 |
| Cohort quarters spanned | 7 |

Clients are seeded across 7 different signup quarters (Q3 2024 → Q1 2026)
so the **Client retention cohort** chart's 4-quarter minimum is met and
it will render. Leads use a mix of sources (`manual_add`, `embed`,
`client_portal_rebook`) so the future Tier 4 Sankey has shape too.

## Cleanup script

Run when you're ready to wipe demo data. **Idempotent** -- safe to
re-run; missing rows are no-ops.

```sql
-- WIPE Spit Braai demo seed (4 May 2026)
WITH spit AS (SELECT id AS company_id FROM companies WHERE slug='spit-braai-delivery')

-- 1. Hard-delete demo invoices (they reference orders we're about to remove)
DELETE FROM invoices
WHERE company_id=(SELECT company_id FROM spit)
  AND order_id IN (
    SELECT id FROM orders
    WHERE company_id=(SELECT company_id FROM spit)
      AND (order_number LIKE 'SBD-DEMO-%' OR internal_notes LIKE '[DEMO_SEED]%')
  );

-- 2. Hard-delete demo orders
DELETE FROM orders
WHERE company_id=(SELECT id FROM companies WHERE slug='spit-braai-delivery')
  AND (order_number LIKE 'SBD-DEMO-%' OR internal_notes LIKE '[DEMO_SEED]%');

-- 3. Hard-delete demo quotes
DELETE FROM quotes
WHERE company_id=(SELECT id FROM companies WHERE slug='spit-braai-delivery')
  AND (quote_number LIKE 'QT-DEMO-%' OR notes LIKE '[DEMO_SEED]%');

-- 4. Hard-delete demo leads
DELETE FROM leads
WHERE company_id=(SELECT id FROM companies WHERE slug='spit-braai-delivery')
  AND notes LIKE '[DEMO_SEED]%';

-- 5. Hard-delete demo clients
DELETE FROM clients
WHERE company_id=(SELECT id FROM companies WHERE slug='spit-braai-delivery')
  AND notes LIKE '[DEMO_SEED]%';
```

## Verification after cleanup

```sql
WITH spit AS (SELECT id AS company_id FROM companies WHERE slug='spit-braai-delivery')
SELECT
  (SELECT COUNT(*) FROM clients WHERE company_id=(SELECT company_id FROM spit) AND notes LIKE '[DEMO_SEED]%') AS demo_clients,
  (SELECT COUNT(*) FROM leads   WHERE company_id=(SELECT company_id FROM spit) AND notes LIKE '[DEMO_SEED]%') AS demo_leads,
  (SELECT COUNT(*) FROM quotes  WHERE company_id=(SELECT company_id FROM spit) AND notes LIKE '[DEMO_SEED]%') AS demo_quotes,
  (SELECT COUNT(*) FROM orders  WHERE company_id=(SELECT company_id FROM spit) AND internal_notes LIKE '[DEMO_SEED]%') AS demo_orders;
-- Expect all four columns = 0 after cleanup
```
