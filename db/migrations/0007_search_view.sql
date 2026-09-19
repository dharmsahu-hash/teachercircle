-- Read-model for search: pre-joins the rating aggregate so the search page is
-- one query instead of N+1. Filters is_listed/deleted_at explicitly in the
-- view body rather than relying on the base table's RLS to do it, since a
-- view's permission semantics are subtler than a plain table's.
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
  count(r.id) as review_count
from teacher_profile tp
left join review r on r.teacher_id = tp.user_id
where tp.is_listed and tp.deleted_at is null
group by tp.user_id;

grant select on teacher_public to anon, authenticated;
