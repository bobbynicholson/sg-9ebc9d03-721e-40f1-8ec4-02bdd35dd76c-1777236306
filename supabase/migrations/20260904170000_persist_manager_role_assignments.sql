-- Keep manager access available after a user switches to the related staff
-- portal. active_role is the current portal, not the complete access list.
-- The live user_departments schema stores the durable role assignments.

INSERT INTO public.user_departments (user_id, department, is_primary)
SELECT p.id, 'kitchen_manager', false
FROM public.profiles p
WHERE p.active_role = 'kitchen_manager'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_departments ud
    WHERE ud.user_id = p.id
      AND ud.department = 'kitchen_manager'
  );

INSERT INTO public.user_departments (user_id, department, is_primary)
SELECT p.id, 'cleaning_manager', false
FROM public.profiles p
WHERE p.active_role = 'cleaning_manager'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_departments ud
    WHERE ud.user_id = p.id
      AND ud.department = 'cleaning_manager'
  );
