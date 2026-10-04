# Apply the company payment fixes

The code needs **10 new migrations**, from `20261003110000` through `20261004100000`.
The ordered script also includes the two idempotent payment prerequisites `20260925150000` and `20261001000000`, because the target database reported that `public.payment_attempts` was missing. They have not been applied to the company Supabase database.
The full ordered script is [LOCAL_PAYMENT_MIGRATIONS.sql](../LOCAL_PAYMENT_MIGRATIONS.sql).

## Existing company database

1. Back up the target database and apply these changes to its test/staging copy first.
2. Check its migration history in Supabase SQL Editor:

   ```sql
   select version
   from supabase_migrations.schema_migrations
   order by version desc;
   ```

   Confirm the older base tables `public.payments` and `public.payment_gateways` exist. The bundle creates the missing `public.payment_attempts` prerequisite before defining settlement functions. If the previous run failed with `relation "public.payment_attempts" does not exist`, its transaction was aborted; use the updated bundle below.

3. If the repository's older base schema is installed and **none of the ten new migrations has been applied**, paste the contents of `LOCAL_PAYMENT_MIGRATIONS.sql` into SQL Editor and run it once. It first installs the two idempotent payment prerequisites, then the ten new migrations in one transaction. An error rolls back the whole bundle; resolve it before deploying the matching code.
4. If any of the ten new migrations are already installed, apply **only the missing files**, in filename order, from `supabase/migrations`. Apply either prerequisite individually only if it is missing from the target database.
5. Deploy the matching application code and follow the [payment smoke checks](payments-payfast-eft-audit.md#deployment-smoke-check), including a sandbox callback and an EFT review.

Choose the individual migration runner or the bundle. Do not run both. SQL Editor/bundle execution does not register versions in `supabase_migrations.schema_migrations`; record the applied files with your deployment process so a later migration runner does not replay them. If an earlier bundle was run manually, migration history alone will not show it.

The bundle supplies the payment attempts/gateways migration `20260925150000` and webhook guard `20261001000000`. Existing base payment tables, enums, gateway schema, and invoice/order triggers must already exist. This bundle is **not a fresh database setup**. Do not run the entire historical migration folder blindly: seven old version prefixes are duplicated. The [inventory](../LOCAL_MIGRATION_INVENTORY.txt) lists them.

With PostgreSQL tools and a connection URL set locally for the intended target, an alternative to SQL Editor is:

```powershell
psql --dbname=$env:PAYMENT_DB_URL --set=ON_ERROR_STOP=1 --file .\LOCAL_PAYMENT_MIGRATIONS.sql
```

Never paste the connection URL or password into a shared document. The command above is an instruction for your intended database; it was not run against your company account.

## Local tests without company credentials

```powershell
npm run test:payment-ledger
npm run test:payments
npm run test:payment-ui
```

The first command runs the 12-file bundle on a disposable schema fixture in PGlite. For simultaneous requests against an isolated **local PostgreSQL** server, create a database named `payment_fixture`, set `PAYMENT_TEST_DATABASE_URL` to its local connection URL, then run:

```powershell
npm run test:payment-postgres
```

That runner refuses remote hosts, creates a uniquely named test database and removes only that database after the run. It loads no `.env` file and uses no merchant or company data. These fixtures validate the payment bundle; they do not validate every historical migration or real provider callbacks.
