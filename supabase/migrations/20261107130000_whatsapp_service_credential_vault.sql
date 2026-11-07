-- Keep WhatsApp API credentials and webhook verification material out of the
-- tenant-readable integrations JSON row. Apply this migration before deploying
-- the application change; it copies data and deliberately leaves source fields
-- in place for the short compatibility window.

CREATE TABLE IF NOT EXISTS public.whatsapp_credential_vault (
  integration_id uuid PRIMARY KEY REFERENCES public.integrations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  access_token_ciphertext text,
  app_secret_ciphertext text,
  webhook_verify_token_ciphertext text,
  webhook_verify_token_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_credential_vault_nonempty CHECK (
    access_token_ciphertext IS NOT NULL OR app_secret_ciphertext IS NOT NULL OR
    webhook_verify_token_ciphertext IS NOT NULL OR webhook_verify_token_hash IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_credential_vault_company
  ON public.whatsapp_credential_vault(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_credential_vault_verify_hash
  ON public.whatsapp_credential_vault(webhook_verify_token_hash)
  WHERE webhook_verify_token_hash IS NOT NULL;

ALTER TABLE public.whatsapp_credential_vault ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_credential_vault FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_credential_vault TO service_role;

COMMENT ON TABLE public.whatsapp_credential_vault IS
  'Encrypted WhatsApp API and webhook credentials. Client roles have no grants or RLS policies; server access uses service_role only.';

INSERT INTO public.whatsapp_credential_vault (
  integration_id, company_id, access_token_ciphertext, app_secret_ciphertext,
  webhook_verify_token_ciphertext, webhook_verify_token_hash
)
SELECT
  i.id,
  i.company_id,
  NULLIF(i.credentials->>'accessTokenEncrypted', ''),
  NULLIF(i.credentials->>'appSecretEncrypted', ''),
  NULLIF(i.settings->>'webhookVerifyTokenEncrypted', ''),
  NULLIF(i.settings->>'webhookVerifyTokenHash', '')
FROM public.integrations AS i
WHERE i.integration_type = 'whatsapp'
  AND (
    NULLIF(i.credentials->>'accessTokenEncrypted', '') IS NOT NULL OR
    NULLIF(i.credentials->>'appSecretEncrypted', '') IS NOT NULL OR
    NULLIF(i.settings->>'webhookVerifyTokenEncrypted', '') IS NOT NULL OR
    NULLIF(i.settings->>'webhookVerifyTokenHash', '') IS NOT NULL
  )
ON CONFLICT (integration_id) DO UPDATE SET
  company_id = EXCLUDED.company_id,
  access_token_ciphertext = COALESCE(public.whatsapp_credential_vault.access_token_ciphertext, EXCLUDED.access_token_ciphertext),
  app_secret_ciphertext = COALESCE(public.whatsapp_credential_vault.app_secret_ciphertext, EXCLUDED.app_secret_ciphertext),
  webhook_verify_token_ciphertext = COALESCE(public.whatsapp_credential_vault.webhook_verify_token_ciphertext, EXCLUDED.webhook_verify_token_ciphertext),
  webhook_verify_token_hash = COALESCE(public.whatsapp_credential_vault.webhook_verify_token_hash, EXCLUDED.webhook_verify_token_hash),
  updated_at = now();

NOTIFY pgrst, 'reload schema';
