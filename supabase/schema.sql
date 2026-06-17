create extension if not exists pgcrypto;

create table if not exists contestants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text default 'active',
  contestant_type text default 'original_islander',
  image_url text,
  created_at timestamp default now()
);

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  prediction_type text not null,
  bombshell_contestant_id uuid references contestants(id),
  status text default 'open',
  prediction_deadline timestamp,
  created_at timestamp default now()
);

create table if not exists round_prediction_modules (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id),
  prediction_type text not null,
  title text,
  sort_order int default 0,
  created_at timestamp default now()
);

create table if not exists round_bombshells (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  module_id uuid references round_prediction_modules(id),
  bombshell_contestant_id uuid references contestants(id),
  created_at timestamp default now()
);

create table if not exists round_questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  module_id uuid references round_prediction_modules(id),
  question_text text not null,
  answer_type text default 'islander',
  question_order int default 0,
  created_at timestamp default now()
);

create table if not exists round_tracker_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  contestant_id uuid references contestants(id),
  tracker_state text not null,
  partner_contestant_id uuid references contestants(id),
  created_at timestamp default now()
);

create table if not exists episode_recaps (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null unique references rounds(id),
  headline text,
  recap_text text not null,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists league_users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  email text unique,
  created_at timestamp default now()
);

create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references league_users(id),
  round_id uuid references rounds(id),
  module_id uuid references round_prediction_modules(id),
  prediction_role text,
  round_question_id uuid references round_questions(id),
  bombshell_contestant_id uuid references contestants(id),
  contestant_1_id uuid references contestants(id),
  contestant_2_id uuid references contestants(id),
  created_at timestamp default now()
);

create table if not exists actual_couples (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  module_id uuid references round_prediction_modules(id),
  contestant_1_id uuid references contestants(id),
  contestant_2_id uuid references contestants(id),
  created_at timestamp default now()
);

create table if not exists round_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  module_id uuid references round_prediction_modules(id),
  result_type text not null,
  round_question_id uuid references round_questions(id),
  bombshell_contestant_id uuid references contestants(id),
  contestant_id uuid references contestants(id),
  contestant_2_id uuid references contestants(id),
  created_at timestamp default now()
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references league_users(id),
  round_id uuid references rounds(id),
  points int default 0,
  created_at timestamp default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references league_users(id),
  user_name text not null,
  message_type text default 'user',
  reply_to_message_id uuid references chat_messages(id),
  message text not null,
  created_at timestamp default now()
);
