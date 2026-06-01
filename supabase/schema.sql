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
  prediction_role text,
  contestant_1_id uuid references contestants(id),
  contestant_2_id uuid references contestants(id),
  created_at timestamp default now()
);

create table if not exists actual_couples (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  contestant_1_id uuid references contestants(id),
  contestant_2_id uuid references contestants(id),
  created_at timestamp default now()
);

create table if not exists round_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  result_type text not null,
  contestant_id uuid references contestants(id),
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
  message text not null,
  created_at timestamp default now()
);
