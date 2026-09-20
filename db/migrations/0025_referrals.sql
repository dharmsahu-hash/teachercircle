-- G5 (docs/07-growth-review-2026-09-20.md): a lightweight "invite a teacher
-- you know" referral loop — the growth mechanism that actually compounds:
-- more teacher listings -> more G1 SEO landing pages -> more organic search
-- traffic -> more reason for more teachers to join.
--
-- Deliberately `on delete set null`, NOT the `on delete cascade` pattern used
-- everywhere else in this schema (see, e.g., 0018's blocked_user, 0024's
-- favorite_teacher) — deleting the REFERRER must never cascade-delete
-- everyone they referred. This is the one FK in the schema where cascade
-- would be actively wrong, not just unnecessary.
alter table users add column referred_by uuid references users(id) on delete set null;

-- One-time, same shape as set_my_role() — only succeeds while referred_by IS
-- NULL, and rejects a referrer that doesn't exist or is the caller
-- themselves. security definer because `users` has no direct UPDATE policy
-- at all; every mutation goes through a named function (set_my_role(),
-- set_my_contact_info(), etc.) for exactly this reason.
create or replace function set_referred_by(p_referred_by uuid) returns void
language plpgsql security definer as $$
begin
  if p_referred_by = auth.uid() then
    raise exception 'cannot refer yourself';
  end if;
  if not exists (select 1 from users where id = p_referred_by) then
    raise exception 'referrer not found';
  end if;
  update users set referred_by = p_referred_by where id = auth.uid() and referred_by is null;
end;
$$;

-- Returns only a count, not the referred users' own rows — same "narrow
-- security definer instead of broad grants" discipline used throughout this
-- schema (is_admin(), reveal_teacher_contact()). Exposing the referred
-- users' full rows to the inviter would leak emails/roles with no real need
-- to. Counts only teachers specifically, matching the growth loop this is
-- actually for — a referred student/parent doesn't add SEO-indexable supply
-- the way a referred teacher does.
create or replace function get_referral_count() returns bigint
language sql stable security definer as $$
  select count(*) from users where referred_by = auth.uid() and role = 'teacher';
$$;

grant execute on function set_referred_by(uuid) to authenticated;
grant execute on function get_referral_count() to authenticated;
