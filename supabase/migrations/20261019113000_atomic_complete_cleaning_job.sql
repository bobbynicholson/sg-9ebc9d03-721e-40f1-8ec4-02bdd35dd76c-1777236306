-- Complete a cleaning job and restore its equipment in one transaction.
--
-- A browser-side UPDATE followed by an equipment read/UPDATE is unsafe:
-- two operators can both observe the same in-progress job, and a stale
-- completion can restore stock even after the job was cancelled. Lock the
-- job row, transition it only once, and restore availability while that lock
-- is held. PostgreSQL rolls the entire function back if the equipment update
-- fails, so job state and availability cannot diverge.

create or replace function public.complete_cleaning_job(p_job_id uuid)
returns table (
  completed boolean,
  already_complete boolean,
  status text,
  company_id uuid,
  equipment_id uuid,
  quantity numeric,
  triggered_by_event_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.cleaning_jobs%rowtype;
  v_available numeric;
begin
  select *
    into v_job
    from public.cleaning_jobs
   where id = p_job_id
     and deleted_at is null
   for update;

  if not found then
    return query select false, false, null::text, null::uuid, null::uuid, null::numeric, null::uuid;
    return;
  end if;

  -- SECURITY DEFINER is needed because some cleaning roles may not have a
  -- direct equipment UPDATE policy. Scope every call to the caller's tenant
  -- and existing cleaning-domain roles; service-role calls remain available
  -- to trusted server jobs.
  if auth.role() <> 'service_role'
     and not (
       public.current_user_has_any_role(array['super_admin'])
       or (
         v_job.company_id = public.get_user_company_id((select auth.uid()))
         and public.current_user_has_any_role(array[
           'company_admin', 'owner', 'admin', 'super_admin',
           'cleaning_manager', 'cleaning_staff',
           'kitchen_manager', 'kitchen_staff'
         ])
       )
     ) then
    raise exception 'Not allowed to complete this cleaning job' using errcode = '42501';
  end if;

  if v_job.status = 'complete' then
    return query select false, true, v_job.status, v_job.company_id,
      v_job.equipment_id, v_job.quantity::numeric, v_job.triggered_by_event_id;
    return;
  end if;

  if v_job.status <> 'in_progress' then
    return query select false, false, v_job.status, v_job.company_id,
      v_job.equipment_id, v_job.quantity::numeric, v_job.triggered_by_event_id;
    return;
  end if;

  update public.cleaning_jobs
     set status = 'complete',
         actual_end = now(),
         updated_at = now()
   where id = v_job.id;

  update public.equipment e
     set available_quantity = least(
           coalesce(e.quantity, 0),
           coalesce(e.available_quantity, 0) + v_job.quantity
         ),
         updated_at = now()
   where e.id = v_job.equipment_id
     and e.company_id = v_job.company_id
  returning e.available_quantity into v_available;

  if not found then
    raise exception 'Equipment for cleaning job % is missing or belongs to another company', p_job_id
      using errcode = 'P0002';
  end if;

  return query select true, false, 'complete'::text, v_job.company_id,
    v_job.equipment_id, v_job.quantity::numeric, v_job.triggered_by_event_id;
end;
$$;

revoke all on function public.complete_cleaning_job(uuid) from public;
grant execute on function public.complete_cleaning_job(uuid) to authenticated, service_role;

comment on function public.complete_cleaning_job(uuid) is
  'Atomically completes one in-progress cleaning job and restores its equipment availability once.';
