-- Shopping staff use the same shared one-user timer as every other field role.
alter table public.role_work_sessions
  drop constraint if exists role_work_sessions_role_check;

alter table public.role_work_sessions
  add constraint role_work_sessions_role_check
  check (role in ('driver', 'waiter', 'kitchen', 'cleaning', 'shopping', 'kitchen_manager', 'cleaning_manager'));
