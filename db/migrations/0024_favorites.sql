-- P3: saved/favorite teachers. Any signed-in user can save a teacher and
-- see their saved list later — no restriction on role (a teacher favoriting
-- another teacher is harmless, not worth a special case).
create table favorite_teacher (
  user_id     uuid references users(id) on delete cascade,
  teacher_id  uuid references teacher_profile(user_id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (user_id, teacher_id)
);

alter table favorite_teacher enable row level security;
create policy favorite_teacher_own_read on favorite_teacher for select using (auth.uid() = user_id);
create policy favorite_teacher_own_insert on favorite_teacher for insert with check (auth.uid() = user_id);
create policy favorite_teacher_own_delete on favorite_teacher for delete using (auth.uid() = user_id);

grant select, insert, delete on favorite_teacher to authenticated;
