create or replace function set_my_role(new_role text)
returns void language plpgsql security definer as $$
begin
  if new_role not in ('student','parent','teacher') then
    raise exception 'invalid role';
  end if;

  update users set role = new_role
  where id = auth.uid() and role is null;

  if not found then
    raise exception 'role already assigned';
  end if;
end; $$;
