# Operator runbook -- outstanding actions as of 2026-05-18

This is the punch list of platform-level actions only the operator
(Bobby) can complete. Each task has the **why**, the **exact steps**,
the **how to verify it landed**, and a **rollback** where relevant.

Most of these are env-var changes on Vercel, DB function clicks in
the Supabase dashboard, or one-shot SQL.

Source of truth for what's pending: audit Appendix §A.7 (operator
actions outstanding) + §A.13 (cron health follow-ups).

---

## 1. Rotate `SUPABASE_SERVICE_ROLE_KEY`

**Why.** The service-role key was pasted into a chat session during
config (per running-todo). Anyone with that chat history can act as
service-role across every tenant. Audit finding **P0-19**.

**Steps**

1. Supabase dashboard -> project `cateringms2`
   (`vsuyzovzqtrngorpqnhy`) -> Project Settings -> API.
2. Click "Roll" next to the `service_role` key. Confirm.
3. Copy the new key.
4. Vercel dashboard -> CateringMS project -> Settings -> Environment
   Variables -> Production scope. Edit `SUPABASE_SERVICE_ROLE_KEY`,
   paste the new value, save.
5. Trigger a redeploy (Vercel auto-redeploys on env-var change, but
   double-check the latest production deploy is "Ready" with the
   new env var, not the old one).

**Verify**

- Hit `https://cateringms.com/api/cron/process-email-queue` signed
  in as super_admin. Should return 200 with `{ok: true, ...}`. A
  401 means the cron path Vercel uses is still on the old key (rare
  - the super_admin manual path uses the session, not the bearer).
- DB: `SELECT max(created_at) FROM audit_logs WHERE action='cron.process-email-queue';`
  - rows landing every 15 min from Vercel cron after the redeploy.

**Rollback**

- The previous key is invalidated the moment you click Roll. There's
  no rollback path; if Vercel ends up on the new key but Supabase
  hasn't propagated, fall back to the platform's normal deploy
  rollback rather than reverting the key.

---

## 2. Clear `DEV_RETURN_MAGIC_LINK` from Vercel production

**Why.** When set truthy, `/api/auth/client-magic-link` returns the
magic link in the response body so anyone hitting that endpoint can
log in as anyone else with one click. The code now hard-gates this
on `NODE_ENV !== 'production'` (PR `2991dda`, P0-18) so it's safe
already, but the env var should still be cleared so nobody
accidentally turns it on for a "quick test" later.

**Steps**

1. Vercel dashboard -> CateringMS -> Settings -> Environment
   Variables.
2. Find `DEV_RETURN_MAGIC_LINK`. Delete (not "edit to empty" -
   delete the row).
3. Save. Vercel auto-redeploys.

**Verify**

- Trigger a client magic-link via `/{slug}/client/login`. The
  response JSON must NOT contain a `magic_link` field. Only an
  `{ok: true}`.

---

## 3. Populate `PAYFAST_ALLOWED_IPS` on Vercel production

**Why.** The PayFast IPN webhook (`/api/webhooks/payment-confirmation`)
verifies the signature, but also expects to reject IPs not in the
PayFast egress range. Without the env var set, the IP gate is
disabled (signature + dedup still defend the webhook, but the IP
gate is the third layer). Audit finding **P0-11**.

**Steps**

1. Look up the current PayFast IPN egress IPs:
   <https://developers.payfast.co.za/documentation/#ipn-secure>
2. Vercel dashboard -> CateringMS -> Settings -> Environment
   Variables -> Production scope.
3. Add `PAYFAST_ALLOWED_IPS` = comma-separated list (no spaces).
   Example: `41.74.179.194,41.74.179.196,41.74.179.198,41.74.179.200`
4. Save.

**Verify**

- After next PayFast sandbox test, search Vercel function logs for
  `[webhooks/payment-confirmation]` - successful runs no longer log
  "PAYFAST_ALLOWED_IPS unset, IP gate disabled".

---

## 4. Set Xero / QuickBooks OAuth env vars

**Why.** PR `e1db025` (Phase 3, P2F-5) shipped server-side OAuth
initiator endpoints for both providers. They need three env vars
each to actually exchange code for tokens.

**Steps**

For Xero (when activating):

1. Register a new app at <https://developer.xero.com/myapps>.
2. Callback URL: `https://cateringms.com/api/accounting/xero/callback`.
3. Copy the Client ID and Client Secret.
4. Vercel env vars (Production scope):
   - `XERO_CLIENT_ID` = `<from Xero>`
   - `XERO_CLIENT_SECRET` = `<from Xero>`
   - `XERO_REDIRECT_URI` = `https://cateringms.com/api/accounting/xero/callback`

For QuickBooks (when activating):

1. Register at <https://developer.intuit.com>.
2. Callback URL: `https://cateringms.com/api/accounting/quickbooks/callback`.
3. Vercel env vars:
   - `QUICKBOOKS_CLIENT_ID`
   - `QUICKBOOKS_CLIENT_SECRET`
   - `QUICKBOOKS_REDIRECT_URI`

**Verify**

- Tenant signs in, hits `/admin/integrations`, clicks Connect Xero
  / QuickBooks. Redirect should land on the provider's consent
  screen, not on a 500.

**Until done.** The Zapier path on `/admin/integrations` covers
end-to-end use; native one-click is the polish, not the blocker.

---

## 5. Verify Spit Braai's Resend domain

**Why.** `spitbraaidelivery.co.za` has been stuck at
`resend_domain_status='pending'` since 2026-05-15. Until verified,
every queued email fails. The new `verify-pending-domains` cron
(PR #39, hourly) will auto-flip this once Resend's verifier sees
the records propagate -- but DNS can lag for hours, so a manual
nudge speeds things up.

**Steps**

1. Sign in to Resend dashboard (the platform owner's account holds
   the `RESEND_API_KEY`).
2. Find domain `spitbraaidelivery.co.za`. Look at the DNS records
   panel.
3. Each record (DKIM, SPF MX, SPF TXT) shows a "verified" /
   "pending" badge. If any are still "pending" after 24h:
   - Confirm Callum actually added them at the registrar.
   - Try the resolver yourself: `dig +short resend._domainkey.spitbraaidelivery.co.za TXT`
     should return the DKIM string.
4. Once all three flip to "verified", click "Verify domain" on
   the Resend dashboard. Status flips to `verified`.

**Verify** (without operator action, the cron does this hourly)

```sql
SELECT resend_domain_status, resend_domain_verified_at, is_verified
  FROM email_provider_settings
 WHERE company_id = '0e139a19-6526-4e1f-9bf7-87d6adbee5f8'
   AND provider = 'resend';
```

Once `resend_domain_status='verified'` lands, the next
`process-email-queue` tick will drain the 48-row backlog.

**Backlog control.** If you'd rather *not* drain the backlog
(events have passed, emails are stale), run before the next cron
tick:

```sql
UPDATE outgoing_email_queue
   SET status = 'cancelled',
       error_message = 'manual purge: catch-up suppressed'
 WHERE status = 'queued'
   AND created_at < now() - interval '24 hours';
```

---

## 6. Confirm Vercel cron is firing at all

**Why.** As of 2026-05-18 the heartbeat table had zero
`cron.*` audit_logs entries in the last 24h, which suggests Vercel
cron isn't firing. Could be missing `CRON_SECRET`, an unsupported
Vercel plan, or a `vercel.json` deploy that didn't propagate.

**Steps**

1. Vercel dashboard -> CateringMS -> Settings -> Environment
   Variables -> Production. Confirm `CRON_SECRET` is set to a
   non-empty value. If absent, generate a random string (e.g.
   `openssl rand -hex 32`), paste it, save.
2. Vercel dashboard -> CateringMS -> Settings -> Cron Jobs. Confirm
   the 26 entries (from `vercel.json`) are listed with their next
   firing time. The latest one is `/api/cron/verify-pending-domains`
   (added in PR #39).
3. If the page is empty / shows "no crons", your Vercel plan
   doesn't include cron. Upgrade or move scheduling external.

**Verify after waiting an hour**

```sql
SELECT action, max(created_at) AS most_recent, count(*) AS runs
  FROM audit_logs
 WHERE action LIKE 'cron.%'
   AND created_at > now() - interval '1 hour'
 GROUP BY action ORDER BY action;
```

Should list all 26 crons. Missing entries == cron isn't firing for
that path. The 5-minute crons (`check-en-route`) should have ~12
runs per hour; the 15-min crons ~4; the daily ones may have 0 if
they fired before the window. Run again after 24h for the daily set.

---

## 7. Schedule `prune_api_key_rate_limits` cron

**Why.** PR `9fb45a4` (Phase 3, P2F-2) added a DB function that
deletes rate-limit rows older than 24h. Without a cron caller, the
`api_key_rate_limits` table grows unbounded (every API call
inserts a row, the function trims it nightly).

**Steps**

This wasn't added to `vercel.json` in the original PR. Two paths:

- **Quick.** Add it manually to `vercel.json` and PR:

  ```json
  {
    "path": "/api/cron/prune-api-key-rate-limits",
    "schedule": "0 2 * * *"
  }
  ```

  …then create `src/pages/api/cron/prune-api-key-rate-limits.ts` as
  a thin wrapper around `requireCronAuth` + `recordCronHeartbeat`
  + `sb.rpc("prune_api_key_rate_limits")`. (Mirrors
  `archive-old-gps-logs.ts` exactly.)

- **Manual interim.** Run the SQL nightly via Supabase dashboard or
  `psql`:

  ```sql
  SELECT prune_api_key_rate_limits();
  ```

**Verify**

```sql
SELECT count(*) FROM api_key_rate_limits;
-- should not grow unbounded; expect a few hundred at most per active tenant.
```

---

## 8. Wire PayFast Query API for reconciliation backstop

**Why.** PR `4881723` (Phase 4, P1-40) stubbed a daily
reconciliation cron that walks orders with `payment_status='pending'`
and queries PayFast's Query API to catch missed IPNs. The stub
expects `PAYFAST_QUERY_API_USERNAME` and `PAYFAST_QUERY_API_PASSWORD`
env vars. Until set, the cron skips the API call and just logs
"missing PayFast Query credentials".

**Steps**

1. PayFast merchant dashboard -> Settings -> Integration ->
   "Use Query API" toggle. PayFast issues a separate username +
   password pair for the Query API (different from the merchant
   key used for the standard IPN signature).
2. Vercel env vars (Production):
   - `PAYFAST_QUERY_API_USERNAME` = `<from PayFast>`
   - `PAYFAST_QUERY_API_PASSWORD` = `<from PayFast>`

**Verify**

```sql
SELECT details FROM audit_logs
 WHERE action = 'cron.reconcile-payfast'
 ORDER BY created_at DESC LIMIT 1;
```

`details.tenants_checked > 0` AND no "missing PayFast Query
credentials" entry == working.

---

## 9. Surface magic-link request form on `/c/account`

**Why.** PR `b0d9bda` (Phase 4, P1-22) added the API endpoint
`POST /api/client-tokens/request` that mints a fresh magic link
on demand. Until a UI surfaces the form, repeat customers have to
phone the catering company.

**Steps**

UI work. Add an input + button to `src/pages/c/account.tsx` that
posts `{email}` to the endpoint and shows a "check your inbox"
toast on success. ~30 lines.

**Skipped this round.** Bobby has the running-todo capturing the
broader "repeat customer magic-link auto-send" scope; this is the
explicit-request escape hatch for when the auto path hasn't fired
yet.

---

## 10. Set `MIDDLEWARE_PROFILE_SECRET`

**Why.** PR `9afe16c` (Phase 9, P2-15) caches the middleware
profile lookup in a signed cookie keyed off this secret. Without
the env var set, the middleware falls back to the slow path (3
sequential DB round-trips per protected request).

**Steps**

1. Generate a random string: `openssl rand -hex 32`.
2. Vercel env vars (Production + Preview):
   - `MIDDLEWARE_PROFILE_SECRET` = `<random hex>`

**Verify**

Hit any protected admin route. The first response sets a
`mw_profile_sig` cookie. Subsequent requests should be ~50ms
faster on the middleware step (visible in Vercel function logs).

**Rotation.** Rotating this invalidates every active session's
profile cache; users keep their auth session but the middleware
re-fetches their profile on the next request. Low-impact, do it
when you rotate the service-role key.

---

## 11. Manual Safari verification of the public quote print path

**Why.** PR `a3d10b4` (Phase 10, P2-01) shipped a CSS-only fix
for the print-path layout on Safari. Chromium-based browsers were
already fine. The fix needs eyes-on verification on a real Mac
because Safari's print engine is too quirky to trust automated
tests.

**Steps**

1. On a Mac in Safari: open any public quote URL with `?print=1`
   appended -- e.g.
   `https://cateringms.com/q/QUO-2026-001?print=1`
2. Confirm:
   - PDF preview opens automatically.
   - Tenant logo + primary colour render correctly.
   - All quote line items, totals, T&Cs visible.
   - No clipped sections at page breaks.
3. Test print "Save as PDF" in Safari -- confirm the saved file
   matches the in-browser preview.

**Skipped this round.** Operator-only, needs hardware I don't have.

---

## Maintenance: heartbeat health check

Quick query the operator can run anytime to see which crons
fired in the last 24h. Save this somewhere accessible:

```sql
SELECT
  action,
  count(*)             AS runs_24h,
  max(created_at)      AS most_recent_fire,
  max(details->>'status') AS last_status,
  max(details->'errors_count')::int AS last_errors_count
FROM audit_logs
WHERE action LIKE 'cron.%'
  AND created_at > now() - interval '24 hours'
GROUP BY action
ORDER BY action;
```

A green-light platform has every cron name in the result with
sensible run counts:

| Schedule         | Expected runs per 24h |
|------------------|-----------------------|
| `*/5 * * * *`    | ~288 (check-en-route)  |
| `*/15 * * * *`   | ~96                    |
| `30 * * * *`     | ~24                    |
| `0 * * * *`      | ~24 (auto-complete, verify-pending-domains, etc.) |
| daily            | 1                      |
| weekly           | 0 outside of run day  |

Missing rows or stale `most_recent_fire` == something to
investigate.

---

## ENCRYPTION_KEY for accounting OAuth tokens (TIGHTEN I.105, 2026-06-02)

**Why.** Before TIGHTEN I.105 the Xero / QuickBooks OAuth refresh
tokens stored in `accounting_integrations.access_token` /
`refresh_token` were only Base64-encoded - effectively plaintext.
Anyone with DB read access could impersonate every connected tenant
against their accounting provider.

The fix swaps in AES-256-GCM with a versioned `v1:<iv>.<tag>.<ct>`
storage format. The cipher needs a 32-byte symmetric key, supplied via
the `ENCRYPTION_KEY` env var.

**Behaviour:**

| Environment        | ENCRYPTION_KEY set? | What happens                                    |
| ------------------ | ------------------- | ----------------------------------------------- |
| Vercel production  | yes                 | AES-GCM encryption works as designed.           |
| Vercel production  | no                  | First OAuth call throws + logs a clear error.   |
| Vercel preview     | no                  | Warns at boot, falls back to derived placeholder. Build still succeeds. |
| Local dev / tests  | n/a                 | Falls back to derived placeholder.              |

**Steps**

1. Locally, generate a 32-byte random key:

   ```bash
   openssl rand -hex 32      # 64 hex chars, eg. e3a7...d4b1
   # OR
   openssl rand -base64 32   # 44 base64 chars, eg. R4f8...wPq8=
   ```

   Either format is accepted by `loadEncryptionKey()`. Keep the
   exact string - case-sensitive.

2. Vercel dashboard -> CateringMS project -> Settings -> Environment
   Variables -> **Production** scope. Add:

   - **Name**: `ENCRYPTION_KEY`
   - **Value**: the string from step 1
   - **Environment**: Production only at first. Set in Preview too
     if you want preview deploys to use a real key.

3. Redeploy production (Vercel auto-redeploys on env-var change).

**Verify**

1. Connect a Xero or QuickBooks tenant through the live admin UI
   (`/admin/integrations`).
2. In Supabase SQL editor, inspect the row:

   ```sql
   SELECT id, provider, left(access_token, 5) AS prefix
   FROM accounting_integrations
   WHERE is_active
   ORDER BY created_at DESC
   LIMIT 5;
   ```

   The `prefix` should read `v1:`. Anything else (eg. raw base64) means
   either the encryption isn't firing or you're looking at a row from
   the pre-I.105 era - re-disconnect + reconnect to force a re-encrypt.

3. Disconnect + reconnect a tenant. Both flows should complete without
   errors and Supabase data API logs should NOT show any
   `[accountingIntegrationService] ENCRYPTION_KEY env var is missing`
   warnings.

**Rotation**

The storage format is versioned. To rotate keys later:

1. Set a new `ENCRYPTION_KEY` in Vercel (don't delete the old one
   yet - move it to `ENCRYPTION_KEY_PREVIOUS` for the rotation window).
2. Ship a follow-up that reads `ENCRYPTION_KEY_PREVIOUS` as a fallback
   in `decryptOne()`. Each `storeOAuthTokens` call upgrades the row to
   the new key.
3. After all rows have been re-encrypted (run a SELECT to confirm
   `v1:` ciphertext prefixes everywhere), remove
   `ENCRYPTION_KEY_PREVIOUS`.

**Rollback**

Don't. The previous Base64-only "encryption" was a security incident.
If the new key is wrong, the throw at first call is loud and recoverable
(no data is corrupted; rotate to a fresh key, redeploy, reconnect).
