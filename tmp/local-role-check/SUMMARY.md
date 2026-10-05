# Local user and payment checks

Checked: 2026-10-04T11:16:10.040Z

App: http://localhost:3001

- 11/11 authorized test roles logged in; their separate browser windows remain open.
- 22/22 checked pages loaded with HTTP 200, no captured browser exceptions and no failed local page/API responses.
- 11/11 payment-configuration permission checks matched expected statuses.
- 8/8 payment table/column presence checks passed. These presence checks do not verify all migration versions or policies.

## Roles

| Role | Portal check | Payment configuration API |
|---|---|---|
| company_admin | Pass | 200 (expected 200) |
| admin | Pass | 200 (expected 200) |
| kitchen_staff | Pass | 403 (expected 403) |
| kitchen_manager | Pass | 403 (expected 403) |
| waiter | Pass | 403 (expected 403) |
| driver | Pass | 403 (expected 403) |
| shopping_staff | Pass | 403 (expected 403) |
| cleaning_staff | Pass | 403 (expected 403) |
| cleaning_manager | Pass | 403 (expected 403) |
| client | Pass | 403 (expected 403) |
| super_admin | Pass | 400 (expected 400) |

Super admin without a selected company gets HTTP 400, as designed. Staff/client requests get HTTP 403. Admin requests get HTTP 200.

## Additional screens

- client: client-portal/billing ? Pass
- client: client-portal/quotes ? Pass
- client: client-portal/my-orders ? Pass
- company_admin: admin/quotes ? Pass
- company_admin: admin/quotes/new ? Pass

## Payment verification

- 257 Jest payment/refund/invoice checks passed.
- 42 isolated PGlite database checks passed; one multi-session PostgreSQL lock test was skipped.
- All 7 isolated Playwright payment UI tests passed on the final run.
- TypeScript, targeted ESLint, script syntax and git whitespace checks passed.

The first UI run found an EFT acknowledgement cleared by an immediate stale invoice refresh. The public invoice page now keeps the successful upload acknowledgement; the regression test checks stale refresh and subsequent pending-claim reload.

The first company-admin navigation timed out during cold compilation. Its repeated authenticated dashboard check returned HTTP 200; launch-status.json records that corrected result.

## Scope

- UI ran locally against the configured remote Supabase project. No migrations or company/payment settings were changed during these checks.
- Sessions were minted with the existing authorized login mechanism. No login email was sent.
- No quote was submitted, EFT claim confirmed, refund executed or gateway payment started.
- The configured company gateway is PayFast in live mode; real merchant callbacks, API access and deployment cron scheduling still need a controlled provider smoke check.
- The checked client has no linked bookings/quotes/invoices visible; populated invoice and payment interactions were tested using isolated UI fixtures.

## Artifacts

[Role details](report.json), [additional screen details](payment-pages.json), [schema presence](schema-readiness.json). Screenshots are in this directory.

To repeat the visible role checks:

```powershell
node scripts/open-all-users-local.mjs --base http://localhost:3001 --check
```
