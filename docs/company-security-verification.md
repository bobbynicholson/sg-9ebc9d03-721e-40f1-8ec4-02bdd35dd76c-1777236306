# Company security verification — 30 October 2026

## Decision

The security changes are implemented and tested locally. **The connected database is not ready for a production go-ahead:** its four document buckets are still public, and direct storage access from the other company succeeded. The new application guards correctly deny that same request through the application endpoint.

The four security migrations must be applied through the database deployment process, alongside the application release, and the deployed system must be checked again. This workspace has a Supabase API service key but no database migration connection. No production migration or application deployment was performed. Tests cannot provide a permanent 100% security guarantee.

## Automated results

| Check | Result | Evidence under `tmp/security/` |
| --- | --- | --- |
| Complete application Jest suite | 1,457 passed across 190 suites | `full-jest-final.log` |
| Company security command, including manual rollout | 88 passed: 24 migration/rollout scenarios plus 64 API/role/payment/chatbot checks | `postgis-view-security-tests.log` |
| Actual SQL migrations and manual bundle on isolated PostgreSQL 16 | 24 passed, no skips | `postgres-view-regression-tests.log` |
| Broader database fixtures | 168 passed, one PostgreSQL-specific scenario skipped | `database-regression-verification.log` |
| Payment database checks on PostgreSQL 16 | 44 passed, including the locked-worker scenario skipped by the embedded fixture | `postgres-payment-regression.log` |
| PDF layout checks | 81 passed | `pdf-verification.log` |
| Customer identity browsers | 2 passed, desktop and mobile | `customer-identity-ui-final.log` |
| Document import browsers | 4 passed, desktop and mobile | `document-import-ui-final.log` |
| Sitting and driver browsers | 4 passed, desktop and mobile | `sitting-ui-final.log` |
| Quote and payment browsers | 23 passed, no failures | `payment-browser-final.log` |
| Production build with cached genuine fonts | Passed compilation, type validation and all 200 static pages | `production-build-final.log` |

Counts overlap: the complete Jest suite includes the targeted unit tests. The PostgreSQL runs repeat some embedded-database scenarios. These numbers should not be added together as distinct security cases.

All four browser suites passed: **33 checks** in total.

The ordinary production-build attempt could not download Inter/Fraunces from Google Fonts (`ENOTFOUND`/connection reset). Verification therefore used Next's font test transport with genuine WOFF2 files cached from an earlier local build. No application font imports or deployment configuration were changed for this workaround. The cached-font build validates application compilation and generation, but does not verify the unavailable external font download.

Migration RLS, realtime channel and status-filter guards passed. Targeted lint passed with existing hook/type warnings. The UI detector reported no findings for the quote page, invoice payment page and item editor.

## Real company sessions

Two existing active company administrators from different companies were tested in separate browser contexts, with an additional anonymous context. The local servers used real authentication and the connected database. One company's billing restriction was preserved; its positive navigation check used the permitted account-settings page.

Both development and production-mode checks returned **19 passed and one failed**:

- Own-company navigation remained authorised; another company's slug redirected away.
- Foreign-company exports returned 403 with `private, no-store`.
- Platform configuration access returned 403 for both company administrators.
- Foreign document requests through `/api/company-files` returned 404.
- Anonymous file/provisioning requests returned 401; knowing an existing user ID and email did not retrieve a company.
- Anonymous localhost diagnostic APIs returned 404.
- Own-company temporary uploads and application downloads succeeded. Foreign uploads were denied, and changing browser accounts did not retain the prior company's export authority.
- **Failed live check:** direct storage SDK download of the other company's temporary file returned 200. A public object request also returned 200. The private-bucket migration is not active on this database.

Evidence: `live-app-verification.json`, `production-app-verification.json`, and `deployment-smoke-check.log`. The read-only deployment smoke check currently passes only 1/7 prerequisites: the development bypass is disabled. The other six checks identify the pending bucket, MIME and schema changes.

Only generated, randomly named verification files were uploaded under `security-verification/` and removed in cleanup. No existing business records were edited. Authentication used generated magic links without sending email. Payment and email browser calls used local mocked responses; no merchant charge or customer email was sent.

The temporary application servers and isolated PostgreSQL server were stopped. Automatic approval review blocked removal of the temporary PostgreSQL folder with a generic policy rejection; the stopped fixture cluster remains under `tmp/security/pg-cluster` with the verification evidence.

## Additional fixes found while testing

1. Removed implicit localhost authentication skips and fake platform sessions. Development opt-in now requires an explicit flag and a loopback hostname; production always denies the bypass.
2. Corrected quote and invoice payment displays so an active online provider suppresses manual EFT instructions. Configured EFT fallback remains available when online checkout is unavailable.
3. Corrected the quote item editor's mount effect: React StrictMode previously marked untouched menu/equipment lines as edited. Opening a change form now preserves untouched items and keeps short-message validation active. Added regression tests for mounting, quantity changes and removing the final item.
4. Updated stale browser expectations to the existing product contract in `PRODUCT.md`: clients read staff-approved serving times and request changes in notes. They do not edit the schedule during public acceptance. Existing API tests also verify that crafted client timing fields cannot overwrite the staff plan.
5. Updated driver-picker browser interactions for the existing popover control, retaining assertions for independent delivery/collection assignments, refused-save input retention and mobile overflow.
6. Added `npm run check:company-security-deployment`, a read-only check that exits nonzero when rollout prerequisites are missing.

The initial browser failures and intermediate reruns were used to identify these issues; final results supersede them. Stale tests were aligned with the documented product contract, rather than reintroducing client schedule editing.

## Reproduce locally

```powershell
node node_modules/jest/bin/jest.js --ci --runInBand --watch=false
npm run test:company-isolation
npm run test:pdf-layout
npm run test:payment-ui
node node_modules/@playwright/test/cli.js test --config scripts/tests/sitting-ui.config.mjs
node node_modules/@playwright/test/cli.js test --config scripts/tests/customer-identity-ui.config.mjs
node node_modules/@playwright/test/cli.js test --config scripts/tests/document-import-ui.config.mjs
npm run check:migration-rls
npm run check:realtime-channels
npm run check:status-filters
npm run check:company-security-deployment
```

The deployment check reads `.env.local` using Next's environment loader; already-set environment variables take precedence. Use the target environment's service key on the command line/server only, never in a browser bundle. It performs no writes and prints no keys or company records. Browser fixtures block external APIs and use synthetic data. Stop any earlier fixture server before starting its matching browser command.

The company migration fixture can additionally use a dedicated local PostgreSQL cluster. Set `COMPANY_ISOLATION_TEST_DATABASE_URL` to a loopback URL ending in `/company_isolation_fixture`, then run `node --test scripts/tests/company-isolation.test.mjs`. It creates and drops only its own uniquely named fixture database. Never point fixture runners at a production database.

## Required rollout and final checks

The [complete raw SQL bundle](../LOCAL_COMPANY_SECURITY_MIGRATIONS.sql), [14-check verification query](../supabase/verification/company_isolation.sql), and [manual rollout guide](company-security-migrations-how-to-run.md) are ready. The generated bundle has one transaction and was tested for repeatability and rollback after a late error. No live migration has been applied.

The first manual rollout attempt reported `must be owner of view geography_columns`. The original view loop was too broad and included PostGIS metadata. The corrected migration and verifier exclude extension members through `pg_depend`, while retaining protections and ownership errors for ordinary application views. The PostgreSQL regression reproduces this ownership failure with a synthetic extension-member view and a restricted operator, then verifies the corrected loop and complete bundle.

1. Apply the four migrations listed in [company-data-isolation.md](company-data-isolation.md) to a staging copy of the full schema; test normal staff, company administrator and legitimate platform administrator flows.
2. Deploy the application and migrations together. The private-storage endpoint and all updated upload/display callers must accompany the bucket change.
3. Run the deployment smoke check, then repeat two-company page, API, direct database and storage checks. Direct public URLs must fail; company A must be denied company B's storage object even when calling the SDK directly. Check all four buckets and own-company receipt image/PDF uploads.
4. Test fresh signup with email confirmation enabled and disabled, staff invitations, role changes and suspension. The unit tests cover these guards with mocks; no new live customer account was created during verification.
5. Inventory previously distributed signed URLs. Some legacy code issued ten-year links. Making a bucket private does not revoke an already-issued bearer link. Supabase support can rotate the internal Storage signing key and clear the signed-URL CDN cache; rotating Auth JWT keys does not revoke these links. See [Supabase's documentation](https://supabase.com/docs/guides/storage/serving/downloads#revoke-signed-urls) and the prepared support request in the rollout guide. Existing cached/downloaded copies cannot be recalled.
6. Confirm the deployment has its required accounting `ENCRYPTION_KEY`. The local production build warned that it was absent; the deployed environment was not inspected for that variable.

The isolated migration fixture deliberately includes broad legacy policies, foreign rows, inactive accounts and cross-company links. It exercises the actual four migration files, but it is not a clone of every production table, trigger or integration. Real merchant settlement, mail delivery, device-specific browsers, and long-running load/security monitoring remain outside this verification.
