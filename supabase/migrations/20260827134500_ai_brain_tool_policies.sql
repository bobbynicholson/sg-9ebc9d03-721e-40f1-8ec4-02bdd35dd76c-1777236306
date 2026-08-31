-- The assistant may use only named, read-only application tools.
-- This table controls which approved tools are available to each role. It is
-- intentionally not a SQL allow-list: the tool implementations fix their
-- own tables, columns, tenant scope, and user scope in server code.
create table if not exists public.ai_brain_tool_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in (
    'owner', 'company_admin', 'region_admin', 'sales_admin', 'admin',
    'kitchen_manager', 'kitchen_staff', 'shopping_staff', 'shopping',
    'driver', 'waiter', 'cleaning_manager', 'cleaning_staff', 'client',
    'staff', 'super_admin'
  )),
  tool_id text not null check (tool_id in (
    'company_profile', 'dashboard_stats', 'customer_profile',
    'customer_bookings', 'customer_invoices', 'assigned_deliveries',
    'delivery_orders', 'kitchen_orders', 'kitchen_prep_tasks',
    'kitchen_inventory', 'shopping_inventory', 'shopping_lists',
    'cleaning_equipment', 'cleaning_damage_reports', 'sales_orders',
    'sales_quotes', 'sales_leads', 'operations_orders',
    'operations_inventory', 'admin_invoices', 'team_members', 'staff_orders',
    'user_notifications'
  )),
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, role, tool_id)
);

create index if not exists ai_brain_tool_policies_company_role_idx
  on public.ai_brain_tool_policies(company_id, role);

alter table public.ai_brain_tool_policies enable row level security;

drop policy if exists ai_brain_tool_policies_select on public.ai_brain_tool_policies;
create policy ai_brain_tool_policies_select
  on public.ai_brain_tool_policies for select to authenticated
  using (
    company_id in (
      select p.company_id from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.active_role, p.role::text) in ('super_admin', 'owner', 'company_admin')
    )
  );

drop policy if exists ai_brain_tool_policies_manage on public.ai_brain_tool_policies;
create policy ai_brain_tool_policies_manage
  on public.ai_brain_tool_policies for all to authenticated
  using (
    company_id in (
      select p.company_id from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.active_role, p.role::text) in ('super_admin', 'owner', 'company_admin')
    )
  )
  with check (
    company_id in (
      select p.company_id from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.active_role, p.role::text) in ('super_admin', 'owner', 'company_admin')
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.ai_brain_tool_policies;
exception when duplicate_object then null;
end $$;

comment on table public.ai_brain_tool_policies is
  'Company overrides for approved read-only AI live-data tools; never raw SQL access.';
