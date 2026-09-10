-- Mandatory confidentiality copy for every tenant email.  Existing tenants
-- receive a conservative default immediately; company admins can replace it
-- with their attorney-approved wording in Settings -> Policies.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS confidentiality_notice text;

UPDATE public.companies
SET confidentiality_notice =
  'CONFIDENTIALITY NOTICE: This email and any attachments are intended solely for the named recipient and may contain confidential, privileged, or personal information. If you received it in error, please notify the sender immediately, delete it, and do not copy, disclose, distribute, or rely on its contents.'
WHERE confidentiality_notice IS NULL OR btrim(confidentiality_notice) = '';

ALTER TABLE public.companies
  ALTER COLUMN confidentiality_notice SET DEFAULT
    'CONFIDENTIALITY NOTICE: This email and any attachments are intended solely for the named recipient and may contain confidential, privileged, or personal information. If you received it in error, please notify the sender immediately, delete it, and do not copy, disclose, distribute, or rely on its contents.',
  ALTER COLUMN confidentiality_notice SET NOT NULL;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_confidentiality_notice_length_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_confidentiality_notice_length_check
  CHECK (
    char_length(btrim(confidentiality_notice)) BETWEEN 1 AND 4000
  );

COMMENT ON COLUMN public.companies.confidentiality_notice IS
  'Company-controlled confidentiality notice appended centrally to every outgoing tenant email.';
