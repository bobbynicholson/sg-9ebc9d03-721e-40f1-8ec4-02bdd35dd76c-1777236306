-- Ensure every outgoing email queue row has a logical template key.
-- Some DB-triggered order emails populate trigger_event but leave
-- template_type null, which makes diagnostics and template reports weaker.

update public.outgoing_email_queue
set template_type = trigger_event
where template_type is null
  and trigger_event is not null;

create or replace function public.set_outgoing_email_queue_template_type()
returns trigger
language plpgsql
as $$
begin
  if new.template_type is null and new.trigger_event is not null then
    new.template_type := new.trigger_event;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_outgoing_email_queue_template_type on public.outgoing_email_queue;

create trigger trg_outgoing_email_queue_template_type
before insert or update of template_type, trigger_event
on public.outgoing_email_queue
for each row
execute function public.set_outgoing_email_queue_template_type();
