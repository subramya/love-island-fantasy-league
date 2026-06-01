create table if not exists league_users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  email text unique,
  created_at timestamp default now()
);

drop table if exists scores;
drop table if exists predictions;

create table predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references league_users(id),
  round_id uuid references rounds(id),
  prediction_role text,
  contestant_1_id uuid references contestants(id),
  contestant_2_id uuid references contestants(id),
  created_at timestamp default now()
);

create table scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references league_users(id),
  round_id uuid references rounds(id),
  points int default 0,
  created_at timestamp default now()
);
