-- ODOC Wave F: file attachments for orders. New table + private
-- storage bucket. Surfaces signed contracts, dietary forms, venue
-- photos, etc as a dedicated section on the order doc.
--
-- Applied via Supabase MCP on 2026-05-25.

create table if not exists public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  uploaded_by_user_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'document',
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  description text,
  is_client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_order_attachments_order on public.order_attachments (order_id) where deleted_at is null;
create index if not exists idx_order_attachments_company on public.order_attachments (company_id) where deleted_at is null;

alter table public.order_attachments enable row level security;

drop policy if exists order_attachments_select on public.order_attachments;
create policy order_attachments_select on public.order_attachments
  for select to authenticated
  using (
    company_id = public.current_company_id()
    or (
      is_client_visible = true
      and order_id in (
        select id from public.orders
        where client_id = auth.uid()
      )
    )
  );

drop policy if exists order_attachments_insert on public.order_attachments;
create policy order_attachments_insert on public.order_attachments
  for insert to authenticated
  with check (company_id = public.current_company_id());

drop policy if exists order_attachments_update on public.order_attachments;
create policy order_attachments_update on public.order_attachments
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists order_attachments_delete on public.order_attachments;
create policy order_attachments_delete on public.order_attachments
  for delete to authenticated
  using (company_id = public.current_company_id());

insert into storage.buckets (id, name, public)
values ('order-attachments', 'order-attachments', false)
on conflict (id) do nothing;

drop policy if exists order_attachments_storage_select on storage.objects;
create policy order_attachments_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-attachments'
    and (
      (storage.foldername(name))[1]::uuid = public.current_company_id()
    )
  );

drop policy if exists order_attachments_storage_insert on storage.objects;
create policy order_attachments_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'order-attachments'
    and (
      (storage.foldername(name))[1]::uuid = public.current_company_id()
    )
  );

drop policy if exists order_attachments_storage_delete on storage.objects;
create policy order_attachments_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'order-attachments'
    and (
      (storage.foldername(name))[1]::uuid = public.current_company_id()
    )
  );

comment on table public.order_attachments is 'ODOC Wave F: file attachments tied to an order (contracts, dietary forms, venue photos, etc). Storage lives in the order-attachments bucket at path {company_id}/{order_id}/{filename}.';
