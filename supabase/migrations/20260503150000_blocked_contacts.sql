-- Block list for contacts that should never receive future
-- communications. When the team deletes a contact from /admin/contacts
-- they get the option to also block them; that inserts a row here.
-- Every outbound channel (email API, WhatsApp send) checks this table
-- before dispatching, so a blocked address can't sneak back into the
-- workflow if the contact gets recreated under a new lead row.
--
-- Block keys are kept loose: email is the primary key, phone is
-- optional. Lower-case email is enforced via a CHECK so callers don't
-- have to remember to normalise.

CREATE TABLE IF NOT EXISTS public.blocked_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_lower     TEXT,
  phone           TEXT,
  reason          TEXT,
  blocked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT blocked_contacts_email_lowercase
    CHECK (email_lower IS NULL OR email_lower = LOWER(email_lower)),
  CONSTRAINT blocked_contacts_one_key
    CHECK (email_lower IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS blocked_contacts_company_email_uniq
  ON public.blocked_contacts (company_id, email_lower)
  WHERE email_lower IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS blocked_contacts_company_phone_uniq
  ON public.blocked_contacts (company_id, phone)
  WHERE phone IS NOT NULL;

-- RLS: only people inside the company can see / manage their blocks.
ALTER TABLE public.blocked_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY blocked_contacts_company_select
  ON public.blocked_contacts
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY blocked_contacts_company_insert
  ON public.blocked_contacts
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY blocked_contacts_company_delete
  ON public.blocked_contacts
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );
