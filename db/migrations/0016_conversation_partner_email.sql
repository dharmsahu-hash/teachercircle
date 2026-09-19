-- Message notifications need the OTHER participant's email, but `users` has
-- no read policy beyond your own row (0004) — same reason reveal_teacher_contact()
-- exists rather than a plain SELECT. This is the same pattern: narrow,
-- participant-checked, returns exactly one column, nothing else about the
-- other user is exposed through it.
create or replace function get_conversation_partner_email(p_conversation_id uuid)
returns text language plpgsql security definer as $$
declare
  v_teacher_id uuid;
  v_requester_id uuid;
  v_email text;
begin
  select teacher_id, requester_id into v_teacher_id, v_requester_id
  from conversation where id = p_conversation_id;

  if v_teacher_id is null then
    raise exception 'conversation not found';
  end if;
  if auth.uid() != v_teacher_id and auth.uid() != v_requester_id then
    raise exception 'not a participant';
  end if;

  select email into v_email
  from users
  where id = case when auth.uid() = v_teacher_id then v_requester_id else v_teacher_id end;

  return v_email;
end; $$;
