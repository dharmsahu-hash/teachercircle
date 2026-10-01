-- Growth ideas #2 and #3: how a teacher teaches (home visits, online, or
-- both) and what they teach beyond subject (classes, boards, exams). These
-- drive new landing pages (/tutors/online/<subject>,
-- /tutors/exam/<exam>/<subject>, /tutors/<city>/<subject>/class-<n>), so the
-- values are a fixed vocabulary enforced here. The same lists live in
-- lib/levels.ts — keep them in sync.
--
-- Existing teachers default to 'home' with no classes/boards/exams, which is
-- exactly what they had before: nothing about them changes until they edit
-- their profile.

alter table teacher_profile
  add column if not exists teaching_mode text not null default 'home',
  add column if not exists classes text[] not null default '{}',
  add column if not exists boards text[] not null default '{}',
  add column if not exists exams text[] not null default '{}';

alter table teacher_profile drop constraint if exists teacher_profile_teaching_mode_check;
alter table teacher_profile add constraint teacher_profile_teaching_mode_check
  check (teaching_mode in ('home', 'online', 'both'));

alter table teacher_profile drop constraint if exists teacher_profile_classes_check;
alter table teacher_profile add constraint teacher_profile_classes_check
  check (classes <@ array['1','2','3','4','5','6','7','8','9','10','11','12']::text[]);

alter table teacher_profile drop constraint if exists teacher_profile_boards_check;
alter table teacher_profile add constraint teacher_profile_boards_check
  check (boards <@ array['cbse','icse','state','ib','igcse','nios']::text[]);

alter table teacher_profile drop constraint if exists teacher_profile_exams_check;
alter table teacher_profile add constraint teacher_profile_exams_check
  check (exams <@ array['jee','neet','cuet','olympiad','ntse','nda','ielts']::text[]);

-- Same view as 0022 with the four new columns appended (create or replace
-- may only add columns at the end).
create or replace view teacher_public as
select
  tp.user_id,
  tp.name,
  tp.photo_url,
  tp.bio,
  tp.subjects,
  tp.city,
  tp.pincode,
  tp.rate_per_hour,
  tp.experience_years,
  tp.is_subscribed,
  coalesce(avg(r.rating), 0)::numeric(3,2) as avg_rating,
  count(r.id) as review_count,
  u.avatar_url,
  u.avatar_seed,
  tp.self_attested_at,
  rt.avg_response_hours,
  rt.replied_conversation_count,
  tp.teaching_mode,
  tp.classes,
  tp.boards,
  tp.exams
from teacher_profile tp
join users u on u.id = tp.user_id
left join review r on r.teacher_id = tp.user_id
left join teacher_response_time rt on rt.teacher_id = tp.user_id
where tp.is_listed and tp.deleted_at is null
group by tp.user_id, u.avatar_url, u.avatar_seed, rt.avg_response_hours, rt.replied_conversation_count;

grant select on teacher_public to anon, authenticated;
