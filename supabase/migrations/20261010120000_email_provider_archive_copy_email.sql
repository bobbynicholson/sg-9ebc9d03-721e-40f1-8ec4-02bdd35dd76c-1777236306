-- Optional mailbox that receives a blind copy of every tenant email sent
-- through the app. No existing company is opted in by this nullable column.
ALTER TABLE public.email_provider_settings
  ADD COLUMN IF NOT EXISTS archive_copy_email TEXT;

COMMENT ON COLUMN public.email_provider_settings.archive_copy_email IS
  'Optional tenant mailbox that receives a BCC copy of each app-sent email.';