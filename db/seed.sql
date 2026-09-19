-- Dummy data for local demo/search testing. Safe to re-run (every insert is
-- idempotent). Fixed literal UUIDs (not gen_random_uuid()) so re-running
-- this script doesn't create duplicates.
--
-- Run with:
--   docker compose exec -T postgres psql -h 127.0.0.1 -U teachercircle -d postgres < db/seed.sql
--
-- These are directory listings only (like admin_add_teacher creates) — no
-- login exists for any of them.

insert into users (id, email, role, full_name) values
  ('a0000000-0000-0000-0000-000000000001', 'meera.rao@seed.teachercircle.local', 'teacher', 'Meera Rao'),
  ('a0000000-0000-0000-0000-000000000002', 'arjun.patel@seed.teachercircle.local', 'teacher', 'Arjun Patel'),
  ('a0000000-0000-0000-0000-000000000003', 'fatima.sheikh@seed.teachercircle.local', 'teacher', 'Fatima Sheikh'),
  ('a0000000-0000-0000-0000-000000000004', 'rohan.desai@seed.teachercircle.local', 'teacher', 'Rohan Desai'),
  ('a0000000-0000-0000-0000-000000000005', 'priya.nair@seed.teachercircle.local', 'teacher', 'Priya Nair'),
  ('a0000000-0000-0000-0000-000000000006', 'vikram.singh@seed.teachercircle.local', 'teacher', 'Vikram Singh'),
  ('a0000000-0000-0000-0000-000000000007', 'ananya.iyer@seed.teachercircle.local', 'teacher', 'Ananya Iyer'),
  ('a0000000-0000-0000-0000-000000000008', 'karan.mehta@seed.teachercircle.local', 'teacher', 'Karan Mehta'),
  ('a0000000-0000-0000-0000-000000000009', 'sneha.joshi@seed.teachercircle.local', 'teacher', 'Sneha Joshi'),
  ('a0000000-0000-0000-0000-000000000010', 'imran.khan@seed.teachercircle.local', 'teacher', 'Imran Khan'),
  ('a0000000-0000-0000-0000-000000000011', 'divya.reddy@seed.teachercircle.local', 'teacher', 'Divya Reddy'),
  ('a0000000-0000-0000-0000-000000000012', 'aditya.kulkarni@seed.teachercircle.local', 'teacher', 'Aditya Kulkarni'),
  ('a0000000-0000-0000-0000-000000000013', 'neha.gupta@seed.teachercircle.local', 'teacher', 'Neha Gupta'),
  ('a0000000-0000-0000-0000-000000000014', 'sameer.ali@seed.teachercircle.local', 'teacher', 'Sameer Ali')
on conflict (id) do nothing;

insert into teacher_profile (user_id, name, bio, subjects, city, pincode, rate_per_hour, experience_years, contact_email, contact_phone, is_listed) values
  ('a0000000-0000-0000-0000-000000000001', 'Meera Rao', 'IIT-JEE Maths specialist, 8 years coaching senior secondary students.', ARRAY['Maths','Physics'], 'Pune', '411001', 600, 8, 'meera.rao@seed.teachercircle.local', '9800000001', true),
  ('a0000000-0000-0000-0000-000000000002', 'Arjun Patel', 'Loves making Chemistry click for board-exam students.', ARRAY['Chemistry','Biology'], 'Mumbai', '400001', 550, 6, 'arjun.patel@seed.teachercircle.local', '9800000002', true),
  ('a0000000-0000-0000-0000-000000000003', 'Fatima Sheikh', 'English literature and creative writing, CBSE and ICSE.', ARRAY['English','Hindi'], 'Bengaluru', '560001', 500, 5, 'fatima.sheikh@seed.teachercircle.local', '9800000003', true),
  ('a0000000-0000-0000-0000-000000000004', 'Rohan Desai', 'Full-stack web dev and DSA prep for college students.', ARRAY['Computer Science','Python Programming'], 'Delhi', '110001', 800, 4, 'rohan.desai@seed.teachercircle.local', '9800000004', true),
  ('a0000000-0000-0000-0000-000000000005', 'Priya Nair', 'NEET Biology coaching, 10+ years, 200+ students placed.', ARRAY['Biology','Chemistry'], 'Chennai', '600001', 700, 10, 'priya.nair@seed.teachercircle.local', '9800000005', true),
  ('a0000000-0000-0000-0000-000000000006', 'Vikram Singh', 'Physics for JEE Advanced — problem-solving focused.', ARRAY['Physics','Maths'], 'Hyderabad', '500001', 650, 7, 'vikram.singh@seed.teachercircle.local', '9800000006', true),
  ('a0000000-0000-0000-0000-000000000007', 'Ananya Iyer', 'Economics and Accountancy for commerce stream, class 11-12.', ARRAY['Economics','Accountancy'], 'Kolkata', '700001', 450, 5, 'ananya.iyer@seed.teachercircle.local', '9800000007', true),
  ('a0000000-0000-0000-0000-000000000008', 'Karan Mehta', 'History and Civics, storytelling-based teaching method.', ARRAY['History','English'], 'Ahmedabad', '380001', 400, 3, 'karan.mehta@seed.teachercircle.local', '9800000008', true),
  ('a0000000-0000-0000-0000-000000000009', 'Sneha Joshi', 'French language, DELF/DALF exam prep, beginner to advanced.', ARRAY['French'], 'Jaipur', '302001', 500, 6, 'sneha.joshi@seed.teachercircle.local', '9800000009', true),
  ('a0000000-0000-0000-0000-000000000010', 'Imran Khan', 'Classical and Hindustani vocal music, all ages.', ARRAY['Music'], 'Lucknow', '226001', 350, 12, 'imran.khan@seed.teachercircle.local', '9800000010', true),
  ('a0000000-0000-0000-0000-000000000011', 'Divya Reddy', 'Maths foundation building for classes 6-10.', ARRAY['Maths'], 'Chandigarh', '160001', 400, 4, 'divya.reddy@seed.teachercircle.local', '9800000011', true),
  ('a0000000-0000-0000-0000-000000000012', 'Aditya Kulkarni', 'Competitive programming coach, ICPC finalist.', ARRAY['Computer Science','Maths'], 'Kochi', '682001', 750, 3, 'aditya.kulkarni@seed.teachercircle.local', '9800000012', true),
  ('a0000000-0000-0000-0000-000000000013', 'Neha Gupta', 'Sketching, painting and portfolio prep for design entrance exams.', ARRAY['Art'], 'Indore', '452001', 450, 9, 'neha.gupta@seed.teachercircle.local', '9800000013', true),
  ('a0000000-0000-0000-0000-000000000014', 'Sameer Ali', 'Spoken English and IELTS/TOEFL coaching.', ARRAY['English'], 'Nagpur', '440001', 500, 5, 'sameer.ali@seed.teachercircle.local', '9800000014', true)
on conflict (user_id) do nothing;

-- A couple of reviewer accounts + logged connections so a handful of
-- teachers show real ratings in search, not just "no reviews yet".
insert into users (id, email, role, full_name) values
  ('b0000000-0000-0000-0000-000000000001', 'demo.parent@seed.teachercircle.local', 'parent', 'Demo Parent'),
  ('b0000000-0000-0000-0000-000000000002', 'demo.student@seed.teachercircle.local', 'student', 'Demo Student')
on conflict (id) do nothing;

insert into contact_request (id, teacher_id, requester_id) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into review (id, teacher_id, reviewer_id, rating, comment) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 5, 'Explained calculus so much better than school. Highly recommend.'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 5, 'My daughter''s NEET biology scores went up a full grade.'),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 4, 'Great at explaining DSA concepts, a bit fast-paced for beginners.'),
  ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000002', 5, 'Helped me crack my first competitive programming contest!')
on conflict (teacher_id, reviewer_id) do nothing;
