-- Staff access invitations use Supabase recovery/action links. The separate
-- invitation_token column has no readers and should not retain unused tokens.

UPDATE public.staff_invitations
SET invitation_token = NULL
WHERE invitation_token IS NOT NULL;

COMMENT ON COLUMN public.staff_invitations.invitation_token IS
  'Deprecated and cleared. Staff invite authentication uses Supabase action links.';
