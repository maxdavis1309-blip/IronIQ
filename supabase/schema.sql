create extension if not exists "pgcrypto";

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  display_name text,
  height text,
  bodyweight numeric,
  units text default 'lb' check (units in ('lb', 'kg')),
  goal text,
  training_split text,
  experience_level text,
  equipment text[] default '{}',
  injury_notes text[] default '{}',
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  workout_date date not null default current_date,
  raw_text text not null,
  workout_type text,
  ai_summary text,
  energy_level text,
  sleep_quality text,
  soreness_notes text,
  pain_notes text,
  parser_confidence numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  workout_id uuid references public.workout_logs(id) on delete cascade,
  exercise_name text not null,
  normalized_exercise_name text not null,
  set_number integer,
  weight numeric,
  reps integer,
  sets_count integer,
  rpe numeric,
  rir numeric,
  is_warmup boolean default false,
  is_pr boolean default false,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.exercise_catalog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  exercise_name text not null,
  normalized_name text not null,
  muscle_group text,
  movement_pattern text,
  equipment text,
  is_custom boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date date not null default current_date,
  bodyweight numeric,
  sleep_hours numeric,
  sleep_quality text,
  energy_level text,
  stress_level text,
  soreness text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.ai_parse_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  workout_id uuid references public.workout_logs(id) on delete set null,
  raw_input text not null,
  parsed_json jsonb not null,
  confidence numeric,
  model_used text default 'mock-parser-v1',
  created_at timestamptz default now()
);

create table if not exists public.training_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date date not null default current_date,
  recommendation_json jsonb not null,
  explanation text,
  accepted boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.app_sync_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workouts jsonb not null default '[]'::jsonb,
  active_workout jsonb,
  recovery_entries jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);

alter table public.user_profiles enable row level security;
alter table public.workout_logs enable row level security;
alter table public.exercise_sets enable row level security;
alter table public.exercise_catalog enable row level security;
alter table public.body_metrics enable row level security;
alter table public.coach_messages enable row level security;
alter table public.ai_parse_events enable row level security;
alter table public.training_recommendations enable row level security;
alter table public.app_sync_states enable row level security;

create policy "Users manage own profile" on public.user_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own workouts" on public.workout_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own sets" on public.exercise_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own catalog" on public.exercise_catalog
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own body metrics" on public.body_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own coach messages" on public.coach_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own parse events" on public.ai_parse_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own recommendations" on public.training_recommendations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own app sync state" on public.app_sync_states
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists workout_logs_user_date_idx on public.workout_logs(user_id, workout_date desc);
create index if not exists exercise_sets_user_exercise_idx on public.exercise_sets(user_id, normalized_exercise_name);
create index if not exists body_metrics_user_date_idx on public.body_metrics(user_id, date desc);
