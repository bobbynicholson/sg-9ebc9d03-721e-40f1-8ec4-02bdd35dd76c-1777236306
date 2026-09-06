-- Manager work clocks are separate from crew clocks, while the shared
-- one-open-session-per-user index still prevents simultaneous timers.
alter table public.role_work_sessions
  drop constraint if exists role_work_sessions_role_check;

alter table public.role_work_sessions
  add constraint role_work_sessions_role_check
  check (role in ('driver', 'waiter', 'kitchen', 'cleaning', 'kitchen_manager', 'cleaning_manager'));
