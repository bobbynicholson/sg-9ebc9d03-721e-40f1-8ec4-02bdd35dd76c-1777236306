-- Per-order work contributors: WHO actually helped on an order, by area
-- (kitchen prep, cleaning, ...). Lets an order show "Kitchen: helped by
-- John, Jane" and makes "who worked this order" reportable. Recorded via
-- SECURITY DEFINER RPCs (best-effort from the app) so a missing table/RPC
-- pre-deploy just no-ops instead of breaking the task action.

create table if not exists public.order_work_contributors (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  order_id   uuid not null,
  user_id    uuid not null,
  area       text not null check (area in ('kitchen','cleaning','shopping','driver','waiter','service')),
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  actions    integer not null default 1,
  unique (order_id, user_id, area)
);
create index if not exists idx_owc_order   on public.order_work_contributors(order_id);
create index if not exists idx_owc_company on public.order_work_contributors(company_id);

alter table public.order_work_contributors enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'owc_read_same_company') then
    create policy owc_read_same_company on public.order_work_contributors
      for select to authenticated
      using (company_id = (select p.company_id from profiles p where p.id = auth.uid()));
  end if;
end $$;
-- No direct insert/update policy: writes go through the definer RPCs below.

-- Generic recorder. Used directly for kitchen (caller has the order id).
create or replace function public.record_order_contributor(p_order_id uuid, p_user_id uuid, p_area text)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  if p_order_id is null or p_user_id is null or p_area is null then return; end if;
  select o.company_id into v_company from orders o where o.id = p_order_id;
  if v_company is null then return; end if;
  insert into public.order_work_contributors (company_id, order_id, user_id, area)
  values (v_company, p_order_id, p_user_id, p_area)
  on conflict (order_id, user_id, area)
  do update set last_at = now(), actions = order_work_contributors.actions + 1;
end; $$;

-- Cleaning bridge: cleaning_jobs are keyed by equipment_id, not order_id,
-- so resolve the order(s) that booked this equipment (via equipment_bookings)
-- and credit the cleaner on each. Shared equipment -> credited on every order
-- it served, which is correct.
create or replace function public.record_cleaning_contributor(p_job_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid; v_equip uuid;
begin
  if p_job_id is null or p_user_id is null then return; end if;
  select cj.company_id, cj.equipment_id into v_company, v_equip
    from cleaning_jobs cj where cj.id = p_job_id;
  if v_equip is null then return; end if;
  insert into public.order_work_contributors (company_id, order_id, user_id, area)
  select v_company, eb.order_id, p_user_id, 'cleaning'
    from equipment_bookings eb
   where eb.equipment_id = v_equip and eb.order_id is not null
  on conflict (order_id, user_id, area)
  do update set last_at = now(), actions = order_work_contributors.actions + 1;
end; $$;

grant execute on function public.record_order_contributor(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.record_cleaning_contributor(uuid, uuid)     to authenticated, service_role;
