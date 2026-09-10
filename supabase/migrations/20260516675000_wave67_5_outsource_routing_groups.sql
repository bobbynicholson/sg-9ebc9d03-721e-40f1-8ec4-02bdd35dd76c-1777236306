-- Wave 67.5: outsource routing groups -- multi-provider "first to accept wins"
--
-- Adds routing_group_id to outsource_assignments. Sibling rows in the
-- same routing_group_id are alternates for the SAME fulfilment slot.
-- When one is accepted, the others auto-cancel with decline_reason
-- 'Another provider accepted first'. Implements the dispatch-style
-- auto-assign pattern Bobby asked for in Wave 67's deferred list.
--
-- Applied via DB trigger so the race-condition handling lives at the
-- data layer and doesn't have to be re-implemented in every code
-- path that flips an assignment to 'accepted' (magic-link, admin
-- manual mark, future automations).

ALTER TABLE public.outsource_assignments
  ADD COLUMN IF NOT EXISTS routing_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_outsource_assignments_routing_group
  ON public.outsource_assignments (routing_group_id)
  WHERE routing_group_id IS NOT NULL;

COMMENT ON COLUMN public.outsource_assignments.routing_group_id IS
  'Wave 67.5. Siblings in the same routing_group_id are alternate providers for the same fulfilment slot (multi-provider routing). When one is accepted, the trigger _outsource_cancel_routing_siblings cancels the rest with decline_reason=Another provider accepted first.';

-- Trigger function: on UPDATE when status flips to 'accepted',
-- cancel every other 'requested' sibling in the same routing_group.
CREATE OR REPLACE FUNCTION public._outsource_cancel_routing_siblings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- Only act on a status transition INTO 'accepted' from a non-
  -- accepted state. Idempotent: a re-accept (already accepted) is a
  -- no-op so the trigger doesn't re-cancel an already-resolved group.
  IF NEW.status = 'accepted'
    AND (OLD.status IS NULL OR OLD.status <> 'accepted')
    AND NEW.routing_group_id IS NOT NULL
  THEN
    UPDATE public.outsource_assignments
    SET
      status = 'cancelled',
      cancelled_at = NOW(),
      decline_reason = COALESCE(decline_reason, 'Another provider accepted first'),
      updated_at = NOW()
    WHERE routing_group_id = NEW.routing_group_id
      AND id <> NEW.id
      AND status = 'requested'
      AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_outsource_cancel_routing_siblings ON public.outsource_assignments;
CREATE TRIGGER trg_outsource_cancel_routing_siblings
  AFTER UPDATE OF status ON public.outsource_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public._outsource_cancel_routing_siblings();
