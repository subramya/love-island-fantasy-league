create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references league_users(id),
  user_name text not null,
  message text not null,
  created_at timestamp default now()
);
