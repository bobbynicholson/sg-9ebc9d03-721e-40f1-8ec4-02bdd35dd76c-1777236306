# Credential vault operations

## Application encryption

`ENCRYPTION_KEY` is a server-only Vercel environment secret. It must never be
stored in Git, a database row, a browser `NEXT_PUBLIC_*` variable, or logs. New
application ciphertext uses AES-256-GCM with a fresh 96-bit nonce and a key id.
HKDF derives separate encryption and HMAC fingerprint keys from each 32-byte
master key. The credential ciphertext stays in the database; the master key
stays in Vercel.

The application reads the historical `v1` formats so existing records keep
working. New writes use the active key id. For a staged key change, add a
`CREDENTIAL_ENCRYPTION_KEYS` JSON object containing the old and new key ids,
set `CREDENTIAL_ENCRYPTION_ACTIVE_KEY_ID` to the new id, and deploy. Keep the
old key available until every old ciphertext and keyed lookup has been
re-encrypted. **Do not replace or remove `ENCRYPTION_KEY` by itself:** older
accounting, WhatsApp, supplier, and billing records still need its legacy key.
Before retiring a key, run and verify a full data re-encryption and hash
backfill for every credential table. The application currently supports the
read-old/write-new portion of rotation; a full automated sweep and old-key
retirement are still an operational follow-up.

For stronger separation, use a managed KMS/secrets service as the key
encryption key and short-lived federated credentials from Vercel. That needs
cloud-account IAM and deployment setup; it is not active in this project yet.

## WhatsApp credentials

WhatsApp access tokens, Meta app secrets, and webhook verification tokens are
kept in `public.whatsapp_credential_vault`. RLS is enabled with no client
policies, and `anon`/`authenticated` have no table grants. Server routes use
the Supabase service role. `integrations.credentials` retains only the phone
number ID and business account ID; `integrations.settings` retains only
non-secret connection settings and verification time. The settings API never
returns the access token or app secret. It reveals the verification token only
when an authorized company admin explicitly asks for it.

### Deployment order

1. Apply `20261107130000_whatsapp_service_credential_vault.sql`. It creates
   the service-only table and copies encrypted values, leaving source fields
   available during rollout.
2. Deploy the application change. New connections write credentials only to
   the vault table. Existing encrypted rows can still be read while the
   compatibility window is open.
3. Let `/api/cron/secure-billing-vault` migrate any legacy plaintext verify
   tokens. Confirm its response reports no more WhatsApp rows to migrate.
4. Apply `20261107140000_remove_tenant_visible_whatsapp_credentials.sql`.
   Its guard fails if a source value has not been copied; then it removes the
   encrypted and legacy token fields from `integrations`.
5. Confirm both counts are zero before closing the change:

   ```sql
   select count(*) as remaining_source_secrets
   from public.integrations
   where integration_type = 'whatsapp'
     and (
       nullif(credentials->>'accessTokenEncrypted', '') is not null or
       nullif(credentials->>'appSecretEncrypted', '') is not null or
       nullif(settings->>'webhookVerifyToken', '') is not null or
       nullif(settings->>'webhookVerifyTokenEncrypted', '') is not null or
       nullif(settings->>'webhookVerifyTokenHash', '') is not null
     );

   select count(*) as client_select_privileges
   from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'whatsapp_credential_vault'
     and grantee in ('anon', 'authenticated')
     and privilege_type = 'SELECT';
   ```

The first result should be `0`; the second should be `0`. Do not apply the
cleanup migration before the new application deployment and backfill.

## Provider credentials

Use provider-issued tokens with only the scopes needed by the feature. Prefer
revocable, short-lived tokens when the provider supports them. On suspected
exposure, revoke and replace the provider token first, then update the
integration through its admin page. Do not paste tokens into support tickets,
SQL logs, chat, or deployment output. Vercel environment changes require a new
deployment before runtime functions use them.
