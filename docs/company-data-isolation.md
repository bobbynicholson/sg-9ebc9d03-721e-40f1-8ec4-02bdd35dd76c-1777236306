# Company data isolation — 29 October 2026

The company isolation changes are implemented locally. The application and the four new database migrations have **not been deployed to production**. Deploy the updated application and migrations together to activate the complete protection.

## Access decision

A company account may read or change rows only within its stored company membership, subject to the existing role, branch and client rules. A company administrator has no authority over another company. Platform access requires the canonical `profiles.role = 'super_admin'`; changing a portal preference does not grant it. Service credentials remain server only, with request authorisation required before their use.

## Changes

| Area | Enforcement |
| --- | --- |
| Company tables | Restrictive SELECT/INSERT/UPDATE/DELETE policies require company membership alongside existing policies. An accidentally broad permissive policy cannot reopen access. |
| Company and staff profiles | Companies are scoped by their ID. Profile membership and ID cannot be changed directly, including the old NULL-company loophole. Staff cannot self assign privileged roles or change account access fields. |
| Role assignments | Only administrators can add or change department assignments. Tenant administrators cannot grant platform access. Staff management APIs apply privilege checks before using the service credential. |
| Existing platform preferences | The migration clears legacy `super_admin` preferences and department entries on accounts whose canonical role is not `super_admin`. |
| Child records | Import rows, line items, recipe ingredients, order histories, assignments and other child tables inherit their parent's company boundary. |
| Related records | Insert/update triggers reject business links across companies, including service writes and line items that inherit ownership through an order, recipe or shopping list. Existing unrelated legacy rows are not rewritten. |
| Database functions and views | Numbering functions check company membership. Token mint functions and webhook dispatch are service only. PUBLIC execution inheritance is explicitly revoked on selected privileged functions. Application views evaluate underlying permissions as the caller. Extension-owned metadata views are excluded using the extension-dependency catalog. |
| Documents and photos | Imports, purchase receipts, delivery evidence and damage photos become private buckets. An authenticated download endpoint checks the account and company/order before downloading with the caller's JWT. Legacy displayed URLs are upgraded when rendered. |
| Signup | An ID and email alone cannot retrieve or provision a company. Signup without an email-confirmed session uses a random 256 bit capability whose hash is bound to the newly created auth account, expires after 30 minutes and is accepted only before membership exists. Provisioning and welcome proofs are consumed separately. Existing company records require the owner's session. |
| Caches | API responses default to `private, no-store`. The PWA stops caching authenticated HTML, purges its previous cache version, and precaches the public sign-in shell without cookies. The middleware profile cache version is also advanced. |
| Local development | Localhost no longer silently skips authentication or supplies a fake platform administrator. Any development bypass requires `NEXT_PUBLIC_ALLOW_LOCAL_AUTH_BYPASS=true` on a loopback hostname, and is always disabled in production. Diagnostic APIs follow the same rule. |

Shared global catalogue/reference rows are allowed only for the tables explicitly listed in the migration and remain subject to their existing read policies. Shared rows cannot be changed by a company account.

## Evidence

The live inspection used authenticated sessions from two distinct companies and an anonymous client. It attempted foreign-company counts against **173 company-tagged tables/views**. Neither company session returned foreign rows. There was existing foreign-company data in 32 tested relations for the first company and 85 for the second. Query errors were recorded separately and do not count as successful coverage; five service-only payment relations returned errors, with one additional invoice query error for the second account.

A separate check traced child records through their owning order, recipe, import job, user or other parent. It returned no foreign-company child records or company records. Anonymous reads on relations without `company_id` returned only spatial reference data, public pricing and supported currencies. The storage inspection confirmed that the four document/photo buckets above were public.

These live reads describe the system before this patch. Privilege escalation and unauthorised write attempts were exercised only in the isolated fixture and mocked API checks, avoiding business data changes in production.

Validation passed:

- `npm run test:company-isolation`: **88 checks** — 24 isolated PostgreSQL/PGlite migration/rollout scenarios and 64 API/role/payment/chatbot unit checks.
- The same **24 migration/rollout scenarios passed on isolated PostgreSQL 16**, without skipped checks. This includes repeatable manual-bundle execution, all 14 structural verification results, rollback after a forced late error, and extension-view ownership regressions.
- TypeScript: `tsc --noEmit --incremental false --pretty false`.
- Targeted ESLint on the new security helpers and affected API handlers.
- Migration RLS guard and `git diff --check`.

The fixture applies the actual new SQL migrations, starts with deliberately broad legacy policies, and verifies company reads/writes, profile escalation, parent references, service-only token minting, numbering, private storage, view isolation and migration idempotence. It does not replace a migration run against a staging copy of the complete production schema.

The 30 October follow-up tested real company sessions against both development and production-mode local servers. Cross-company navigation, exports and authenticated file downloads were denied. **Direct storage downloads still succeeded against the connected database:** all four buckets remain public and the new company-boundary function is absent. This confirms the database rollout is still required. The private-storage migration also preserves CSV/Excel uploads while allowing receipt images and PDF files in the imports bucket. See [the verification report](company-security-verification.md) for the full regression results and remaining rollout requirements.

## Deployment

For manual SQL Editor execution, use the complete [LOCAL_COMPANY_SECURITY_MIGRATIONS.sql](../LOCAL_COMPANY_SECURITY_MIGRATIONS.sql) bundle and [run instructions](company-security-migrations-how-to-run.md). It applies the four source migrations in a single transaction. The [verification SQL](../supabase/verification/company_isolation.sql) is a separate read-only query.

1. Deploy the updated application, including `/api/company-files`, the signup capability flow, staff management guards and updated file callers.
2. Apply these migrations in order through the project's database migration process:
   - `20261029120000_company_isolation_boundary.sql`
   - `20261029130000_private_company_documents.sql`
   - `20261029140000_company_rpc_and_view_boundaries.sql`
   - `20261029150000_company_relationship_integrity.sql`
3. Confirm direct public downloads from the four private buckets fail, authorised in-app downloads work, company A cannot access company B by changing IDs, and fresh signup works both with and without email confirmation.
4. Run `npm run check:company-security-deployment` with the target deployment's environment. It is read-only and exits with an error if required buckets, MIME formats or the company-boundary function are missing. A passing smoke check must be followed by the cross-company request checks; it does not inspect every policy.

The older `20261029100000` storage migration restricts listing but leaves the buckets public. The new private-bucket migration is required to block direct public downloads. [Supabase documents that public buckets bypass retrieval access controls.](https://supabase.com/docs/guides/storage/buckets/fundamentals)

Previously issued signed URLs are bearer credentials and may remain valid until their expiry. The old receipt reconciliation code issued URLs for ten years; this patch stops issuing them and converts stored links when displayed. Supabase documents that Storage uses an internal signing key, separate from Auth JWT keys. Immediate project-wide revocation requires Supabase support to rotate that internal key and clear the signed-URL CDN cache; rotating Auth JWT keys does not revoke those links. See [Supabase's revocation instructions](https://supabase.com/docs/guides/storage/serving/downloads#revoke-signed-urls) and the prepared support request in the rollout guide. Files already downloaded or held in an external cache cannot be recalled by application access rules.

The restrictive policy design follows [PostgreSQL's policy composition rules](https://www.postgresql.org/docs/current/sql-createpolicy.html): restrictive policies are combined with AND alongside the existing permissive grants.
