create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  role          text check (role in ('student','parent','teacher','admin')),
  auth_provider text check (auth_provider in ('google','password')),
  created_at    timestamptz default now()
);

-- Mirrors auth.users -> public.users the moment GoTrue creates an account.
-- role stays NULL until the user completes onboarding (see 0002).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table teacher_profile (
  user_id           uuid primary key references users(id) on delete cascade,
  name              text not null,
  photo_url         text,
  bio               text,
  subjects          text[] not null default '{}',
  city              text,
  pincode           text,
  rate_per_hour     numeric(8,2),
  experience_years  int,
  contact_email     text,
  contact_phone     text,
  is_listed         boolean default true,
  is_subscribed     boolean default false,
  subscription_expires_at timestamptz,
  created_at        timestamptz default now()
);
create index idx_teacher_subjects on teacher_profile using gin (subjects);
create index idx_teacher_city on teacher_profile (city) where is_listed;

create table parent_profile (
  user_id uuid primary key references users(id) on delete cascade,
  name    text
);

create table student_profile (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references users(id) on delete cascade,
  name       text,
  grade      text
);
create index idx_student_parent on student_profile (parent_id);

create table review (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid references teacher_profile(user_id) on delete cascade,
  reviewer_id  uuid references users(id) on delete cascade,
  rating       int check (rating between 1 and 5),
  comment      text,
  created_at   timestamptz default now(),
  unique (teacher_id, reviewer_id)
);
create index idx_review_teacher on review (teacher_id);

create table contact_request (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid references teacher_profile(user_id) on delete cascade,
  requester_id uuid references users(id) on delete cascade,
  created_at   timestamptz default now()
);
create index idx_contact_requester_month on contact_request (requester_id, created_at);

-- is_admin() does NOT live here (see 0005_profile_lifecycle_admin.sql
-- instead) — a second real ordering bug found the same way as the first:
-- it also references `users.deleted_at`, which isn't added until 0005.
-- LANGUAGE SQL functions are parsed at CREATE time (see 0000_bootstrap.sql's
-- note), so it must be defined after both of its dependencies exist —
-- `users` (this file) AND `users.deleted_at` (0005).
