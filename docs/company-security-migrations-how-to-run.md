# Run the company security migrations

## Complete raw SQL

Use [LOCAL_COMPANY_SECURITY_MIGRATIONS.sql](../LOCAL_COMPANY_SECURITY_MIGRATIONS.sql). It contains all four company-isolation migrations in order, inside **one transaction**. It checks required tables/buckets first, checks the resulting protections before commit, and requests a PostgREST schema refresh.

The script makes company documents private, restricts company reads/writes and role changes, validates cross-company relationships, and restricts privileged functions/views. It does not delete or rename Storage files. It does not deploy the application or revoke old signed URLs.

The view migration and verification query exclude extension members using PostgreSQL's extension-dependency catalog. This leaves PostGIS metadata views such as `geography_columns` under extension management. Ordinary application views are still protected, and ownership errors on those views remain errors. See [PostgreSQL's extension-dependency metadata](https://www.postgresql.org/docs/16/catalog-pg-depend.html).

### If the previous SQL failed on `geography_columns`

The original view loop mistakenly included extension-managed views. Replace the old SQL Editor contents with the regenerated raw SQL file. If you executed the complete one-transaction bundle, the error prevented its commit; earlier statements in that transaction were not committed.

Run this first to clear an aborted transaction, then paste and run the complete updated bundle:

```sql
ROLLBACK;
```

The standalone verification query has also been updated to use the same extension exclusions. Copy its current contents when verifying the rollout.

### Run in Supabase SQL Editor

1. Deploy the current application changes, including `/api/company-files` and the updated file upload/display callers, with this database rollout. Old application versions that still use public file links will need the updated download flow when the buckets become private.
2. Open **SQL Editor → New query** in the same Supabase project used by the application. Use the database administrator role, normally `postgres`.
3. Copy the **entire** raw SQL file, from `BEGIN` through the final result queries, into the editor. On Windows, this command copies it from the project directory:

   ```powershell
   Get-Content -Raw .\LOCAL_COMPANY_SECURITY_MIGRATIONS.sql | Set-Clipboard
   ```

4. Run the whole query. The final result is `company_security_rollout_committed`, followed by four bucket rows, all with `is_public = false`.
5. If an error occurs, the transaction must roll back. Run `ROLLBACK;` if the editor reports an aborted transaction, fix the reported prerequisite/error, then rerun the entire file. Do not execute only the statements after an error.

The bundle is generated from these canonical migrations:

| Order | Source migration |
| --- | --- |
| 1 | `20261029120000_company_isolation_boundary.sql` |
| 2 | `20261029130000_private_company_documents.sql` |
| 3 | `20261029140000_company_rpc_and_view_boundaries.sql` |
| 4 | `20261029150000_company_relationship_integrity.sql` |

If the normal migration runner has already applied all four, rerunning this bundle is unnecessary. The statements were tested for repeatability. Manual SQL execution does not mark those four versions as applied in `supabase_migrations`; a later normal migration run may safely repeat them. Use the project's normal migration-history workflow rather than editing its history table manually.

The bundle uses a 10-second lock timeout and a two-minute statement timeout. If it cannot obtain the required locks, it fails instead of waiting indefinitely. Retry the complete script during a quieter window.

## Verify after running

Run [supabase/verification/company_isolation.sql](../supabase/verification/company_isolation.sql) in SQL Editor. It is read-only. Expect **14 rows with `passed = true`**. These inspect database structure and privileges, not actual HTTP requests or old signed URLs.

Then run this read-only check from the application project using the target deployment's environment:

```powershell
npm run check:company-security-deployment
```

Expect **7/7** smoke checks to pass. The bundle requests an API schema refresh; allow that refresh to finish before retrying a missing-function result.

Repeat the real request checks after both the application and database rollout:

- Company A can open its own page, export and document.
- Company A cannot open company B's page, export or document, even when changing IDs or using the storage SDK directly.
- Anonymous public URLs for all four document buckets fail.
- Own-company receipt image/PDF and delivery-photo uploads/downloads still work.
- Staff invitations, signup with and without email confirmation, role switching and suspension behave correctly.

## Revoke previously issued long-lived signed links

SQL policies and a private bucket do not revoke already-issued signed URLs. Supabase Storage uses its own internal signing key; rotating the Auth JWT key does not invalidate those links. To revoke all signed Storage URLs, Supabase directs project owners to contact support for internal Storage-key rotation and CDN-cache clearing. This affects existing signed upload and download URLs throughout the project. See [Supabase's signed URL revocation documentation](https://supabase.com/docs/guides/storage/serving/downloads#revoke-signed-urls).

Prepared support request (send from the relevant project):

> Please rotate our project's internal Supabase Storage signing key and clear its signed-URL CDN cache to invalidate previously issued long-lived signed upload and download URLs. We are replacing company-document signed links with authenticated downloads. Please confirm when the rotation is complete so we can verify that old signed URLs return 404 and authenticated downloads still work.

Do not rename files by changing `storage.objects` directly. A targeted object move/rename must use Storage operations and update every application reference; it is not part of this SQL rollout.

Separately, confirm the production deployment has the existing accounting integration's required `ENCRYPTION_KEY`. Its value was absent locally; the actual deployed environment has not been inspected. Database migrations do not set application environment variables.

## Local verification of this bundle

- Company security command: **88 checks passed** (24 SQL scenarios plus 64 targeted unit checks).
- The same **24 SQL scenarios passed on isolated PostgreSQL 16**, including repeated bundle execution, all 14 verification-query results, rollback after a forced late error, and extension-view ownership regressions.
- The ownership regression uses a synthetic metadata view registered as an actual extension member, with a different owner and a restricted migration operator. It reproduces the reported ownership error and verifies the corrected loop and full bundle; it does not install a complete PostGIS distribution in the fixture.
- No live migration was performed while preparing these files.

Check that the generated SQL still matches the four source migrations:

```powershell
npm run check:company-security-sql
```

Regenerate after intentionally changing a source migration:

```powershell
node scripts/build-company-security-migration-bundle.mjs
```
