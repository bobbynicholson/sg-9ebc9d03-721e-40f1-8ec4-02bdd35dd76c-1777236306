# Company PayFast and EFT: configuration, recovery and checks

The identified company payment fixes are implemented locally. The new migrations have **not** been applied to a deployed database, and no live payment or provider-account configuration was changed. Offline verification passed **41 real PostgreSQL database scenarios**, plus the production build, TypeScript, targeted ESLint (no errors; existing warnings remain), migration RLS, status-filter and realtime-channel checks. Real provider callbacks, merchant history and the full target database migration chain still require deployment verification.

The full repository test run now passes: **602 tests across 72 suites**, including the previously failing audit-log destination and kitchen catalog/section checks. The payment command passes **241 tests across 21 suites**. All **five browser payment checks** pass with simulated API/provider responses and blocked external browser requests. Local database fixtures apply the 12-file payment bundle, not the complete historical migration chain.

## Correct customer flow

1. Company owner/admin saves **that company's** provider credentials in `/admin/payment-gateways` and activates the provider. Bank/EFT details are saved in `/admin/company-profile` or onboarding. Platform subscription payment credentials are separate.
2. The quote page shows available online payment options and company EFT details. The configured first payment amount appears with the total and remainder.
3. Client accepts the quote. The app creates/links the order and invoice and provides the invoice payment page.
4. Client chooses online checkout or EFT. Online checkout uses the company's saved merchant account. EFT displays bank details and the invoice number as the payment reference.
5. An online return URL alone means nothing financially. A verified provider callback or authenticated provider history recovery commits the payment, invoice totals, order payment fields and attempt success together.
6. For EFT, a claim/proof means **pending verification**. An authorized admin/owner checks the bank statement and confirms only money actually received. Confirm/reject is atomic and idempotent. Claims do not auto-credit an invoice.
7. Reaching the required first-payment threshold confirms a pending order. A partial payment below it does not. Payment does not complete an undelivered event. Separate deposit/final invoices contribute to the same order ledger.

## What must be configured

| Setting | Required action |
|---|---|
| Company PayFast account | Save the correct merchant ID, merchant key and the same passphrase configured on that merchant's PayFast account. Match test/live mode to the keys. Activate it. Each company receives funds into its own merchant account. |
| Canonical app origin | Set `NEXT_PUBLIC_APP_URL=https://your-public-domain`. Production webhook/return URLs must point at this deployed app. For local callback testing use a public HTTPS tunnel to the local app and its test database. A localhost URL cannot receive PayFast ITNs. |
| PayFast webhook | The checkout form automatically sends `notify_url=<app-origin>/api/webhooks/payment-confirmation`. This public POST endpoint must be deployed, reachable without login/basic-auth/proxy challenges, and excluded from CSRF rules that apply only to browser sessions. Setting a different URL in the gateway form does not change the trusted callback target. |
| PayFast recovery API | Confirm the merchant can call transaction history with its merchant ID/passphrase, and satisfy any merchant API access/IP restrictions. A checkout credential-format check does not prove history API access. Monitor HTTP/auth failures from reconciliation. |
| Database server key | Configure `NEXT_PUBLIC_SUPABASE_URL` and the **server-only** `SUPABASE_SERVICE_ROLE_KEY` (or supported service-key alias). Never put the service key or provider secrets into a `NEXT_PUBLIC_*` variable. |
| Cron authentication | Set a new private `CRON_SECRET` in the deployed app. If using GitHub fallback, save the same value in repository Actions secret `CRON_SECRET`. The source-code fallback secret has been removed. Manual triggers require the actual super_admin role, not a user-selected active role. Rotate any previously used public fallback value. |
| Recovery schedules | Deploy `/api/cron/reconcile-payment-events`, `/api/cron/reconcile-payfast`, and `/api/cron/reconcile-payment-attempts`. Vercel schedules are every 5 minutes; GitHub fallback includes all three in its 15-minute group. Check your hosting plan actually runs this cadence. |
| EFT bank account | Check bank name, account holder, account number, branch code, account type and instructions for this company. Incomplete current details cannot be combined with old invoice account details. EFT has no automatic bank webhook in this implementation. |
| Receipt email | Configure Resend (`RESEND_API_KEY`) or the company's SMTP provider. Receipts are in a durable outbox independent of payment settlement. Provider failure must not change paid status. |
| Optional source IP filter | `PAYFAST_ALLOWED_IPS` is optional. If used, keep it aligned with current official PayFast addresses; a stale filter rejects genuine callbacks. Live ITNs also use PayFast server-side validation in every environment. |

Local presence check on `.env.local`: Supabase URL/service key exist; `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` and `RESEND_API_KEY` are absent. This does not establish the production environment's configuration or whether SMTP is configured in the database. `.env.vercel.preview` is a separate file and does not establish production readiness.

If selecting other providers: Yoco registers `<app-origin>/api/webhooks/yoco-confirmation` and needs the returned signing secret. Stripe registers `<app-origin>/api/webhooks/stripe-confirmation` on the company's account and needs its signing secret; current handler supports PaymentIntent success/failure, Checkout completion/async success/async failure and expiration. Their exact account registrations also require provider smoke checks. The PayFast recovery worker is not a Yoco history integration.

## Migrations to run

For an **existing database with the repository's previous migrations applied**, run these in order, before deploying the changed application code:

| Migration | Purpose |
|---|---|
| `20261003110000_add_quote_initial_payment_amount.sql` | Quote first-payment amount |
| `20261003120000_update_payment_request_email_summary.sql` | Payment request totals/paid/remainder |
| `20261003130000_sync_order_financials_from_invoice.sql` | Initial shared invoice/order projection |
| `20261003140000_atomic_payment_settlement.sql` | Atomic gateway/EFT/credit settlement; correct historic triggers; durable verified events and receipt jobs; imported opening balances |
| `20261003150000_payment_recovery_workers.sql` | Persistent history cursors and leased receipt processing |
| `20261003160000_checkout_gateway_credential_versions.sql` | Private merchant/key/mode versions for in-flight checkouts |
| `20261003170000_atomic_company_gateway_configuration.sql` | Atomic gateway saves/activation and one-snapshot credential reads |
| `20261003180000_financial_write_permissions.sql` | Restrict financial writes to actual owner/admin roles; client ledger/attempt reads scoped to their own records |
| `20261004090000_idempotent_store_credit_checkout.sql` | Private replay record for partial credit payments; a lost response cannot repeat the same wallet debit |
| `20261004100000_refund_reconciliation_and_receipts.sql` | Evidence-based refund reconciliation with an atomic audit trail and durable refund receipts |

`LOCAL_PAYMENT_MIGRATIONS.sql` combines the two payment prerequisites listed below plus these ten new files in **one transaction** for review/run in the SQL editor or with `psql`. Do not run both the individual files and the bundle. The bundle is an operational SQL script; it does not add migration-history rows automatically. If your deployment uses the migration runner, use the individual migration files so its history stays accurate.

First inspect migration history:

```sql
select version from supabase_migrations.schema_migrations order by version desc;
```

The bundle includes the historical payment-attempt/gateway migration (`20260925150000_payment_attempts_and_gateway_requirements.sql`) and webhook uniqueness guard (`20261001000000_payment_webhook_idempotency_guard.sql`). Existing base payment/invoice fields, enums, gateway schema and triggers must exist. These twelve files are not a fresh-database bootstrap. Some long-lived duplicate payment data may require review; the new routines do not erase real payments or automatically refund excess money.

The local inventory contains **410** migration files. Seven historical version prefixes are duplicated; do not rename/replay them blindly without comparing applied history. `LOCAL_MIGRATION_INVENTORY.txt` lists every file and duplicate group. A full local Supabase migration reset was not run: Supabase CLI/config and a running Docker engine are absent. The isolated payment SQL tests are available immediately. Step-by-step instructions are in [payment-migrations-how-to-run.md](payment-migrations-how-to-run.md).

Financial write access now uses the actual profile role (owner, company_admin, admin, sales_admin, region_admin or super_admin), not a selected active role. Clients and operational staff cannot insert/confirm payments, change invoice finances or activate gateways directly through Supabase. Existing permissive policies are fenced by restrictive write policies; legitimate financial operations need one of these admin roles.

Gateway configuration, refund actions, cancellation/amendment reviews and proof access also check the actual role at the API boundary. Profile lookup failures return a retryable error. Selecting an administrative active role cannot grant financial access; an actual owner retains access when selecting a client view. Cross-company overrides are available only to an actual super_admin.

## Crash and failure outcomes

| Case | Expected behavior |
|---|---|
| Crash before checkout reaches the customer | No payment is inferred. A saved attempt remains trackable. |
| Customer pays while app is down | PayFast ITN retry can settle after restart. Authenticated merchant history also recovers a lost ITN. Browser return is read-only. |
| Crash after callback authentication, before receipt save | No HTTP 200; provider retry/history is required. |
| Crash after receipt save, before financial commit | Verified receipt remains pending; the recovery worker replays it. |
| Database error partway through settlement | Ledger/invoice/order/attempt/event completion roll back together. Callback returns a retryable error. |
| Commit succeeds but response is lost | Replay finds the provider transaction and repairs projections without adding the amount again. |
| Duplicate callbacks/concurrent worker replay | Transaction advisory lock and provider transaction uniqueness serialize settlement. |
| Prior order-only ledger insert with stale invoice/attempt | Duplicate replay links the invoice and repairs saved statuses. |
| Provider query/network failure | Cron reports an error; history cursor does not silently advance. Unknown attempts do not expire merely because time passed. |
| Paid candidate waiting for a webhook | It is rechecked. Validated Stripe API evidence can settle it; PayFast uses history. Yoco paid candidates remain unresolved until a verified event/operator reconciliation. |
| Provider switch, soft delete, merchant/mode edit | Saved gateway/credential version identifies the original checkout. Recovery scans inactive and historical PayFast accounts too. Upstream revocation of old keys can still require manual merchant reconciliation. |
| Client/operational staff tries direct database financial writes | Restrictive RLS blocks ledger, invoice and gateway writes; clients read only their own payments/attempts. |
| Invalid signature/tenant/reference/amount/currency | No financial settlement. API rejects the callback. |
| Customer cancels browser navigation after completing payment | Browser cancellation cannot undo a verified success. Late COMPLETE can recover a failed/expired attempt. |
| Client completes two distinct paid checkouts | Record both real charges, balance stays zero and excess is exposed/alerted. No automatic refund is performed. |
| EFT claim submitted repeatedly or concurrently | Reuse the outstanding pending claim; no financial credit before verification. |
| EFT confirm races reject | One action wins. Repeating the same action is idempotent; a conflicting terminal action is rejected. |
| Full payment for a future event | Money is paid; event is not marked completed before delivery. |
| Receipt/notification process crashes | Receipt job survives; lease expires and worker retries. In-app delivery is transactional and deduplicated. Resend uses a stable key per destination; SMTP or retries beyond provider key retention can deliver a duplicate email, never duplicate money. |
| Gateway configuration save or activation crashes | Metadata, mode and credentials save together; activation does not leave all gateways inactive after a failed switch. |
| A current EFT edit is incomplete | Do not show an account made by mixing current and historic bank fields. Owner must fix the details. |
| Invalid checkout amount or credit amount | Reject before financial writes; zero, non-finite and sub-cent payment inputs cannot silently become a default charge. Explicit zero credit preserves the wallet. |
| Credit covers a selected partial payment | Record only that selection; show the applied credit and remaining invoice balance without expecting a gateway redirect. |
| Partial-credit response is lost | The updated payment pages retain `checkout_request_id` for the same selection. `redeem_client_credit_once` replays the original result without another debit. Changing the selection/new payment uses a new key. Older API consumers must supply a stable UUID for retry protection. |
| Credit commits but gateway setup/tracking fails | Error response carries the recorded credit ID/amount. Payment pages show it and refresh the invoice; a failed redirect does not mean the credit was rolled back. |
| PayFast refund timeout, server error or ambiguous success body | Leave the refund processing; block retries/manual payout until the merchant outcome has been reconciled. |
| PayFast confirms refund but ledger completion fails or matches no row | Report reconciliation required, preserve provider evidence in the audit attempt, and never report a completed ledger without confirmation. |
| Refund completion or reconciliation loses its HTTP response | Repeating the same confirmed evidence is idempotent; one ledger completion, audit and refund receipt. |
| A refund payout is still in flight or old evidence is reused | Reconciliation cannot release a recent request or reuse evidence for a later operation; no automatic timeout retry. |
| Yoco callback has only checkoutId metadata | Resolve the saved attempt and original secret; validate its mode and tenant routing. |
| Yoco refund event / stale signature / forged callback | Refund events cannot add positive payments; signatures include webhook ID, timestamp and raw body with a three-minute freshness window. |
| Refund manual confirmation races automatic claim | Conditional status update has one winner; the losing request sends no receipt/audit of successful payment. Completed confirmations are idempotent. |

## Company refunds

Automatic refunds currently support PayFast. The service queries the original capture's refundable balance and payout method before claiming the refund. It refunds only an eligible amount directly to the original payment source, using the original checkout's merchant/mode snapshot when available. PayFast REST requests use the alphabetical API signature, integer cents, buyer notification and a bounded timeout. HTTP success alone does not establish a refund.

Amounts exceeding a single capture, exhausted refund balances, bank-payout details and other providers go to finance for manual reconciliation. This implementation does not split a refund over captures or automate Stripe/Yoco refunds. PayFast sandbox refunds are unsupported; their API formatting and failure cases were verified with mocks, not a live payout. Legacy captures without a versioned attempt depend on the company's saved PayFast account and may need merchant reconciliation after account changes.

For an unresolved `processing` refund, finance must check the original merchant's refund records. The Refunds & Credits screen now offers **Reconcile outcome**, requiring a provider/support reference, verification details and an explicit acknowledgement. Confirmed paid completes the existing refund; confirmed terminal failure releases it to pending. Missing/pending provider records do not establish failure. The service-only SQL function checks the actual finance role/company again, locks the row, waits at least two minutes after a recorded request and rejects reuse of evidence from an older attempt. Legacy rows without an operation timestamp cannot be released for a retry through this screen. A database operator must review those cases.

Reconciliation, its evidence, audit entry, invoice/order projection and refund receipt queue commit together. Automatic and manual completed refunds queue durable receipts as well. Receipt transport failure does not undo the refund; the normal worker retries delivery.

## Deployment smoke check

1. Apply migrations to a backed-up test database and deploy the matching code. Set the public origin and private cron secret.
2. Use two test companies with different merchants/bank details. Verify each quote/invoice shows its own account and no provider secrets in API responses.
3. Use a separate test company/invoice for sandbox payments: sandbox callbacks update that test data, but no real money is collected. PayFast's format-check button is not an end-to-end credential test.
4. Complete one sandbox checkout. Inspect its ITN log and confirm callback HTTP 200, one completed payment, correct invoice paid/balance, correct order threshold flags, and succeeded attempt. Confirm the same `payment_attempt_id` survives merchant history via `m_payment_id`/`custom_str5`.
5. Replay that verified callback. Confirm one ledger row and unchanged paid total. Change the provider/mode after checkout creation and verify the old checkout still uses its saved version.
6. Stop the **test** app before paying, restart it, then invoke recovery with the configured cron bearer. Confirm the missed payment is recovered. Run the merchant history API check separately; a working ITN does not prove API access.
7. Simulate a test database failure during invoice update. Confirm HTTP 503 and no partially committed ledger/attempt. Restore it and confirm receipt replay settles correctly.
8. Submit an EFT proof twice. Confirm one pending claim and unchanged paid balance. Confirm/reject from the same-company owner; check cross-company access is denied.
9. Check pending verified events, history errors and receipt errors. Confirm cron heartbeats continue after restart. Do not infer a worker is enabled merely because its endpoint exists.
   Also retry the same partial-credit request UUID after dropping its HTTP response: check one wallet debit and the correct remaining gateway amount. Test partial credit without an active gateway and verify the recorded payment remains visible. Use a fake refund transport to exercise rejection/timeout and ensure processing blocks a second payout; verify live refund eligibility separately without submitting a payout.
10. Only after these checks, the owner can make an approved small live transaction (PayFast live minimum is R5) and verify the merchant account received it. No live charge was performed during this audit.

## Read-only monitoring queries

Run as a database operator. Filter by company when investigating a particular tenant. These queries do not expose credentials.

```sql
select company_id, provider, transaction_id, created_at, last_checked_at, last_error
from public.payment_gateway_events
where processed_at is null order by created_at;

select source_id, gateway_id, next_date, page_offset, recent_offset, last_checked_at, last_error
from public.payfast_recovery_cursors order by last_checked_at nulls first;

select company_id, payment_id, kind, attempts, claimed_until, last_error
from public.payment_receipt_outbox
where delivered_at is null order by created_at;

select id, company_id, invoice_id, provider, status, provider_status, last_checked_at
from public.payment_attempts
where status = 'pending' order by created_at;

select id, company_id, invoice_number, total_amount, amount_paid, balance_due,
       greatest(0, amount_paid-total_amount) as overpayment_amount
from public.invoices where amount_paid > total_amount;

select id, company_id, order_id, amount, created_at, processed_at, gateway_response
from public.payments
where payment_type = 'refund' and payment_status = 'processing'
order by created_at;

select action, created_at, details
from public.audit_logs
where action in ('cron.reconcile-payfast','cron.reconcile-payment-events','cron.reconcile-payment-attempts')
order by created_at desc limit 30;
```

History scans prioritize the last two days and also persist a paginated historical cursor initialized from the earliest saved PayFast attempt (or 30 days for legacy accounts). A merchant without attempt metadata needs valid legacy app custom fields; unrelated merchant sales are not guessed into an invoice. Old legacy payments before this starting date need an operator to rewind the relevant history cursor. Persistent invalid history rows are reported for repair and do not silently disappear. Recovery depends on a surviving/restored database, reachable provider services, valid merchant API access and functioning schedules.

The production build also printed the existing accounting OAuth warning about a missing local `ENCRYPTION_KEY`. Accounting OAuth configuration was not changed; its production encryption key must be configured before using those integrations.

## Local verification

```powershell
npm ci
npm run test:payment-ledger
npm run test:payments
npm run test:payment-ui
node scripts/build-payment-migration-bundle.mjs --check
npx tsc --noEmit
npm run check:migration-rls
npm run check:status-filters
npm run check:realtime-channels
$env:NEXT_DIST_DIR='.next-payment-verify'
npm run build
```

The default ledger test uses pinned PGlite with an isolated schema and actual historical financial triggers, then applies the combined 12-file SQL script. It passes 40 scenarios and skips one PostgreSQL-only lock test. `npm run test:payment-postgres`, with a local `PAYMENT_TEST_DATABASE_URL` pointing to `payment_fixture`, runs the same fixture on actual PostgreSQL with separate connections: all 41 scenarios pass. The test runner creates a disposable database and refuses remote URLs. This still does not substitute for checking the full historical migration chain on the target Supabase test instance.

Browser checks use the actual Next invoice payment page with simulated API responses: EFT remains awaiting verification, credit-covered partial payment retains its balance, an unresolved return blocks another checkout, a retry retains its credit UUID, and committed credit remains visible after a gateway failure. They use dummy app credentials and block external browser requests; no charge, refund or email is sent.

GitHub CI now runs the payment/API tests, PGlite fixture, migration bundle consistency check actual PostgreSQL fixture using an isolated PostgreSQL 16 service, and simulated browser payment checks. The status-filter guard recognizes the new financial tables and attempt vocabulary. Build output uses a separate directory to preserve any running development server.

Yoco verification follows its documented ID/timestamp/body HMAC format and base64 secret. Credential checks use the documented read-only List webhooks endpoint. The Checkout API does not document a GET checkout status endpoint; the unresolved-session worker waits for a signed callback rather than calling a guessed endpoint or inferring payment from elapsed time. The separate Yoco business Payments API uses different credentials. Yoco recovery still requires provider webhook retry/replay; PayFast history recovery does not cover Yoco.

Official references: [PayFast ITN](https://developers.payfast.co.za/docs/itn-instant-transaction-notification/), [PayFast API/history](https://developers.payfast.co.za/api), [PayFast live/sandbox documentation](https://developers.payfast.co.za/docs?capcode=xMzF), [passphrase setup](https://support.payfast.help/portal/en/kb/articles/how-do-i-enable-a-passphrase-on-my-payfast-account-20-9-2022), [Yoco payment/webhook flow](https://developer.yoco.com/guides/online-payments/accepting-a-payment), [Yoco signature verification](https://developer.yoco.com/guides/online-payments/webhooks/verifying-the-events), [Yoco read-only webhook list](https://developer.yoco.com/api-reference/checkout-api/webhooks/list-webhooks), [Checkout versus business API](https://developer.yoco.com/api-reference/checkout-api), [Stripe session retrieval](https://docs.stripe.com/api/checkout/sessions/retrieve), [Resend idempotency retention](https://resend.com/changelog/idempotency-keys).
