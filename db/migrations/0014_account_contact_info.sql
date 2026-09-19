-- Students and parents had nowhere to store their own name/phone (only
-- teachers do, via teacher_profile). Name already exists on `users`
-- (full_name, added in 0009 but only ever populated by Google) and email is
-- already there from signup — the only real gap is phone. Reusing `users`
-- rather than the unused parent_profile/student_profile tables: those model
-- something else (a parent's list of children, name+grade) and nothing in
-- the app has ever read or written them; grafting "my own contact info"
-- onto that shape would be more confusing than reusing the account row that
-- already carries full_name for exactly this purpose.
alter table users add column if not exists phone text;

-- Same reasoning as set_my_role()/set_my_avatar_seed(): `users` has no direct
-- UPDATE policy (0004), so self-editing goes through a narrow SECURITY
-- DEFINER function that validates its own input.
create or replace function set_my_contact_info(new_full_name text, new_phone text)
returns void language plpgsql security definer as $$
begin
  if new_full_name is null or length(trim(new_full_name)) = 0 or length(new_full_name) > 120 then
    raise exception 'name is required';
  end if;
  if new_phone is not null and new_phone !~ '^[0-9+\-\s()]{6,20}$' then
    raise exception 'invalid phone number';
  end if;

  update users set full_name = trim(new_full_name), phone = new_phone
  where id = auth.uid();

  if not found then
    raise exception 'user not found';
  end if;
end; $$;
