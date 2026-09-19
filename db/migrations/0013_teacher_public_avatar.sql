-- Surfaces a teacher's own avatar (chosen free avatar, or their Google photo)
-- on their public listing — search results and profile currently show a
-- name with no visual identity at all. Safe to expose here: this view only
-- ever contains teacher_profile rows (never students/parents), and a
-- teacher's photo is exactly the kind of trust signal a public listing
-- should show. Still no email/other PII added — see 0004's own note on why
-- `users` has no public-read policy.
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
  -- Appended at the end, not interleaved above: Postgres' CREATE OR REPLACE
  -- VIEW only allows adding columns after the existing ones, not changing
  -- the position/name of columns already there (found running this for real
  -- — it errors with "cannot change name of view column ... to ...").
  u.avatar_url,
  u.avatar_seed
from teacher_profile tp
join users u on u.id = tp.user_id
left join review r on r.teacher_id = tp.user_id
where tp.is_listed and tp.deleted_at is null
group by tp.user_id, u.avatar_url, u.avatar_seed;

grant select on teacher_public to anon, authenticated;
