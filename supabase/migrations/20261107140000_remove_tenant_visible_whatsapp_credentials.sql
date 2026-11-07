-- Apply only after the application using whatsapp_credential_vault is live and
-- the secure-billing-vault worker has moved any legacy plaintext verify tokens.
-- The guard prevents dropping the final recoverable copy of any credential.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.integrations AS i
    LEFT JOIN public.whatsapp_credential_vault AS v ON v.integration_id = i.id
    WHERE i.integration_type = 'whatsapp'
      AND (
        (NULLIF(i.credentials->>'accessTokenEncrypted', '') IS NOT NULL
          AND v.access_token_ciphertext IS NULL) OR
        (NULLIF(i.credentials->>'appSecretEncrypted', '') IS NOT NULL
          AND v.app_secret_ciphertext IS NULL) OR
        (NULLIF(i.settings->>'webhookVerifyTokenEncrypted', '') IS NOT NULL
          AND v.webhook_verify_token_ciphertext IS NULL) OR
        (NULLIF(i.settings->>'webhookVerifyTokenHash', '') IS NOT NULL
          AND v.webhook_verify_token_hash IS NULL) OR
        NULLIF(i.settings->>'webhookVerifyToken', '') IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'WhatsApp credential vault backfill is incomplete; keep integrations credentials and settings intact';
  END IF;
END $$;

UPDATE public.integrations AS i
SET credentials = COALESCE(i.credentials, '{}'::jsonb) - 'accessTokenEncrypted' - 'appSecretEncrypted',
    settings = COALESCE(i.settings, '{}'::jsonb) - 'webhookVerifyToken' - 'webhookVerifyTokenEncrypted' - 'webhookVerifyTokenHash'
WHERE i.integration_type = 'whatsapp';

NOTIFY pgrst, 'reload schema';
