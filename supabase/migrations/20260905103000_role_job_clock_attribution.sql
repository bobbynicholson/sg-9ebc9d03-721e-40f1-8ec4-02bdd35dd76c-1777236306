-- Store the operator who actually started a kitchen or cleaning job.
-- Assignment/creation users are not necessarily the people doing the work.

alter table public.kitchen_prep_tasks
  add column if not exists started_by uuid references public.profiles(id) on delete set null;

alter table public.cleaning_jobs
  add column if not exists started_by uuid references public.profiles(id) on delete set null;

create index if not exists kitchen_prep_tasks_started_by_idx
  on public.kitchen_prep_tasks (company_id, started_by, started_at)
  where started_by is not null;

create index if not exists cleaning_jobs_started_by_idx
  on public.cleaning_jobs (company_id, started_by, actual_start)
  where started_by is not null and deleted_at is null;
