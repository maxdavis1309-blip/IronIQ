-- Demo seed shape for local Supabase. Replace the user_id with an auth.users id after creating a user.
-- The app currently uses in-memory TypeScript seed data in src/data/seed.ts.

insert into public.exercise_catalog (user_id, exercise_name, normalized_name, muscle_group, movement_pattern, equipment, is_custom)
values
  ('00000000-0000-0000-0000-000000000000', 'Bench Press', 'bench press', 'chest', 'horizontal press', 'barbell', false),
  ('00000000-0000-0000-0000-000000000000', 'Squat', 'squat', 'legs', 'squat', 'barbell', false),
  ('00000000-0000-0000-0000-000000000000', 'Romanian Deadlift', 'romanian deadlift', 'posterior chain', 'hinge', 'barbell', false),
  ('00000000-0000-0000-0000-000000000000', 'Pullup', 'pullup', 'back', 'vertical pull', 'bodyweight', false)
on conflict do nothing;
