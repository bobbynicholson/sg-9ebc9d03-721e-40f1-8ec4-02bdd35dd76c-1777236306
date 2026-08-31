-- Platform currency catalog.
--
-- Currency availability is configuration data, not assistant prompt data.
-- Keeping it in a small public catalog lets the signup flow, platform
-- currency page, and assistant use the same source of truth.

create table if not exists public.platform_supported_currencies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{3}$'),
  name text not null check (char_length(trim(name)) between 2 and 80),
  symbol text not null check (char_length(trim(symbol)) between 1 and 8),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_supported_currencies_active_idx
  on public.platform_supported_currencies (is_active, sort_order, code);

alter table public.platform_supported_currencies enable row level security;

drop policy if exists platform_supported_currencies_read on public.platform_supported_currencies;
create policy platform_supported_currencies_read
  on public.platform_supported_currencies
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists platform_supported_currencies_manage on public.platform_supported_currencies;
create policy platform_supported_currencies_manage
  on public.platform_supported_currencies
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'super_admin'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'super_admin'
  ));

insert into public.platform_supported_currencies (code, name, symbol, sort_order)
values
  ('ZAR', 'South African Rand', 'R', 1),
  ('USD', 'US Dollar', '$', 2),
  ('EUR', 'Euro', '€', 3),
  ('GBP', 'British Pound', '£', 4),
  ('AUD', 'Australian Dollar', 'A$', 5)
on conflict (code) do update set
  name = excluded.name,
  symbol = excluded.symbol,
  sort_order = excluded.sort_order,
  updated_at = now();

comment on table public.platform_supported_currencies is
  'Database-backed list of currencies enabled for CateringMS platform use.';

notify pgrst, 'reload schema';
