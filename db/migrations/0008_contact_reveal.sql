-- The "Connect" action is two steps: (1) a normal RLS-permitted insert into
-- contact_request, done by the app; (2) this function, which re-checks that a
-- connection now exists and, only then, returns contact fields that no plain
-- RLS policy exposes to anyone but the teacher themself.
create or replace function reveal_teacher_contact(target_teacher_id uuid) returns jsonb
language plpgsql security definer as $$
declare result jsonb;
begin
  if not exists (
    select 1 from contact_request
    where teacher_id = target_teacher_id and requester_id = auth.uid()
  ) then
    raise exception 'not connected';
  end if;

  select jsonb_build_object('contact_email', contact_email, 'contact_phone', contact_phone)
  into result
  from teacher_profile
  where user_id = target_teacher_id;

  return result;
end; $$;
