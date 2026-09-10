-- The kitchen tablet uses kitchen_staff_shifts in addition to the older
-- kitchen_duty_shifts table. Include it in the same one-user/one-timer guard.
create or replace function public.enforce_one_open_work_clock_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_conflict text;
  v_open boolean := false;
begin
  if tg_table_name = 'role_work_sessions' then
    v_user_id := new.user_id;
    v_company_id := new.company_id;
    v_role := new.role;
    v_open := new.ended_at is null;
  elsif tg_table_name = 'kitchen_shifts' then
    v_user_id := new.staff_id;
    v_company_id := new.company_id;
    v_role := 'driver';
    v_open := new.shift_type = 'delivery' and new.actual_end is null and new.deleted_at is null;
  elsif tg_table_name = 'event_attendance' then
    v_user_id := new.waiter_id;
    v_company_id := new.company_id;
    v_role := 'waiter';
    v_open := new.work_started_at is not null and new.work_ended_at is null;
  elsif tg_table_name = 'kitchen_duty_shifts' then
    v_user_id := coalesce(new.staff_id, new.user_id);
    v_company_id := new.company_id;
    v_role := 'kitchen';
    v_open := new.is_active;
  elsif tg_table_name = 'cleaning_duty_logs' then
    v_user_id := new.user_id;
    v_company_id := new.company_id;
    v_role := 'cleaning';
    v_open := new.on_duty and new.duty_ended_at is null;
  elsif tg_table_name = 'kitchen_staff_shifts' then
    select m.linked_profile_id into v_user_id
    from kitchen_staff_members m
    where m.id = new.staff_member_id;
    v_company_id := new.company_id;
    v_role := case when new.department = 'cleaning' then 'cleaning' else 'kitchen' end;
    v_open := new.shift_end is null and new.deleted_at is null;
  end if;

  if not v_open or v_user_id is null or v_company_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_company_id::text || ':' || v_user_id::text, 0)
  );

  if tg_table_name <> 'role_work_sessions' and exists (
    select 1 from role_work_sessions s
    where s.user_id = v_user_id and s.company_id = v_company_id
      and s.ended_at is null and s.role <> v_role
  ) then
    v_conflict := 'shared role timer';
  elsif v_role <> 'driver' and exists (
    select 1 from kitchen_shifts s
    where s.staff_id = v_user_id and s.company_id = v_company_id
      and s.shift_type = 'delivery' and s.actual_end is null and s.deleted_at is null
  ) then
    v_conflict := 'Driver';
  elsif v_role <> 'waiter' and exists (
    select 1 from event_attendance a
    where a.waiter_id = v_user_id and a.company_id = v_company_id
      and a.work_started_at is not null and a.work_ended_at is null
  ) then
    v_conflict := 'Waiter';
  elsif v_role <> 'kitchen' and exists (
    select 1 from kitchen_duty_shifts s
    where coalesce(s.staff_id, s.user_id) = v_user_id
      and s.company_id = v_company_id and s.is_active
  ) then
    v_conflict := 'Kitchen';
  elsif v_role <> 'kitchen' and exists (
    select 1 from kitchen_staff_shifts s
    join kitchen_staff_members m on m.id = s.staff_member_id
    where m.linked_profile_id = v_user_id and s.company_id = v_company_id
      and s.shift_end is null and s.deleted_at is null
  ) then
    v_conflict := 'Kitchen tablet';
  elsif v_role <> 'cleaning' and exists (
    select 1 from cleaning_duty_logs d
    where d.user_id = v_user_id and d.company_id = v_company_id
      and d.on_duty and d.duty_ended_at is null
  ) then
    v_conflict := 'Cleaning';
  elsif v_role <> 'cleaning' and exists (
    select 1 from kitchen_staff_shifts s
    join kitchen_staff_members m on m.id = s.staff_member_id
    where m.linked_profile_id = v_user_id and s.company_id = v_company_id
      and s.department = 'cleaning' and s.shift_end is null and s.deleted_at is null
  ) then
    v_conflict := 'Cleaning tablet';
  end if;

  if tg_table_name = 'role_work_sessions' and v_conflict is null and exists (
    select 1 from role_work_sessions s
    where s.user_id = v_user_id and s.company_id = v_company_id
      and s.ended_at is null and s.id <> new.id
  ) then
    v_conflict := 'another shared role timer';
  end if;

  if v_conflict is not null then
    raise exception using
      errcode = '23514',
      message = format('Only one active work timer is allowed for this person. Close the %s timer first.', v_conflict);
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_one_open_work_clock_source() from public;

drop trigger if exists enforce_one_open_work_clock_staff_shift on public.kitchen_staff_shifts;
create trigger enforce_one_open_work_clock_staff_shift
before insert or update of staff_member_id, company_id, department, shift_end, deleted_at
on public.kitchen_staff_shifts
for each row execute function public.enforce_one_open_work_clock_source();
