alter table users enable row level security;
create policy users_select_own on users for select using (auth.uid() = id);
-- Note: deliberately no "public can read teacher rows" policy on `users` — RLS
-- controls row visibility, not column visibility, and `users.email` would leak
-- alongside it. Public teacher info comes from `teacher_profile` only, which
-- has no email column.

alter table teacher_profile enable row level security;
create policy teacher_public_read on teacher_profile for select using (is_listed);
-- Without this, a teacher who pauses their own listing (is_listed = false)
-- could no longer read their own row back to re-edit it — RLS policies for
-- the same command OR together, so this just adds "or it's mine" to the read rule.
create policy teacher_owner_read on teacher_profile for select using (auth.uid() = user_id);
create policy teacher_owner_write on teacher_profile for update using (auth.uid() = user_id);
create policy teacher_owner_insert on teacher_profile for insert with check (auth.uid() = user_id);

alter table student_profile enable row level security;
create policy student_parent_only on student_profile for all using (auth.uid() = parent_id);

alter table review enable row level security;
create policy review_public_read on review for select using (true);
create policy review_insert_if_connected on review for insert with check (
  exists (select 1 from contact_request where teacher_id = review.teacher_id and requester_id = auth.uid())
);

alter table contact_request enable row level security;
create policy contact_owner_read on contact_request for select using (auth.uid() = requester_id);
create policy contact_owner_insert on contact_request for insert with check (auth.uid() = requester_id);

alter table feature_flags enable row level security;
create policy flags_public_read on feature_flags for select using (true);
create policy flags_admin_write on feature_flags for update using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);

alter table plan_limits enable row level security;
create policy plan_limits_public_read on plan_limits for select using (true);

alter table subscription enable row level security;
create policy subscription_owner_read on subscription for select using (auth.uid() = user_id);
create policy subscription_owner_insert on subscription for insert with check (auth.uid() = user_id);
-- no client UPDATE policy: only approve_payment() (SECURITY DEFINER) may change status

alter table payment_transaction enable row level security;
create policy txn_owner_read on payment_transaction for select using (
  exists (select 1 from subscription where id = subscription_id and user_id = auth.uid())
);
create policy txn_owner_insert on payment_transaction for insert with check (
  exists (select 1 from subscription where id = subscription_id and user_id = auth.uid())
);
create policy txn_owner_submit on payment_transaction for update using (
  exists (select 1 from subscription where id = subscription_id and user_id = auth.uid())
) with check (status = 'submitted');
