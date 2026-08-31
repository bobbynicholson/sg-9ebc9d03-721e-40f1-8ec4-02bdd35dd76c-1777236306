-- Dynamic, read-only assistant tools.
-- Managers choose an approved public table, fields, operation, keywords, and
-- roles. Execution remains server controlled and always applies the caller's
-- platform/company/current-user boundary.

create table if not exists public.ai_dynamic_tools (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  description text not null default '' check (char_length(description) <= 500),
  table_name text not null check (table_name ~ '^[a-z][a-z0-9_]{0,62}$'),
  operation text not null check (operation in ('count', 'list', 'sum', 'average')),
  selected_columns text[] not null default '{}',
  metric_column text,
  audience_scope text not null check (audience_scope in ('platform', 'company', 'current_user')),
  user_scope_column text,
  filters jsonb not null default '[]'::jsonb check (jsonb_typeof(filters) = 'array'),
  row_limit integer not null default 25 check (row_limit between 1 and 100),
  roles text[] not null check (cardinality(roles) > 0),
  keywords text[] not null check (cardinality(keywords) > 0),
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_dynamic_tools_scope_slug_idx
  on public.ai_dynamic_tools (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
create index if not exists ai_dynamic_tools_company_enabled_idx
  on public.ai_dynamic_tools (company_id, enabled);
create index if not exists ai_dynamic_tools_roles_idx
  on public.ai_dynamic_tools using gin (roles);

alter table public.ai_dynamic_tools enable row level security;

-- Tables that contain credentials, assistant internals, or private chat state
-- are never available in the builder. Secret-like fields are removed from
-- every remaining table.
create or replace function public.ai_dynamic_column_allowed(p_table text, p_column text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select
    p_table not in (
      'ai_brain_access_policies', 'ai_brain_tool_policies', 'ai_dynamic_tools',
      'chat_sessions', 'chat_messages', 'integrations', 'email_settings',
      'payment_gateways', 'webhook_subscriptions', 'subscription_webhook_events'
    )
    and p_column !~* '(password|secret|token|credential|api_key|private_key|smtp|webhook|metadata)'
    and exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = p_table and c.column_name = p_column
    );
$$;

create or replace function public.ai_brain_dynamic_tool_sources()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
  caller_active_role text;
  effective_role text;
  result jsonb;
begin
  select p.role::text, p.active_role
    into caller_role, caller_active_role
  from public.profiles p where p.id = auth.uid();

  effective_role := case
    when caller_role in ('super_admin', 'owner', 'company_admin') then caller_role
    else coalesce(caller_active_role, caller_role)
  end;
  if effective_role not in ('super_admin', 'owner', 'company_admin') then
    raise exception 'Only platform admins, owners, and company admins can build assistant tools';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'table', source.table_name,
    'companyScoped', source.company_scoped,
    'columns', source.columns
  ) order by source.table_name), '[]'::jsonb)
  into result
  from (
    select
      c.table_name,
      bool_or(c.column_name = 'company_id') as company_scoped,
      jsonb_agg(jsonb_build_object('name', c.column_name, 'type', c.data_type) order by c.ordinal_position)
        filter (where public.ai_dynamic_column_allowed(c.table_name, c.column_name)) as columns
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.table_name not in (
        'ai_brain_access_policies', 'ai_brain_tool_policies', 'ai_dynamic_tools',
        'chat_sessions', 'chat_messages', 'integrations', 'email_settings',
        'payment_gateways', 'webhook_subscriptions', 'subscription_webhook_events'
      )
    group by c.table_name
    having effective_role = 'super_admin' or bool_or(c.column_name = 'company_id')
  ) source
  where jsonb_array_length(coalesce(source.columns, '[]'::jsonb)) > 0;

  return result;
end;
$$;

create or replace function public.validate_ai_dynamic_tool()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
  caller_active_role text;
  caller_company uuid;
  effective_role text;
  item text;
  filter_item jsonb;
  filter_column text;
  filter_operator text;
begin
  select p.role::text, p.active_role, p.company_id
    into caller_role, caller_active_role, caller_company
  from public.profiles p where p.id = auth.uid();
  effective_role := case
    when caller_role in ('super_admin', 'owner', 'company_admin') then caller_role
    else coalesce(caller_active_role, caller_role)
  end;

  if effective_role = 'super_admin' then
    if new.company_id is not null or new.audience_scope <> 'platform' or new.roles <> array['super_admin']::text[] then
      raise exception 'Platform tools must remain platform-admin only';
    end if;
  elsif effective_role in ('owner', 'company_admin') then
    if caller_company is null or new.company_id is distinct from caller_company then
      raise exception 'Company tools must stay inside your company';
    end if;
    if new.audience_scope = 'platform' or 'super_admin' = any(new.roles) then
      raise exception 'Company tools cannot grant platform access';
    end if;
  else
    raise exception 'You cannot manage assistant tools';
  end if;

  if new.table_name in (
    'ai_brain_access_policies', 'ai_brain_tool_policies', 'ai_dynamic_tools',
    'chat_sessions', 'chat_messages', 'integrations', 'email_settings',
    'payment_gateways', 'webhook_subscriptions', 'subscription_webhook_events'
  ) then
    raise exception 'This source is not available to assistant tools';
  end if;
  if not exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = new.table_name and t.table_type = 'BASE TABLE'
  ) then
    raise exception 'Unknown source table';
  end if;
  if new.audience_scope in ('company', 'current_user') and not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = new.table_name and c.column_name = 'company_id'
  ) then
    raise exception 'Company tools require a company-scoped source';
  end if;

  if new.operation = 'list' and cardinality(new.selected_columns) = 0 then
    raise exception 'List tools require at least one field';
  end if;
  if cardinality(new.selected_columns) > 12 then
    raise exception 'A tool may return at most 12 fields';
  end if;
  foreach item in array new.selected_columns loop
    if not public.ai_dynamic_column_allowed(new.table_name, item) then
      raise exception 'Field % is not available', item;
    end if;
  end loop;

  if new.operation in ('sum', 'average') then
    if new.metric_column is null or not public.ai_dynamic_column_allowed(new.table_name, new.metric_column) then
      raise exception 'A valid number field is required';
    end if;
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = new.table_name and c.column_name = new.metric_column
        and c.data_type in ('smallint', 'integer', 'bigint', 'numeric', 'decimal', 'real', 'double precision')
    ) then
      raise exception 'The selected result field must be numeric';
    end if;
  else
    new.metric_column := null;
  end if;

  if new.audience_scope = 'current_user' then
    if new.user_scope_column is null or not public.ai_dynamic_column_allowed(new.table_name, new.user_scope_column) then
      raise exception 'Current-user tools require a valid user field';
    end if;
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = new.table_name
        and c.column_name = new.user_scope_column and c.data_type = 'uuid'
    ) then
      raise exception 'Current-user tools require a UUID user field';
    end if;
  else
    new.user_scope_column := null;
  end if;

  if new.audience_scope = 'company'
    and exists (select 1 from unnest(new.roles) role_name where role_name not in ('owner', 'company_admin', 'region_admin', 'sales_admin', 'admin'))
    and exists (
      select 1 from unnest(array_append(new.selected_columns, coalesce(new.metric_column, ''))) field_name
      where field_name ~* '(email|phone|address|notes?|amount|price|cost|earnings|wage|salary|bank|tax|invoice_url)'
    ) then
    raise exception 'Personal and financial fields require current-user scope or an administrative role';
  end if;

  for filter_item in select value from jsonb_array_elements(new.filters) loop
    filter_column := filter_item->>'column';
    filter_operator := filter_item->>'operator';
    if not public.ai_dynamic_column_allowed(new.table_name, filter_column)
      or filter_operator not in ('equals', 'not_equals', 'is_empty', 'is_not_empty') then
      raise exception 'Invalid fixed filter';
    end if;
  end loop;

  new.slug := lower(regexp_replace(trim(new.slug), '[^a-z0-9_-]+', '-', 'g'));
  new.keywords := array(select distinct lower(trim(value)) from unnest(new.keywords) value where trim(value) <> '' limit 30);
  new.updated_by := auth.uid();
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists validate_ai_dynamic_tool_trigger on public.ai_dynamic_tools;
create trigger validate_ai_dynamic_tool_trigger
  before insert or update on public.ai_dynamic_tools
  for each row execute function public.validate_ai_dynamic_tool();

drop policy if exists ai_dynamic_tools_read on public.ai_dynamic_tools;
create policy ai_dynamic_tools_read on public.ai_dynamic_tools
  for select to authenticated
  using (
    (company_id is null and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'super_admin'
    ))
    or (company_id in (
      select p.company_id from public.profiles p where p.id = auth.uid() and p.company_id is not null
    ) and (
      exists (
        select 1 from public.profiles p where p.id = auth.uid()
          and (p.role::text in ('owner', 'company_admin') or p.active_role in ('owner', 'company_admin'))
      )
      or (case
        when (select p.role::text from public.profiles p where p.id = auth.uid()) in ('owner', 'company_admin')
          then (select p.role::text from public.profiles p where p.id = auth.uid())
        else coalesce((select p.active_role from public.profiles p where p.id = auth.uid()), (select p.role::text from public.profiles p where p.id = auth.uid()))
      end) = any(roles)
    ))
  );

drop policy if exists ai_dynamic_tools_manage on public.ai_dynamic_tools;
create policy ai_dynamic_tools_manage on public.ai_dynamic_tools
  for all to authenticated
  using (
    (company_id is null and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'super_admin'))
    or (company_id in (select p.company_id from public.profiles p where p.id = auth.uid()) and exists (
      select 1 from public.profiles p where p.id = auth.uid()
        and (p.role::text in ('owner', 'company_admin') or p.active_role in ('owner', 'company_admin'))
    ))
  )
  with check (
    (company_id is null and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'super_admin'))
    or (company_id in (select p.company_id from public.profiles p where p.id = auth.uid()) and exists (
      select 1 from public.profiles p where p.id = auth.uid()
        and (p.role::text in ('owner', 'company_admin') or p.active_role in ('owner', 'company_admin'))
    ))
  );

create or replace function public.ai_brain_run_dynamic_tool(p_tool_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  tool public.ai_dynamic_tools%rowtype;
  caller_role text;
  caller_active_role text;
  caller_company uuid;
  effective_role text;
  where_sql text := ' where true';
  fields_sql text;
  sql_text text;
  result jsonb;
  filter_item jsonb;
  filter_column text;
  filter_operator text;
  filter_value text;
begin
  select * into tool from public.ai_dynamic_tools where id = p_tool_id and enabled = true;
  if not found then raise exception 'Assistant tool is unavailable'; end if;

  select p.role::text, p.active_role, p.company_id
    into caller_role, caller_active_role, caller_company
  from public.profiles p where p.id = auth.uid();
  effective_role := case
    when caller_role in ('super_admin', 'owner', 'company_admin') then caller_role
    else coalesce(caller_active_role, caller_role)
  end;
  if not effective_role = any(tool.roles) then raise exception 'Assistant tool is not allowed for this role'; end if;

  if tool.audience_scope = 'platform' then
    if caller_role <> 'super_admin' or tool.company_id is not null then raise exception 'Platform access required'; end if;
  else
    if caller_company is null or tool.company_id is distinct from caller_company then raise exception 'Company access required'; end if;
    where_sql := where_sql || format(' and %I = %L::uuid', 'company_id', caller_company);
  end if;
  if tool.audience_scope = 'current_user' then
    where_sql := where_sql || format(' and %I = %L::uuid', tool.user_scope_column, auth.uid());
  end if;

  for filter_item in select value from jsonb_array_elements(tool.filters) loop
    filter_column := filter_item->>'column';
    filter_operator := filter_item->>'operator';
    filter_value := filter_item->>'value';
    if filter_operator = 'equals' then
      where_sql := where_sql || format(' and %I::text = %L', filter_column, filter_value);
    elsif filter_operator = 'not_equals' then
      where_sql := where_sql || format(' and %I::text <> %L', filter_column, filter_value);
    elsif filter_operator = 'is_empty' then
      where_sql := where_sql || format(' and %I is null', filter_column);
    elsif filter_operator = 'is_not_empty' then
      where_sql := where_sql || format(' and %I is not null', filter_column);
    end if;
  end loop;

  if tool.operation = 'count' then
    sql_text := format('select jsonb_build_object(''total'', count(*), ''operation'', ''count'') from public.%I%s', tool.table_name, where_sql);
  elsif tool.operation = 'list' then
    select string_agg(format('%I', value), ', ') into fields_sql from unnest(tool.selected_columns) value;
    sql_text := format(
      'select jsonb_build_object(''rows'', coalesce(jsonb_agg(to_jsonb(result_row)), ''[]''::jsonb), ''operation'', ''list'') from (select %s from public.%I%s limit %s) result_row',
      fields_sql, tool.table_name, where_sql, least(tool.row_limit, 100)
    );
  elsif tool.operation = 'sum' then
    sql_text := format('select jsonb_build_object(''value'', coalesce(sum(%I), 0), ''operation'', ''sum'') from public.%I%s', tool.metric_column, tool.table_name, where_sql);
  else
    sql_text := format('select jsonb_build_object(''value'', avg(%I), ''operation'', ''average'') from public.%I%s', tool.metric_column, tool.table_name, where_sql);
  end if;

  execute sql_text into result;
  return jsonb_build_object(
    'id', tool.id,
    'name', tool.name,
    'description', tool.description,
    'result', coalesce(result, '{}'::jsonb),
    'as_of', now()
  );
end;
$$;

grant execute on function public.ai_brain_dynamic_tool_sources() to authenticated;
grant execute on function public.ai_brain_run_dynamic_tool(uuid) to authenticated;

comment on table public.ai_dynamic_tools is
  'Manager-defined read-only assistant tools with fixed source, fields, operation, role assignment, and server-enforced scope.';
