-- Real bug found while writing a P2 regression test (checking search
-- visibility downstream of the admin soft-delete/restore flow tested in
-- Tier 2 section 9), completely unrelated to P2 itself.
--
-- admin_soft_delete_profile() (0005_profile_lifecycle_admin.sql) sets BOTH
-- teacher_profile.is_listed = false AND deleted_at = now() as part of the
-- delete. admin_restore_profile() only ever cleared deleted_at — it never
-- set is_listed back to true. So "restore" silently left the profile
-- permanently unlisted: not deleted, but invisible in search forever,
-- unless the teacher happened to separately notice and re-check "Visible in
-- search" on their own profile page. No existing test caught this because
-- section 9's own checks only verify search visibility right after the
-- DELETE (correctly absent) — nothing previously asserted visibility is
-- restored after the RESTORE step, since no earlier feature depended on
-- that teacher still being searchable further down the same test run.
create or replace function admin_restore_profile(target_user_id uuid)
returns void language plpgsql security definer as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  update users set deleted_at = null where id = target_user_id;
  update teacher_profile set deleted_at = null, is_listed = true where user_id = target_user_id;
  update parent_profile set deleted_at = null where user_id = target_user_id;
  update student_profile set deleted_at = null where parent_id = target_user_id;
  insert into admin_audit_log (actor_id, target_table, target_id, action)
  values (auth.uid(), 'users', target_user_id, 'update');
end; $$;
