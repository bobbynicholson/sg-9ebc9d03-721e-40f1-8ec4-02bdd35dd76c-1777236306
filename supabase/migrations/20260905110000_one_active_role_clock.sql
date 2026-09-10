-- A person can have multiple roles, but only one role clock may be active at
-- a time. Order work itself can still overlap within the same role; this
-- lock only prevents driver + waiter/kitchen/cleaning clocks overlapping.

create table if not exists public.role_work_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('driver','waiter','kitchen','cleaning')),
  order_id uuid references public.orders(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text not null default 'manual',
  end_note text not null default 'No note supplied.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists role_work_sessions_one_open_per_user
  on public.role_work_sessions(user_id)
  where ended_at is null;
create index if not exists role_work_sessions_company_time_idx
  on public.role_work_sessions(company_id, started_at);
create index if not exists role_work_sessions_order_idx
  on public.role_work_sessions(order_id, started_at)
  where order_id is not null;

alter table public.event_attendance
  add column if not exists work_started_at timestamptz,
  add column if not exists work_ended_at timestamptz,
  add column if not exists work_end_reason text,
  add column if not exists work_end_note text;

alter table public.kitchen_duty_shifts
  add column if not exists end_reason text,
  add column if not exists end_note text;

alter table public.cleaning_duty_logs
  add column if not exists duty_end_reason text,
  add column if not exists duty_end_note text;

alter table public.role_work_sessions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'role_work_sessions_same_company') then
    create policy role_work_sessions_same_company on public.role_work_sessions
      for all to authenticated
      using (company_id = (select p.company_id from public.profiles p where p.id = auth.uid()))
      with check (company_id = (select p.company_id from public.profiles p where p.id = auth.uid()));
  end if;
end $$;

create or replace function public.role_work_sessions_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists role_work_sessions_updated_at on public.role_work_sessions;
create trigger role_work_sessions_updated_at
before update on public.role_work_sessions
for each row execute function public.role_work_sessions_touch_updated_at();
