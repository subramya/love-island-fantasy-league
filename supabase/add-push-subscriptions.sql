create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references league_users(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);
