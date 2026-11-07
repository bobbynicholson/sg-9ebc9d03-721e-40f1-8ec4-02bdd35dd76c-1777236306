-- The old public /demo page shipped reusable test-company passwords.
-- Disable those six known demo identities so saved credentials and old
-- browser sessions cannot continue to reach company data after deployment.
UPDATE public.profiles AS p
SET is_active = false
FROM public.companies AS c
WHERE p.company_id = c.id
  AND c.slug = 'test-company'
  AND lower(p.email) IN (
    'admin@test-company.com',
    'driver@test-company.com',
    'kitchen@test-company.com',
    'shopping@test-company.com',
    'cleaning@test-company.com',
    'client@test-company.com'
  )
  AND p.is_active IS DISTINCT FROM false;
