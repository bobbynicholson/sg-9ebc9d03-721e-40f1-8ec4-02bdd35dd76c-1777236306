-- Wave 45 follow-up -- close the lingering security_definer_view
-- advisor warning on driver_shifts.
--
-- Wave 42 T1 already moved the three INSTEAD OF trigger functions
-- to SECURITY INVOKER. The advisor's remaining flag is on the view
-- itself: in PG 14+, views default to running their underlying
-- query with the view owner's privileges (the SECURITY DEFINER
-- behaviour in the lint name) unless explicitly opted into
-- caller-context execution.
--
-- security_invoker=true makes the view evaluate underlying RLS
-- against auth.uid() of the caller, matching the trigger functions
-- and closing the cross-tenant gap from every angle.

ALTER VIEW public.driver_shifts SET (security_invoker = true);
