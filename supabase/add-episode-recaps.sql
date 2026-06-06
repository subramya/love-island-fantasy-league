create table if not exists episode_recaps (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null unique references rounds(id),
  headline text,
  recap_text text not null,
  created_at timestamp default now(),
  updated_at timestamp default now()
);
