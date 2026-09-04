-- Manager diary notes for the kitchen and cleaning team workspaces.
-- Notes are tenant-scoped and can optionally be attached to one team member.
CREATE TABLE IF NOT EXISTS public.team_manager_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN ('kitchen', 'cleaning')),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_manager_notes_company_department_date_idx
  ON public.team_manager_notes (company_id, department, note_date DESC, created_at DESC);

ALTER TABLE public.team_manager_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_manager_notes_company_access ON public.team_manager_notes;
CREATE POLICY team_manager_notes_company_access
  ON public.team_manager_notes FOR ALL
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP TRIGGER IF EXISTS team_manager_notes_updated_at ON public.team_manager_notes;
CREATE TRIGGER team_manager_notes_updated_at
  BEFORE UPDATE ON public.team_manager_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.team_manager_notes IS
  'Tenant-scoped kitchen and cleaning manager diary notes, optionally linked to a team member.';
